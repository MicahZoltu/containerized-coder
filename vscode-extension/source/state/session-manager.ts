import type { OpencodeClient, Event as SdkEvent, SessionStatus as SdkSessionStatus, Message, Part, Todo, FileDiff, Session } from "@opencode-ai/sdk/v2"
import { adaptSessionMetadata, adaptMessages, adaptTodos, adaptFileDiffs, adaptPart, adaptMessage } from "./session-adapter.js"
import type { UIState } from "./types.js"
import { adaptSessionStatus } from "./types.js"
import { createInitialState, updateMessage, updatePart, applyPartDelta, removePart, updateStatus, updateTodos, updateFileDiffs, setSyncing } from "./session-store.js"

type Subscriber = (state: UIState) => void

export interface SessionStateManagerInterface {
	setClient(client: OpencodeClient): void
	initializeSession(sessionID: string): Promise<void>
	disposeSession(sessionID: string): void
	subscribe(sessionID: string, callback: Subscriber): () => void
	getState(sessionID: string): UIState | undefined
	handleEvent(event: SdkEvent): void
	start(): void
	stop(): void
}

interface SessionData {
	state: UIState
	subscribers: Set<Subscriber>
	syncTimer: NodeJS.Timeout | null
}

export class SessionStateManager implements SessionStateManagerInterface {
	private store: Map<string, SessionData> = new Map()
	private client: OpencodeClient | null = null
	private started: boolean = false

	constructor() {}

	setClient(client: OpencodeClient): void {
		this.client = client
	}

	async initializeSession(sessionID: string): Promise<void> {
		if (!this.client) {
			throw new Error("SDK client not initialized")
		}

		const state = setSyncing(createInitialState({ id: sessionID, title: '', directory: '', status: 'idle', created: 0, updated: 0 }), true)
		this.store.set(sessionID, { state, subscribers: new Set(), syncTimer: null })

		try {
			const [sessionRes, messagesRes, todosRes, diffsRes, statusRes] = await Promise.all([
				this.client.session.get({ sessionID }),
				this.client.session.messages({ sessionID }),
				this.client.session.todo({ sessionID }),
				this.client.session.diff({ sessionID }),
				this.client.session.status({}),
			])

			const sessionData = sessionRes.data
			const messagesWithParts = messagesRes.data ?? []
			const messagesData = messagesWithParts.map(m => 'info' in m ? m.info : m)
			const allParts = messagesWithParts.flatMap(m => 'parts' in m ? m.parts ?? [] : [])
			const todosData = todosRes.data ?? []
			const diffsData = diffsRes.data ?? []
			const statusData = statusRes.data?.[sessionID]

			if (!sessionData || !statusData) {
				throw new Error(`Session ${sessionID} not found`)
			}

			const adaptedState = this.adaptFullState(sessionData, statusData, messagesData, allParts, todosData, diffsData)
			this.updateState(sessionID, adaptedState)

			this.startPeriodicSync(sessionID)
		} catch (error) {
			const currentState = this.getState(sessionID)
			if (currentState) {
				this.updateState(sessionID, setSyncing(currentState, false))
			}
			throw error
		}
	}

	private adaptFullState(
		session: Session,
		status: SdkSessionStatus,
		messages: Message[],
		parts: Part[],
		todos: Todo[],
		diffs: FileDiff[],
	): UIState {
		const sessionMetadata = adaptSessionMetadata(session, status)
		const initialState = createInitialState(sessionMetadata)

		const stateWithMessages = {
			...initialState,
			messages: adaptMessages(messages, parts),
		}

		const stateWithTodos = {
			...stateWithMessages,
			todos: adaptTodos(todos),
		}

		return {
			...stateWithTodos,
			fileDiffs: adaptFileDiffs(diffs),
		}
	}

	disposeSession(sessionID: string): void {
		const sessionData = this.store.get(sessionID)
		if (!sessionData) return

		if (sessionData.syncTimer) {
			clearInterval(sessionData.syncTimer)
			sessionData.syncTimer = null
		}

		sessionData.subscribers.clear()
		this.store.delete(sessionID)
	}

	subscribe(sessionID: string, callback: Subscriber): () => void {
		const sessionData = this.store.get(sessionID)
		if (!sessionData) {
			return () => {}
		}

		sessionData.subscribers.add(callback)

		const currentState = sessionData.state
		callback(currentState)

		return () => {
			sessionData.subscribers.delete(callback)
			if (sessionData.subscribers.size === 0) {
				this.disposeSession(sessionID)
			}
		}
	}

	getState(sessionID: string): UIState | undefined {
		const sessionData = this.store.get(sessionID)
		return sessionData?.state
	}

