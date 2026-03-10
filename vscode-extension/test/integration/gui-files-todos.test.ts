import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { getFileDiffs } from "../../source/gui-support/getFileDiffs.js"
import { getTodos } from "../../source/gui/todos.js"
import { server } from "./setup-opencode.js"

// Minimal SessionContext implementation for integration tests
class TestSessionContext {
	private currentSessionId: string | null = null
	private listeners: ((value: string | null) => void)[] = []

	getCurrentSessionId(): string | null {
		return this.currentSessionId
	}

	selectSession(id: string | null): void {
		this.currentSessionId = id
		this.listeners.forEach(listener => listener(id))
	}

	onChange = ((listener: (value: string | null) => void) => {
		this.listeners.push(listener)
		return {
			dispose: () => {
				const index = this.listeners.indexOf(listener)
				if (index !== -1) this.listeners.splice(index, 1)
			}
		}
	}) as () => { dispose: () => void }

	dispose(): void {
		this.listeners = []
	}
}

describe("gui-files integration", () => {
	let context: TestSessionContext

	beforeEach(async () => {
		context = new TestSessionContext()
	})

	afterEach(async () => {
		context?.dispose()
	})

	describe("getFileDiffs", () => {
		test("returns empty array when no session selected", async () => {
			const result = await getFileDiffs(server.client, context)
			expect(result).toEqual([])
		})

		test("fetches file diffs for a valid session", async () => {
			const session = await server.client.session.create({})
			const sessionId = session.data!.id
			context.selectSession(sessionId)

			const result = await getFileDiffs(server.client, context)

			// Should return an array (may be empty initially)
			expect(Array.isArray(result)).toBe(true)
		})
	})

	describe("getTodos", () => {
		test("returns placeholder when no session selected", async () => {
			const result = await getTodos(server.client, context)
			expect(result).toHaveLength(1)
			expect(result[0]).toEqual({ content: 'Select A Session', priority: '', status: '' })
		})

		test("returns todos for a valid session", async () => {
			const session = await server.client.session.create({})
			const sessionId = session.data!.id
			context.selectSession(sessionId)

			const result = await getTodos(server.client, context)

			// Should not return placeholder
			expect(result).not.toContainEqual({ content: 'Select A Session', priority: '', status: '' })
			expect(Array.isArray(result)).toBe(true)
		})
	})
})
