import type { SessionMetadata, UIMessage, UIPart, UIState, UITodo, UIFileDiff, SessionStatus } from "./types.js"

export function createInitialState(session: SessionMetadata): UIState {
	return {
		session,
		messages: [],
		todos: [],
		fileDiffs: [],
		isSyncing: false,
		lastUpdated: Date.now(),
	}
}

export function updateMessage(state: UIState, messageID: string, message: UIMessage): UIState {
	const existingIndex = state.messages.findIndex(m => m.id === messageID)
	const newMessages = [...state.messages]

	if (existingIndex >= 0) {
		newMessages[existingIndex] = message
	} else {
		newMessages.push(message)
	}

	return {
		...state,
		messages: newMessages,
		lastUpdated: Date.now(),
	}
}

export function updatePart(state: UIState, messageID: string, partID: string, part: UIPart): UIState {
	const newMessages = state.messages.map(message => {
		if (message.id !== messageID) return message

		const existingPartIndex = message.parts.findIndex(p => p.id === partID)
		const newParts = [...message.parts]

		if (existingPartIndex >= 0) {
			newParts[existingPartIndex] = part
		} else {
			newParts.push(part)
		}

		return { ...message, parts: newParts }
	})

	return {
		...state,
		messages: newMessages,
		lastUpdated: Date.now(),
	}
}

export function applyPartDelta(state: UIState, messageID: string, partID: string, field: string, delta: string): UIState {
	const newMessages = state.messages.map(message => {
		if (message.id !== messageID) return message

		const newParts = message.parts.map(part => {
			if (part.id !== partID) return part

			if (field === 'text' && 'text' in part && typeof part.text === 'string') {
				return { ...part, text: part.text + delta }
			}

			return part
		})

		return { ...message, parts: newParts }
	})

	return {
		...state,
		messages: newMessages,
		lastUpdated: Date.now(),
	}
}

export function removePart(state: UIState, messageID: string, partID: string): UIState {
	const newMessages = state.messages.map(message => {
		if (message.id !== messageID) return message

		const filteredParts = message.parts.filter(p => p.id !== partID)
		return { ...message, parts: filteredParts }
	})

	return {
		...state,
		messages: newMessages,
		lastUpdated: Date.now(),
	}
}

export function updateStatus(state: UIState, status: SessionStatus): UIState {
	return {
		...state,
		session: { ...state.session, status },
		lastUpdated: Date.now(),
	}
}

export function updateTodos(state: UIState, todos: UITodo[]): UIState {
	return {
		...state,
		todos,
		lastUpdated: Date.now(),
	}
}

export function updateFileDiffs(state: UIState, diffs: UIFileDiff[]): UIState {
	return {
		...state,
		fileDiffs: diffs,
		lastUpdated: Date.now(),
	}
}

export function setSyncing(state: UIState, isSyncing: boolean): UIState {
	return {
		...state,
		isSyncing,
	}
}
