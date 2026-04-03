import type { OpencodeClient, Event as SdkEvent, SessionStatus as SdkSessionStatus, Message, Part, Todo, FileDiff, Session } from "@opencode-ai/sdk/v2"
import { adaptSessionMetadata, adaptMessages, adaptTodos, adaptFileDiffs, adaptError } from "./session-adapter.js"
import type { UIState, SessionStatus, UIPart } from "./types.js"
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
			const messagesData = (messagesRes.data ?? []).map(m => 'info' in m ? m.info : m)
			const todosData = todosRes.data ?? []
			const diffsData = diffsRes.data ?? []
			const statusData = statusRes.data?.[sessionID]

			if (!sessionData || !statusData) {
				throw new Error(`Session ${sessionID} not found`)
			}

			const adaptedState = this.adaptFullState(sessionData, statusData, messagesData as any[], todosData, diffsData)
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
		todos: Todo[],
		diffs: FileDiff[],
	): UIState {
		const sessionMetadata = adaptSessionMetadata(session, status)
		const initialState = createInitialState(sessionMetadata)

		const stateWithMessages = {
			...initialState,
			messages: adaptMessages(messages, []),
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
		const eventType = event.type
		const properties = event.properties

		switch (eventType) {
			case "message.updated": {
				if (properties && typeof properties === 'object' && 'info' in properties && properties.info && typeof properties.info === 'object' && 'id' in properties.info && 'sessionID' in properties.info) {
					const messageID = (properties.info as any).id
					const sessionID = (properties.info as any).sessionID
					this.handleMessageUpdated(sessionID, messageID)
				}
				break
			}

			case "message.part.updated": {
				if (properties && typeof properties === 'object' && 'part' in properties && properties.part && typeof properties.part === 'object' && 'sessionID' in properties.part && 'messageID' in properties.part && 'id' in properties.part) {
					const sessionID = (properties.part as any).sessionID
					const messageID = (properties.part as any).messageID
					const partID = (properties.part as any).id
					this.handlePartUpdated(sessionID, messageID, partID, properties.part as any)
				}
				break
			}

			case "message.part.delta": {
				if ('sessionID' in properties && 'messageID' in properties && 'partID' in properties && 'field' in properties && 'delta' in properties) {
					const sessionID = properties.sessionID as string
					const messageID = properties.messageID as string
					const partID = properties.partID as string
					const field = properties.field as string
					const delta = properties.delta as string
					this.handlePartDelta(sessionID, messageID, partID, field, delta)
				}
				break
			}

			case "message.part.removed": {
				if ('sessionID' in properties && 'messageID' in properties && 'partID' in properties) {
					const sessionID = properties.sessionID as string
					const messageID = properties.messageID as string
					const partID = properties.partID as string
					this.handlePartRemoved(sessionID, messageID, partID)
				}
				break
			}

			case "session.status": {
				if ('sessionID' in properties && 'status' in properties) {
					const sessionID = properties.sessionID as string
					const status = properties.status as SdkSessionStatus
					this.handleStatusUpdated(sessionID, status)
				}
				break
			}

			case "session.idle": {
				if ('sessionID' in properties) {
					const sessionID = properties.sessionID as string
					this.handleStatusUpdated(sessionID, { type: "idle" })
				}
				break
			}

			case "todo.updated": {
				if ('sessionID' in properties && 'todos' in properties) {
					const sessionID = properties.sessionID as string
					const todos = properties.todos as Todo[]
					this.handleTodosUpdated(sessionID, todos)
				}
				break
			}

			case "session.diff": {
				if ('sessionID' in properties && 'diff' in properties) {
					const sessionID = properties.sessionID as string
					const diffs = properties.diff as FileDiff[]
					this.handleDiffsUpdated(sessionID, diffs)
				}
				break
			}

			case "session.deleted": {
				if (properties && typeof properties === 'object' && 'info' in properties && properties.info && typeof properties.info === 'object' && 'id' in properties.info) {
					const sessionID = (properties.info as any).id
					this.disposeSession(sessionID)
				}
				break
			}

			case "session.compacted": {
				if ('sessionID' in properties) {
					const sessionID = properties.sessionID as string
					this.refreshSession(sessionID)
				}
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
			const adaptedMessage = {
				id: message.id,
				role: message.role,
				parts: [] as any[],
				created: message.time.created,
			}
			if (message.role === "assistant" && 'completed' in message.time) {
				; (adaptedMessage as any).completed = message.time.completed
			}

			const newState = updateMessage(sessionData.state, messageID, adaptedMessage)
			this.updateState(sessionID, newState)
		} catch (error) {
			console.error(`Failed to fetch message ${messageID}:`, error)
		}
	}

	private handlePartUpdated(sessionID: string, messageID: string, partID: string, part: Part): void {
		const sessionData = this.store.get(sessionID)
		if (!sessionData) return

		const adaptedPart = this.adaptPart(part)
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

		const adaptedStatus = this.adaptSessionStatus(status)
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

	private adaptPart(part: Part): UIPart {
		const type = part.type
		switch (type) {
			case "text":
				return { id: part.id, type: "text", text: part.text }
			case "reasoning":
				return { id: part.id, type: "reasoning", text: part.text }
			case "tool":
				return { ...this.adaptToolPart(part.state), id: part.id }
			case "file": {
				const filePart: any = { id: part.id, type: "file", url: part.url, mime: part.mime }
				if (part.filename !== undefined) {
					filePart.filename = part.filename
				}
				return filePart
			}
			case "step-start":
				return { id: part.id, type: "step-start" }
			case "step-finish":
				return { id: part.id, type: "step-finish", reason: part.reason }
			case "snapshot":
				return { id: part.id, type: "snapshot", snapshot: part.snapshot }
			case "patch":
				return { id: part.id, type: "patch", hash: part.hash, files: part.files }
			case "agent":
				return { id: part.id, type: "agent", name: part.name }
			case "retry":
				return { id: part.id, type: "retry", attempt: part.attempt, error: adaptError(part.error) }
			case "compaction":
				return { id: part.id, type: "compaction", auto: part.auto }
			case "subtask":
				return { id: part.id, type: "subtask", prompt: part.prompt, description: part.description, agent: part.agent }
			default:
				return { id: (part as any).id, type: "text", text: "" }
		}
	}

	private adaptToolPart(state: any): any {
		const status = state.status
		switch (status) {
			case "pending":
				return { type: "tool", status: "pending" }
			case "running": {
				const runningPart: any = { type: "tool", status: "running" }
				if (state.title !== undefined) {
					runningPart.title = state.title
				}
				return runningPart
			}
			case "completed": {
				const completedPart: any = { type: "tool", status: "completed", output: state.output }
				if (state.title !== undefined) {
					completedPart.title = state.title
				}
				if (state.attachments !== undefined) {
					completedPart.attachments = state.attachments.map((a: Part) => this.adaptPart(a))
				}
				return completedPart
			}
			case "error":
				return { type: "tool", status: "error", error: state.error }
			default:
				return { type: "tool", status: "pending" }
		}
	}

	private adaptSessionStatus(status: SdkSessionStatus): SessionStatus {
		if (status.type === 'idle') return 'idle'
		if (status.type === 'busy') return 'busy'
		return 'retry'
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
			const statusChanged = this.adaptSessionStatus(currentStatus) !== localState.session.status
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