	handleEvent(event: SdkEvent): void {
		switch (event.type) {
			case "message.updated": {
				const messageID = event.properties.info.id
				const sessionID = event.properties.info.sessionID
				this.handleMessageUpdated(sessionID, messageID)
				break
			}

			case "message.part.updated": {
				const sessionID = event.properties.part.sessionID
				const messageID = event.properties.part.messageID
				const partID = event.properties.part.id
				this.handlePartUpdated(sessionID, messageID, partID, event.properties.part)
				break
			}

			case "message.part.delta": {
				const sessionID = event.properties.sessionID
				const messageID = event.properties.messageID
				const partID = event.properties.partID
				const field = event.properties.field
				const delta = event.properties.delta
				this.handlePartDelta(sessionID, messageID, partID, field, delta)
				break
			}

			case "message.part.removed": {
				const sessionID = event.properties.sessionID
				const messageID = event.properties.messageID
				const partID = event.properties.partID
				this.handlePartRemoved(sessionID, messageID, partID)
				break
			}

			case "session.status": {
				const sessionID = event.properties.sessionID
				const status = event.properties.status
				this.handleStatusUpdated(sessionID, status)
				break
			}

			case "session.idle": {
				const sessionID = event.properties.sessionID
				this.handleStatusUpdated(sessionID, { type: "idle" })
				break
			}

			case "todo.updated": {
				const sessionID = event.properties.sessionID
				const todos = event.properties.todos
				this.handleTodosUpdated(sessionID, todos)
				break
			}

			case "session.diff": {
				const sessionID = event.properties.sessionID
				const diffs = event.properties.diff
				this.handleDiffsUpdated(sessionID, diffs)
				break
			}

			case "session.deleted": {
				const sessionID = event.properties.info.id
				this.disposeSession(sessionID)
				break
			}

			case "session.compacted": {
				const sessionID = event.properties.sessionID
				this.refreshSession(sessionID)
				break
			}
		}
	}

	private async handleMessageUpdated(sessionID: string, messageID: string): Promise<void> {
		const sessionData = this.store.get(sessionID)
		if (!sessionData || !this.client) return

		try {
			const messageRes = await this.client.session.message({ sessionID, messageID })
			const messageData = messageRes.data
			if (!messageData || !('info' in messageData)) return

			const message = messageData.info
			const parts = messageData.parts ?? []
			const adaptedMessage = adaptMessage(message, parts)

			const newState = updateMessage(sessionData.state, messageID, adaptedMessage)
			this.updateState(sessionID, newState)
		} catch (error) {
			console.error(`Failed to fetch message ${messageID}:`, error)
		}
	}

	private handlePartUpdated(sessionID: string, messageID: string, partID: string, part: Part): void {
		const sessionData = this.store.get(sessionID)
		if (!sessionData) return

		const adaptedPart = adaptPart(part)
		const newState = updatePart(sessionData.state, messageID, partID, adaptedPart)
		this.updateState(sessionID, newState)
	}

	private handlePartDelta(sessionID: string, messageID: string, partID: string, field: string, delta: string): void {
		const sessionData = this.store.get(sessionID)
		if (!sessionData) return

		const newState = applyPartDelta(sessionData.state, messageID, partID, field, delta)
		this.updateState(sessionID, newState)
	}

	private handlePartRemoved(sessionID: string, messageID: string, partID: string): void {
		const sessionData = this.store.get(sessionID)
		if (!sessionData) return

		const newState = removePart(sessionData.state, messageID, partID)
		this.updateState(sessionID, newState)
	}

	private handleStatusUpdated(sessionID: string, status: SdkSessionStatus): void {
		const sessionData = this.store.get(sessionID)
		if (!sessionData) return

		const adaptedStatus = adaptSessionStatus(status)
		const newState = updateStatus(sessionData.state, adaptedStatus)
		this.updateState(sessionID, newState)
	}

	private handleTodosUpdated(sessionID: string, todos: Todo[]): void {
		const sessionData = this.store.get(sessionID)
		if (!sessionData) return

		const adaptedTodos = adaptTodos(todos)
		const newState = updateTodos(sessionData.state, adaptedTodos)
		this.updateState(sessionID, newState)
	}

	private handleDiffsUpdated(sessionID: string, diffs: FileDiff[]): void {
		const sessionData = this.store.get(sessionID)
		if (!sessionData) return

		const adaptedDiffs = adaptFileDiffs(diffs)
		const newState = updateFileDiffs(sessionData.state, adaptedDiffs)
		this.updateState(sessionID, newState)
	}



	private updateState(sessionID: string, newState: UIState): void {
		const sessionData = this.store.get(sessionID)
		if (!sessionData) return

		sessionData.state = newState

		sessionData.subscribers.forEach(callback => {
			callback(newState)
		})
	}

	private startPeriodicSync(sessionID: string): void {
		const sessionData = this.store.get(sessionID)
		if (!sessionData) return

		if (sessionData.syncTimer) {
			clearInterval(sessionData.syncTimer)
		}

		sessionData.syncTimer = setInterval(() => {
			this.refreshSession(sessionID)
		}, 10000)
	}

	private async refreshSession(sessionID: string): Promise<void> {
		if (!this.client) return

		const sessionData = this.store.get(sessionID)
		if (!sessionData) return

		try {
			const [statusRes, messagesRes] = await Promise.all([
				this.client.session.status({}),
				this.client.session.messages({ sessionID }),
			])

			const currentStatus = statusRes.data?.[sessionID]
			const currentMessages = messagesRes.data ?? []

			if (!currentStatus) return

			const localState = sessionData.state
			const statusChanged = adaptSessionStatus(currentStatus) !== localState.session.status
			const messageCountChanged = currentMessages.length !== localState.messages.length

			if (statusChanged || messageCountChanged) {
				await this.initializeSession(sessionID)
			}
		} catch (error) {
			console.error(`Failed to refresh session ${sessionID}:`, error)
		}
	}

	start(): void {
		if (!this.started) {
			this.started = true
		}
	}

	stop(): void {
		if (this.started) {
			this.started = false
			this.store.forEach(sessionData => {
				if (sessionData.syncTimer) {
					clearInterval(sessionData.syncTimer)
				}
			})
		}
	}
}
