import type { SessionMetadata, UIMessage, UIPart, UITodo, UIFileDiff } from "../../../source/state/types.js"
import { describe, expect, test } from "bun:test"
import {
	applyPartDelta,
	createInitialState,
	removePart,
	setSyncing,
	updateFileDiffs,
	updateMessage,
	updatePart,
	updateStatus,
	updateTodos,
} from "../../../source/state/session-store.js"

function createSessionMetadata(overrides: Partial<SessionMetadata> = {}): SessionMetadata {
	return {
		id: "session-1",
		title: "Test Session",
		directory: "/tmp/test",
		status: "idle",
		created: 1000,
		updated: 2000,
		...overrides,
	}
}

function createUIPart(overrides: Partial<{ id: string; type: 'text'; text: string }> = {}): { id: string; type: 'text'; text: string } {
	return {
		id: "part-1",
		type: "text",
		text: "Hello",
		...overrides,
	}
}

function createUIMessage(overrides: Partial<UIMessage> = {}): UIMessage {
	return {
		id: "msg-1",
		role: "user",
		parts: [],
		created: 1000,
		...overrides,
	}
}

function createUITodo(overrides: Partial<UITodo> = {}): UITodo {
	return {
		content: "Test task",
		status: "pending",
		priority: "high",
		...overrides,
	}
}

function createUIFileDiff(overrides: Partial<UIFileDiff> = {}): UIFileDiff {
	return {
		file: "test.txt",
		before: "old",
		after: "new",
		additions: 1,
		deletions: 1,
		status: "modified",
		...overrides,
	}
}

describe("createInitialState", () => {
	test("returns a UIState with the given session metadata, empty messages/todos/fileDiffs, isSyncing false, and a numeric lastUpdated", () => {
		const session = createSessionMetadata()
		const result = createInitialState(session)

		expect(result.session).toBe(session)
		expect(result.messages).toEqual([])
		expect(result.todos).toEqual([])
		expect(result.fileDiffs).toEqual([])
		expect(result.isSyncing).toBe(false)
		expect(typeof result.lastUpdated).toBe("number")
	})
})

describe("updateMessage", () => {
	test("Adding a new message (messageID not in state) appends it", () => {
		const state = createInitialState(createSessionMetadata())
		const message = createUIMessage({ id: "msg-new" })
		const result = updateMessage(state, message.id, message)

		expect(result.messages).toHaveLength(1)
		expect(result.messages[0]).toBe(message)
	})

	test("Updating an existing message (messageID already present) replaces it in place", () => {
		const originalMessage = createUIMessage({ id: "msg-1", parts: [createUIPart()] })
		const state = createInitialState(createSessionMetadata())
		state.messages = [originalMessage]

		const updatedMessage = createUIMessage({ id: "msg-1", parts: [createUIPart({ text: "Updated" })] })
		const result = updateMessage(state, updatedMessage.id, updatedMessage)

		expect(result.messages).toHaveLength(1)
		expect(result.messages[0]).toBe(updatedMessage)
	})

	test("Does not mutate the input state (verify originalState.messages is unchanged)", () => {
		const originalMessage = createUIMessage({ id: "msg-1", parts: [createUIPart()] })
		const state = createInitialState(createSessionMetadata())
		state.messages = [originalMessage]

		const newMessage = createUIMessage({ id: "msg-2" })
		updateMessage(state, newMessage.id, newMessage)

		expect(state.messages).toHaveLength(1)
		expect(state.messages[0]).toBe(originalMessage)
	})

	test("Updates lastUpdated", () => {
		const state = createInitialState(createSessionMetadata())
		const originalLastUpdated = state.lastUpdated
		const message = createUIMessage()

		const result = updateMessage(state, message.id, message)

		expect(result.lastUpdated).toBeGreaterThanOrEqual(originalLastUpdated)
	})
})

