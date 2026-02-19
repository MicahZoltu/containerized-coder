import { test, describe } from "node:test"
import assert from "node:assert"
import { InMemoryOperationStore } from "./operationStore"
import { getOperationConfig } from "./operationTypes"

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

describe("OperationTypes", () => {
	test("should return type config for known types", () => {
		const op = {
			id: "test-1",
			type: "text" as const,
			title: "Response" as const,
			content: "Test",
			timestamp: Date.now(),
			expanded: true,
			status: "pending" as const,
			sessionId: "session-1",
			messageId: "msg-1",
			partId: "part-1",
		}
		const config = getOperationConfig(op)
		assert.ok(config)
		assert.strictEqual(config.icon, "comment")
	})

	test("should return config for thinking type", () => {
		const op = {
			id: "test-1",
			type: "thinking" as const,
			title: "Thinking..." as const,
			content: "Test",
			timestamp: Date.now(),
			expanded: true,
			status: "complete" as const,
			sessionId: "session-1",
			messageId: "msg-1",
			partId: "part-1",
		}
		const config = getOperationConfig(op)
		assert.ok(config)
		assert.strictEqual(config.icon, "sparkle")
	})
})
