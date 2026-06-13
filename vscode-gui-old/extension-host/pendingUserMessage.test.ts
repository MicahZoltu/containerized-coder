import { test, describe } from "node:test"
import assert from "node:assert"
import { PendingUserMessageQueue } from "./pendingUserMessage"

describe("PendingUserMessageQueue", () => {
	test("enqueue then dequeue returns the same op id", () => {
		const queue = new PendingUserMessageQueue()
		queue.enqueue("op-1")
		assert.strictEqual(queue.dequeue(), "op-1")
	})

	test("dequeue on an empty queue returns null", () => {
		const queue = new PendingUserMessageQueue()
		assert.strictEqual(queue.dequeue(), null)
	})

	test("dequeue returns op ids in FIFO order", () => {
		const queue = new PendingUserMessageQueue()
		queue.enqueue("op-1")
		queue.enqueue("op-2")
		queue.enqueue("op-3")
		assert.strictEqual(queue.dequeue(), "op-1")
		assert.strictEqual(queue.dequeue(), "op-2")
		assert.strictEqual(queue.dequeue(), "op-3")
		assert.strictEqual(queue.dequeue(), null)
	})

	test("clear empties the queue", () => {
		const queue = new PendingUserMessageQueue()
		queue.enqueue("op-1")
		queue.enqueue("op-2")
		queue.clear()
		assert.strictEqual(queue.size, 0)
		assert.strictEqual(queue.dequeue(), null)
	})

	test("size reflects the number of pending op ids", () => {
		const queue = new PendingUserMessageQueue()
		assert.strictEqual(queue.size, 0)
		queue.enqueue("op-1")
		assert.strictEqual(queue.size, 1)
		queue.enqueue("op-2")
		assert.strictEqual(queue.size, 2)
		queue.dequeue()
		assert.strictEqual(queue.size, 1)
	})
})
