import { test, describe } from "node:test"
import assert from "node:assert"
import { InMemoryOperationStore } from "./operationStore"

describe("OperationStore", () => {
	test("should add and retrieve operations", () => {
		const store = new InMemoryOperationStore()
		const op = {
			id: "test-1",
			type: "thinking" as const,
			title: "Thinking..." as const,
			content: "Content",
			timestamp: Date.now(),
			expanded: true,
			status: "pending" as const,
			sessionId: "session-1",
			messageId: "msg-1",
			partId: "part-1",
		}

		store.add(op)
		const all = store.getAll()

		assert.strictEqual(all.length, 1)
		assert.strictEqual(all[0].id, "test-1")
	})

	test("should update operations", () => {
		const store = new InMemoryOperationStore()
		const op = {
			id: "test-1",
			type: "thinking" as const,
			title: "Thinking..." as const,
			content: "Content",
			timestamp: Date.now(),
			expanded: true,
			status: "pending" as const,
			sessionId: "session-1",
			messageId: "msg-1",
			partId: "part-1",
		}

		store.add(op)
		store.update("test-1", { status: "complete" })
		const updated = store.get("test-1")

		assert.strictEqual(updated?.status, "complete")
	})

	test("should remove operations", () => {
		const store = new InMemoryOperationStore()
		const op = {
			id: "test-1",
			type: "thinking" as const,
			title: "Thinking..." as const,
			content: "Content",
			timestamp: Date.now(),
			expanded: true,
			status: "pending" as const,
			sessionId: "session-1",
			messageId: "msg-1",
			partId: "part-1",
		}

		store.add(op)
		store.remove("test-1")

		assert.strictEqual(store.getAll().length, 0)
	})

	test("should clear all operations", () => {
		const store = new InMemoryOperationStore()
		store.add({
			id: "test-1",
			type: "thinking" as const,
			title: "Thinking..." as const,
			content: "Content",
			timestamp: Date.now(),
			expanded: true,
			status: "pending" as const,
			sessionId: "session-1",
			messageId: "msg-1",
			partId: "part-1",
		})
		store.add({
			id: "test-2",
			type: "text" as const,
			title: "Response" as const,
			content: "Some text",
			timestamp: Date.now(),
			expanded: true,
			status: "complete" as const,
			sessionId: "session-1",
			messageId: "msg-1",
			partId: "part-2",
		})

		store.clear()

		assert.strictEqual(store.getAll().length, 0)
	})
})
