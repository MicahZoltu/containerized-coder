import { describe, expect, test } from "bun:test"
import { createSessionContext } from "../../source/gui/sessions.js"

describe("SessionContext", () => {
	test("initial state returns null", () => {
		const context = createSessionContext(() => {})
		expect(context.getCurrentSessionId()).toBeNull()
	})

	test("selectSession updates current session ID", () => {
		const context = createSessionContext(() => {})
		context.selectSession("session-123")
		expect(context.getCurrentSessionId()).toBe("session-123")
	})

	test("selectSession with null clears session", () => {
		const context = createSessionContext(() => {})
		context.selectSession("session-123")
		context.selectSession(null)
		expect(context.getCurrentSessionId()).toBeNull()
	})

	test("onChange fires when session changes", async () => {
		const context = createSessionContext(() => {})
		const emittedValues: (string | null)[] = []

		const disposable = context.onChange(value => {
			emittedValues.push(value)
		})

		context.selectSession("first")
		expect(emittedValues).toEqual(["first"])

		context.selectSession("second")
		expect(emittedValues).toEqual(["first", "second"])

		context.selectSession(null)
		expect(emittedValues).toEqual(["first", "second", null])

		disposable.dispose()
	})

	test("multiple listeners receive onChange events", () => {
		const context = createSessionContext(() => {})
		const listener1: (string | null)[] = []
		const listener2: (string | null)[] = []

		context.onChange(value => listener1.push(value))
		context.onChange(value => listener2.push(value))

		context.selectSession("test")

		expect(listener1).toEqual(["test"])
		expect(listener2).toEqual(["test"])
	})

	test("dispose stops onChange events", () => {
		const context = createSessionContext(() => {})
		const emitted: (string | null)[] = []

		const disposable = context.onChange(value => emitted.push(value))
		disposable.dispose()

		context.selectSession("test")

		expect(emitted).toEqual([])
	})

	test("dispose method cleans up emitter", () => {
		const context = createSessionContext(() => {})
		const emitted: (string | null)[] = []

		const disposable = context.onChange(value => emitted.push(value))
		context.dispose()
		disposable.dispose()

		context.selectSession("test")

		expect(emitted).toEqual([])
	})

	test("changing to same value does not fire onChange", () => {
		const context = createSessionContext(() => {})
		context.selectSession("same")

		const emitted: (string | null)[] = []
		const disposable = context.onChange(value => emitted.push(value))

		context.selectSession("same")

		expect(emitted).toEqual([])
		disposable.dispose()
	})
})