describe("updatePart", () => {
	test("Adding a new part to an existing message appends it", () => {
		const message = createUIMessage({ id: "msg-1", parts: [createUIPart({ id: "part-1" })] })
		const state = createInitialState(createSessionMetadata())
		state.messages = [message]

		const newPart = createUIPart({ id: "part-2", text: "New part" })
		const result = updatePart(state, message.id, newPart.id, newPart)

		const updatedMessage = result.messages.find(m => m.id === message.id)
		expect(updatedMessage?.parts).toHaveLength(2)
		expect(updatedMessage?.parts[1]).toBe(newPart)
	})

	test("Updating an existing part replaces it in place", () => {
		const originalPart = createUIPart({ id: "part-1", text: "Original" })
		const message = createUIMessage({ id: "msg-1", parts: [originalPart] })
		const state = createInitialState(createSessionMetadata())
		state.messages = [message]

		const updatedPart = createUIPart({ id: "part-1", text: "Updated" })
		const result = updatePart(state, message.id, updatedPart.id, updatedPart)

		const updatedMessage = result.messages.find(m => m.id === message.id)
		expect(updatedMessage?.parts).toHaveLength(1)
		expect(updatedMessage?.parts[0]).toBe(updatedPart)
	})

	test("Does nothing to messages that don't match the messageID", () => {
		const originalPart = createUIPart({ id: "part-1" })
		const message = createUIMessage({ id: "msg-1", parts: [originalPart] })
		const state = createInitialState(createSessionMetadata())
		state.messages = [message]

		const part = createUIPart({ id: "part-2" })
		const result = updatePart(state, "msg-different", part.id, part)

		expect(result.messages).toHaveLength(1)
		const firstMessage = result.messages[0]
		expect(firstMessage?.parts).toHaveLength(1)
		expect(firstMessage?.parts[0]).toBe(originalPart)
	})

	test("Does not mutate the input state", () => {
		const originalPart = createUIPart({ id: "part-1", text: "Original" })
		const message = createUIMessage({ id: "msg-1", parts: [originalPart] })
		const state = createInitialState(createSessionMetadata())
		state.messages = [message]

		const newPart = createUIPart({ id: "part-2" })
		updatePart(state, message.id, newPart.id, newPart)

		const firstMessage = state.messages[0]
		expect(firstMessage?.parts).toHaveLength(1)
		expect(firstMessage?.parts[0]).toBe(originalPart)
	})
})

describe("applyPartDelta", () => {
	test("Appends delta string to an existing text part's text field", () => {
		const textPart: UIPart = { id: "part-1", type: "text", text: "Hello" }
		const message = createUIMessage({ id: "msg-1", parts: [textPart] })
		const state = createInitialState(createSessionMetadata())
		state.messages = [message]

		const result = applyPartDelta(state, message.id, textPart.id, "text", " World")

		const updatedMessage = result.messages.find(m => m.id === message.id)
		const updatedPart = updatedMessage?.parts.find(p => p.id === textPart.id)
		if (updatedPart?.type === "text") {
			expect(updatedPart.text).toBe("Hello World")
		} else {
			expect(updatedPart).toBeUndefined()
		}
	})

	test("Does nothing when the part has no text field", () => {
		const toolPart: UIPart = { id: "part-1", type: "tool", status: "pending" }
		const message = createUIMessage({ id: "msg-1", parts: [toolPart] })
		const state = createInitialState(createSessionMetadata())
		state.messages = [message]

		const result = applyPartDelta(state, message.id, toolPart.id, "text", " more")

		const updatedMessage = result.messages.find(m => m.id === message.id)
		const updatedPart = updatedMessage?.parts.find(p => p.id === toolPart.id)
		expect(updatedPart?.type).toBe("tool")
		if (updatedPart?.type === "tool") {
			expect(updatedPart.status).toBe("pending")
		}
	})

	test("Does nothing when partID doesn't match", () => {
		const textPart: UIPart = { id: "part-1", type: "text", text: "Hello" }
		const message = createUIMessage({ id: "msg-1", parts: [textPart] })
		const state = createInitialState(createSessionMetadata())
		state.messages = [message]

		const result = applyPartDelta(state, message.id, "part-different", "text", " World")

		const updatedMessage = result.messages.find(m => m.id === message.id)
		const updatedPart = updatedMessage?.parts.find(p => p.id === textPart.id)
		if (updatedPart?.type === "text") {
			expect(updatedPart.text).toBe("Hello")
		} else {
			expect(updatedPart).toBeUndefined()
		}
	})

	test("Does nothing when messageID doesn't match", () => {
		const textPart: UIPart = { id: "part-1", type: "text", text: "Hello" }
		const message = createUIMessage({ id: "msg-1", parts: [textPart] })
		const state = createInitialState(createSessionMetadata())
		state.messages = [message]

		const result = applyPartDelta(state, "msg-different", textPart.id, "text", " World")

		const updatedMessage = result.messages.find(m => m.id === message.id)
		const updatedPart = updatedMessage?.parts.find(p => p.id === textPart.id)
		if (updatedPart?.type === "text") {
			expect(updatedPart.text).toBe("Hello")
		} else {
			expect(updatedPart).toBeUndefined()
		}
	})

	test("Does not mutate the input state", () => {
		const textPart: UIPart = { id: "part-1", type: "text", text: "Hello" }
		const message = createUIMessage({ id: "msg-1", parts: [textPart] })
		const state = createInitialState(createSessionMetadata())
		state.messages = [message]

		applyPartDelta(state, message.id, textPart.id, "text", " World")

		const originalPart = state.messages[0]?.parts[0]
		expect(originalPart?.type).toBe("text")
		if (originalPart?.type === "text") {
			expect(originalPart.text).toBe("Hello")
		}
	})
})

