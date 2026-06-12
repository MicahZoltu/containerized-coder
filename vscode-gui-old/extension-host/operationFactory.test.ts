import { test, describe } from "node:test"
import assert from "node:assert"
import { createUserMessageOperation } from "./operationFactory"

describe("createUserMessageOperation", () => {
	test("uses the supplied messageId verbatim", () => {
		const op = createUserMessageOperation("session-1", "hello", undefined, undefined, undefined, "msg-42")
		assert.strictEqual(op.type, "user-message")
		assert.strictEqual(op.messageId, "msg-42")
		assert.strictEqual(op.sessionId, "session-1")
		assert.strictEqual(op.content, "hello")
	})

	test("defaults messageId to an empty string when not supplied", () => {
		const op = createUserMessageOperation("session-1", "hello")
		assert.strictEqual(op.messageId, "")
		assert.strictEqual(op.sessionId, "session-1")
	})

	test("does not alias messageId to sessionId", () => {
		const op = createUserMessageOperation("session-1", "hello")
		assert.notStrictEqual(op.messageId, op.sessionId)
	})

	test("forwards model, agent, and timestamp", () => {
		const model = { providerID: "openai", modelID: "gpt-4" }
		const op = createUserMessageOperation("session-1", "hello", model, "build", 12345)
		assert.deepStrictEqual(op.model, model)
		assert.strictEqual(op.agent, "build")
		assert.strictEqual(op.timestamp, 12345)
	})

	test("explicit empty string for messageId is preserved", () => {
		const op = createUserMessageOperation("session-1", "hello", undefined, undefined, undefined, "")
		assert.strictEqual(op.messageId, "")
	})
})