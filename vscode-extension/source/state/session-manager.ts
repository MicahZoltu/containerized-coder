import type { FileDiff, Message, Part, Event as SdkEvent, SessionStatus as SdkSessionStatus, Session, Todo } from "@opencode-ai/sdk/v2"
import { FullSessionData, MessageWithParts, StatusAndMessages } from "./sdk-session-data-fetcher.js"
import { adaptFileDiffs, adaptMessage, adaptMessages, adaptPart, adaptSessionMetadata, adaptTodos } from "./session-adapter.js"
import { mapEventToAction, type SessionAction } from "./session-event-handler.js"
import { applyPartDelta, createInitialState, removePart, setSyncing, updateFileDiffs, updateMessage, updatePart, updateStatus, updateTodos } from "./session-store.js"
import type { UIState } from "./types.js"
import { adaptSessionStatus } from "./types.js"

type Subscriber = (state: UIState) => void

type Disposable = { dispose(): void }

type TimerFactory = (callback: () => void, intervalMs: number) => Disposable

function defaultTimerFactory(callback: () => void, intervalMilliseconds: number) {
	const id = setInterval(callback, intervalMilliseconds)
	return { dispose: () => clearInterval(id) }
}

export interface SessionStateManagerInterface {
	initializeSession(sessionID: string): Promise<void>
	disposeSession(sessionID: string): void
	subscribe(sessionID: string, callback: Subscriber): () => void
	getState(sessionID: string): UIState | undefined
	handleEvent(event: SdkEvent): void
	dispose(): void
}

interface SessionData {
	state: UIState
	subscribers: Set<Subscriber>
	syncTimer: Disposable | null
}