describe("removePart", () => {
	test("Removes the part with the given partID from the matching message", () => {
		const part1 = createUIPart({ id: "part-1" })
		const part2 = createUIPart({ id: "part-2" })
		const message = createUIMessage({ id: "msg-1", parts: [part1, part2] })
		const state = createInitialState(createSessionMetadata())
		state.messages = [message]

		const result = removePart(state, message.id, part2.id)

		const updatedMessage = result.messages.find(m => m.id === message.id)
		expect(updatedMessage?.parts).toHaveLength(1)
		expect(updatedMessage?.parts[0]).toBe(part1)
	})

	test("Does nothing when partID doesn't match", () => {
		const part1 = createUIPart({ id: "part-1" })
		const message = createUIMessage({ id: "msg-1", parts: [part1] })
		const state = createInitialState(createSessionMetadata())
		state.messages = [message]

		const result = removePart(state, message.id, "part-nonexistent")

		const updatedMessage = result.messages.find(m => m.id === message.id)
		expect(updatedMessage?.parts).toHaveLength(1)
		expect(updatedMessage?.parts[0]).toBe(part1)
	})

	test("Does not mutate the input state", () => {
		const part1 = createUIPart({ id: "part-1" })
		const part2 = createUIPart({ id: "part-2" })
		const message = createUIMessage({ id: "msg-1", parts: [part1, part2] })
		const state = createInitialState(createSessionMetadata())
		state.messages = [message]

		removePart(state, message.id, part2.id)

		const firstMessage = state.messages[0]
		expect(firstMessage?.parts).toHaveLength(2)
	})
})

describe("updateStatus", () => {
	test("Replaces state.session.status with the new value", () => {
		const session = createSessionMetadata({ status: "idle" })
		const state = createInitialState(session)

		const result = updateStatus(state, "busy")

		expect(result.session.status).toBe("busy")
		expect(result.session.id).toBe(session.id)
	})
})

describe("updateTodos", () => {
	test("Replaces the entire todos array", () => {
		const state = createInitialState(createSessionMetadata())
		const newTodos = [createUITodo({ content: "Task 1" }), createUITodo({ content: "Task 2" })]

		const result = updateTodos(state, newTodos)

		expect(result.todos).toBe(newTodos)
		expect(result.todos).toHaveLength(2)
	})
})

describe("updateFileDiffs", () => {
	test("Replaces the entire fileDiffs array", () => {
		const state = createInitialState(createSessionMetadata())
		const newDiffs = [createUIFileDiff({ file: "a.txt" }), createUIFileDiff({ file: "b.txt" })]

		const result = updateFileDiffs(state, newDiffs)

		expect(result.fileDiffs).toBe(newDiffs)
		expect(result.fileDiffs).toHaveLength(2)
	})
})

describe("setSyncing", () => {
	test("Sets isSyncing to the given boolean. Does not change lastUpdated", () => {
		const state = createInitialState(createSessionMetadata())
		const originalLastUpdated = state.lastUpdated

		const result = setSyncing(state, true)

		expect(result.isSyncing).toBe(true)
		expect(result.lastUpdated).toBe(originalLastUpdated)
	})
})
