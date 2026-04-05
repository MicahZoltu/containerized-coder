import type { Event as SdkEvent, SessionStatus as SdkSessionStatus, Part, Todo, FileDiff } from "@opencode-ai/sdk/v2"
import { describe, expect, test } from "bun:test"
import { mapEventToAction } from "../../../source/state/session-event-handler.js"

function createMessageUpdatedEvent(): SdkEvent {
	return {
		type: "message.updated",
		properties: {
			info: {
				id: "msg-1",
				sessionID: "session-1",
				role: "user",
				time: { created: 1000 },
				agent: "test",
				model: { providerID: "p1", modelID: "m1" },
			},
		},
	}
}

function createPartUpdatedEvent(): SdkEvent {
	const part: Part = {
		id: "part-1",
		sessionID: "session-1",
		messageID: "msg-1",
		type: "text",
		text: "Hello",
	}
	return {
		type: "message.part.updated",
		properties: { part },
	}
}

function createPartDeltaEvent(): SdkEvent {
	return {
		type: "message.part.delta",
		properties: {
			sessionID: "session-1",
			messageID: "msg-1",
			partID: "part-1",
			field: "text",
			delta: " World",
		},
	}
}

function createPartRemovedEvent(): SdkEvent {
	return {
		type: "message.part.removed",
		properties: {
			sessionID: "session-1",
			messageID: "msg-1",
			partID: "part-1",
		},
	}
}

function createStatusEvent(status: SdkSessionStatus): SdkEvent {
	return {
		type: "session.status",
		properties: {
			sessionID: "session-1",
			status,
		},
	}
}

function createIdleEvent(): SdkEvent {
	return {
		type: "session.idle",
		properties: {
			sessionID: "session-1",
		},
	}
}

function createTodosUpdatedEvent(): SdkEvent {
	const todos: Todo[] = [
		{ content: "Task 1", status: "pending", priority: "high" },
	]
	return {
		type: "todo.updated",
		properties: {
			sessionID: "session-1",
			todos,
		},
	}
}

function createDiffEvent(): SdkEvent {
	const diffs: FileDiff[] = [
		{ file: "test.txt", before: "old", after: "new", additions: 1, deletions: 1, status: "modified" },
	]
	return {
		type: "session.diff",
		properties: {
			sessionID: "session-1",
			diff: diffs,
		},
	}
}

function createSessionDeletedEvent(): SdkEvent {
	return {
		type: "session.deleted",
		properties: {
			info: {
				id: "session-1",
				slug: "session-slug",
				projectID: "proj-1",
				directory: "/tmp",
				title: "Test",
				version: "1",
				time: { created: 1000, updated: 2000 },
			},
		},
	}
}

function createSessionCompactedEvent(): SdkEvent {
	return {
		type: "session.compacted",
		properties: {
			sessionID: "session-1",
		},
	}
}

describe("mapEventToAction", () => {
	test("message.updated event returns message-updated action", () => {
		const event = createMessageUpdatedEvent()
		const action = mapEventToAction(event)

		expect(action).toEqual({
			type: "message-updated",
			sessionID: "session-1",
			messageID: "msg-1",
		})
	})

	test("message.part.updated event returns part-updated action", () => {
		const event = createPartUpdatedEvent()
		const action = mapEventToAction(event)

		expect(action?.type).toBe("part-updated")
		if (action?.type === "part-updated") {
			expect(action.sessionID).toBe("session-1")
			expect(action.messageID).toBe("msg-1")
			expect(action.partID).toBe("part-1")
			expect(action.part).toBeDefined()
		}
	})

	test("message.part.delta event returns part-delta action", () => {
		const event = createPartDeltaEvent()
		const action = mapEventToAction(event)

		expect(action).toEqual({
			type: "part-delta",
			sessionID: "session-1",
			messageID: "msg-1",
			partID: "part-1",
			field: "text",
			delta: " World",
		})
	})

	test("message.part.removed event returns part-removed action", () => {
		const event = createPartRemovedEvent()
		const action = mapEventToAction(event)

		expect(action).toEqual({
			type: "part-removed",
			sessionID: "session-1",
			messageID: "msg-1",
			partID: "part-1",
		})
	})

	test("session.status event returns status-updated action", () => {
		const status: SdkSessionStatus = { type: "busy" }
		const event = createStatusEvent(status)
		const action = mapEventToAction(event)

		expect(action).toEqual({
			type: "status-updated",
			sessionID: "session-1",
			status: { type: "busy" },
		})
	})

	test("session.idle event returns status-updated action with idle status", () => {
		const event = createIdleEvent()
		const action = mapEventToAction(event)

		expect(action).toEqual({
			type: "status-updated",
			sessionID: "session-1",
			status: { type: "idle" },
		})
	})

	test("todo.updated event returns todos-updated action", () => {
		const event = createTodosUpdatedEvent()
		const action = mapEventToAction(event)

		expect(action?.type).toBe("todos-updated")
		if (action?.type === "todos-updated") {
			expect(action.sessionID).toBe("session-1")
			expect(action.todos).toHaveLength(1)
			expect(action.todos[0]?.content).toBe("Task 1")
		}
	})

	test("session.diff event returns diffs-updated action", () => {
		const event = createDiffEvent()
		const action = mapEventToAction(event)

		expect(action?.type).toBe("diffs-updated")
		if (action?.type === "diffs-updated") {
			expect(action.sessionID).toBe("session-1")
			expect(action.diffs).toHaveLength(1)
			expect(action.diffs[0]?.file).toBe("test.txt")
		}
	})

	test("session.deleted event returns session-deleted action", () => {
		const event = createSessionDeletedEvent()
		const action = mapEventToAction(event)

		expect(action).toEqual({
			type: "session-deleted",
			sessionID: "session-1",
		})
	})

	test("session.compacted event returns session-compacted action", () => {
		const event = createSessionCompactedEvent()
		const action = mapEventToAction(event)

		expect(action).toEqual({
			type: "session-compacted",
			sessionID: "session-1",
		})
	})

	test("unknown event type returns null", () => {
		const event = {
			type: "unknown.event",
			properties: {},
		}

		// cast here is because we are explicitly testing the fallthrough case that shouldn't be reachable if the SDK correctly types everything (it may not)
		const action = mapEventToAction(event as SdkEvent)

		expect(action).toBeNull()
	})
})