function adaptFullState(session: Session, status: SdkSessionStatus, messages: Message[], parts: Part[], todos: Todo[], diffs: FileDiff[]): UIState {
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

export async function createSessionStateManager(fetchFullSession: (sessionID: string) => Promise<FullSessionData>, fetchMessage: (sessionID: string, messageID: string) => Promise<MessageWithParts | null>, fetchStatusAndMessages: (sessionID: string) => Promise<StatusAndMessages>, timerFactory: TimerFactory = defaultTimerFactory): Promise<SessionStateManagerInterface> {
	const store = new Map<string, SessionData>()

	async function initializeSession(sessionID: string): Promise<void> {
		const state = setSyncing(createInitialState({ id: sessionID, title: '', directory: '', status: 'idle', created: 0, updated: 0 }), true)
		store.set(sessionID, { state, subscribers: new Set<Subscriber>(), syncTimer: null })

		try {
			const fullData = await fetchFullSession(sessionID)
			const adaptedState = adaptFullState(fullData.session, fullData.status, fullData.messages, fullData.parts, fullData.todos, fullData.diffs)
			updateState(sessionID, adaptedState)

			startPeriodicSync(sessionID)
		} catch (error) {
			const currentState = getState(sessionID)
			if (currentState) {
				updateState(sessionID, setSyncing(currentState, false))
			}
			throw error
		}
	}

	function disposeSession(sessionID: string): void {
		const sessionData = store.get(sessionID)
		if (!sessionData) return

		if (sessionData.syncTimer) {
			sessionData.syncTimer.dispose()
			sessionData.syncTimer = null
		}

		sessionData.subscribers.clear()
		store.delete(sessionID)
	}

	function subscribe(sessionID: string, callback: Subscriber): () => void {
		const sessionData = store.get(sessionID)
		if (!sessionData) {
			return () => {}
		}

		sessionData.subscribers.add(callback)

		const currentState = sessionData.state
		callback(currentState)

		return () => {
			sessionData.subscribers.delete(callback)
			if (sessionData.subscribers.size === 0) {
				disposeSession(sessionID)
			}
		}
	}

	function getState(sessionID: string): UIState | undefined {
		const sessionData = store.get(sessionID)
		return sessionData?.state
	}

	function handleEvent(event: SdkEvent): void {
		const action = mapEventToAction(event)
		if (!action) return
		executeAction(action)
	}

	function executeAction(action: SessionAction): void {
		switch (action.type) {
			case "message-updated":
				handleMessageUpdated(action.sessionID, action.messageID)
				break
			case "part-updated":
				handlePartUpdated(action.sessionID, action.messageID, action.partID, action.part)
				break
			case "part-delta":
				handlePartDelta(action.sessionID, action.messageID, action.partID, action.field, action.delta)
				break
			case "part-removed":
				handlePartRemoved(action.sessionID, action.messageID, action.partID)
				break
			case "status-updated":
				handleStatusUpdated(action.sessionID, action.status)
				break
			case "todos-updated":
				handleTodosUpdated(action.sessionID, action.todos)
				break
			case "diffs-updated":
				handleDiffsUpdated(action.sessionID, action.diffs)
				break
			case "session-deleted":
				disposeSession(action.sessionID)
				break
			case "session-compacted":
				refreshSession(action.sessionID)
				break
		}
	}

	async function handleMessageUpdated(sessionID: string, messageID: string): Promise<void> {
		const sessionData = store.get(sessionID)
		if (!sessionData) return

		try {
			const messageWithParts = await fetchMessage(sessionID, messageID)
			if (!messageWithParts) return

			const adaptedMessage = adaptMessage(messageWithParts.message, messageWithParts.parts)

			const newState = updateMessage(sessionData.state, messageID, adaptedMessage)
			updateState(sessionID, newState)
		} catch (error) {
			console.error(`Failed to fetch message ${messageID}:`, error)
		}
	}

	function handlePartUpdated(sessionID: string, messageID: string, partID: string, part: Part): void {
		const sessionData = store.get(sessionID)
		if (!sessionData) return

		const adaptedPart = adaptPart(part)
		const newState = updatePart(sessionData.state, messageID, partID, adaptedPart)
		updateState(sessionID, newState)
	}

	function handlePartDelta(sessionID: string, messageID: string, partID: string, field: string, delta: string): void {
		const sessionData = store.get(sessionID)
		if (!sessionData) return

		const newState = applyPartDelta(sessionData.state, messageID, partID, field, delta)
		updateState(sessionID, newState)
	}

	function handlePartRemoved(sessionID: string, messageID: string, partID: string): void {
		const sessionData = store.get(sessionID)
		if (!sessionData) return

		const newState = removePart(sessionData.state, messageID, partID)
		updateState(sessionID, newState)
	}

	function handleStatusUpdated(sessionID: string, status: SdkSessionStatus): void {
		const sessionData = store.get(sessionID)
		if (!sessionData) return

		const adaptedStatus = adaptSessionStatus(status)
		const newState = updateStatus(sessionData.state, adaptedStatus)
		updateState(sessionID, newState)
	}

	function handleTodosUpdated(sessionID: string, todos: Todo[]): void {
		const sessionData = store.get(sessionID)
		if (!sessionData) return

		const adaptedTodos = adaptTodos(todos)
		const newState = updateTodos(sessionData.state, adaptedTodos)
		updateState(sessionID, newState)
	}

	function handleDiffsUpdated(sessionID: string, diffs: FileDiff[]): void {
		const sessionData = store.get(sessionID)
		if (!sessionData) return

		const adaptedDiffs = adaptFileDiffs(diffs)
		const newState = updateFileDiffs(sessionData.state, adaptedDiffs)
		updateState(sessionID, newState)
	}

	function updateState(sessionID: string, newState: UIState): void {
		const sessionData = store.get(sessionID)
		if (!sessionData) return

		sessionData.state = newState

		sessionData.subscribers.forEach(callback => { callback(newState) })
	}

	function startPeriodicSync(sessionID: string): void {
		const sessionData = store.get(sessionID)
		if (!sessionData) return

		if (sessionData.syncTimer) {
			sessionData.syncTimer.dispose()
		}

		sessionData.syncTimer = timerFactory(() => { refreshSession(sessionID) }, 10000)
	}

	async function loadSessionData(sessionID: string): Promise<void> {
		const sessionData = store.get(sessionID)
		if (!sessionData) return

		try {
			const fullData = await fetchFullSession(sessionID)
			const adaptedState = adaptFullState(fullData.session, fullData.status, fullData.messages, fullData.parts, fullData.todos, fullData.diffs)
			updateState(sessionID, adaptedState)
		} catch (error) {
			console.error(`Failed to load session ${sessionID}:`, error)
		}
	}

	async function refreshSession(sessionID: string): Promise<void> {
		const sessionData = store.get(sessionID)
		if (!sessionData) return

		try {
			const { status, messages } = await fetchStatusAndMessages(sessionID)

			if (!status) return

			const localState = sessionData.state
			const statusChanged = adaptSessionStatus(status) !== localState.session.status
			const messageCountChanged = messages.length !== localState.messages.length

			if (statusChanged || messageCountChanged) {
				await loadSessionData(sessionID)
			}
		} catch (error) {
			console.error(`Failed to refresh session ${sessionID}:`, error)
		}
	}

	function dispose(): void {
		for (const [, sessionData] of store) {
			if (!sessionData.syncTimer) continue
			sessionData.syncTimer.dispose()
		}
	}

	return { initializeSession, disposeSession, subscribe, getState, handleEvent, dispose }
}
