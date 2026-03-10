import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import { afterEach, beforeEach, describe, expect, jest, mock, test } from "bun:test"
import { startListeningForOpencodeEvents } from "../../source/extension.js"
import { isSdkEvent } from "../../source/utils/sdkEventGuards.js"
import { server } from "./setup-opencode.js"

// Note: startListeningForOpencodeEvents now uses a real client connected to the test server.

describe("startListeningForOpencodeEvents", () => {
	let noticeErrors: Array<[string, unknown]> = []
	let noticeInfos: string[] = []
	let sdkEventHandler: jest.Mock
	let disposables: { dispose: () => void }[] = []

	beforeEach(() => {
		noticeErrors = []
		noticeInfos = []
		sdkEventHandler = mock()
		disposables = []
	})

	afterEach(async () => {
		mock.clearAllMocks()
		if (disposables) {
			disposables.forEach(d => d.dispose())
		}
	})

	test("subscribes to SSE and returns disposables", async () => {
		const client = createOpencodeClient({ baseUrl: server.url })
		sdkEventHandler = mock()

		disposables = await startListeningForOpencodeEvents(
			client,
			(msg, err) => noticeErrors.push([msg, err]),
			(msg) => noticeInfos.push(msg),
			sdkEventHandler
		)

		expect(disposables.length).toBeGreaterThan(0)
		expect(noticeInfos).toContain("SSE event subscription established")
	})

	test("forwards valid SDK events to handler", async () => {
		const client = createOpencodeClient({ baseUrl: server.url })
		sdkEventHandler = mock()

		disposables = await startListeningForOpencodeEvents(
			client,
			(msg, err) => noticeErrors.push([msg, err]),
			(msg) => noticeInfos.push(msg),
			sdkEventHandler
		)

		// Trigger a server event: create a session
		await server.client.session.create({ title: "Test Event Forward" })

		// Wait for event propagation
		await new Promise(resolve => setTimeout(resolve, 500))

		// Should have received events; find the session.created one
		const sessionCreatedCalls = sdkEventHandler.mock.calls
			.map(call => call[0] as { type: string })
			.filter(event => event.type === "session.created")

		expect(sessionCreatedCalls.length).toBeGreaterThan(0)
	})

	test("handles subscription failure", async () => {
		// TODO: Requires mocking client.event.subscribe to throw; avoid mock.
		// Could be tested by integration with an actual network failure scenario.
	})

	test("disposing stops event processing", async () => {
		const client = createOpencodeClient({ baseUrl: server.url })
		sdkEventHandler = mock()

		disposables = await startListeningForOpencodeEvents(
			client,
			() => {},
			() => {},
			sdkEventHandler
		)

		// Wait for any initial events to settle
		await new Promise(r => setTimeout(r, 200))
		const callsBefore = sdkEventHandler.mock.calls.length

		// Dispose all
		disposables.forEach(d => d.dispose())

		// Create another event after disposal
		await server.client.session.create({ title: "After dispose" })
		await new Promise(r => setTimeout(r, 500))

		// Should not have additional calls beyond initial ones (which may include server.connected)
		expect(sdkEventHandler.mock.calls.length).toBe(callsBefore)
	})
})

describe("isSdkEvent", () => {
	test("returns true for valid SDK event", () => {
		expect(isSdkEvent({ type: "session.created", properties: { info: {} } })).toBe(true)
	})

	test("returns false for null", () => {
		expect(isSdkEvent(null)).toBe(false)
	})

	test("returns false for undefined", () => {
		expect(isSdkEvent(undefined)).toBe(false)
	})

	test("returns false for object without type string", () => {
		expect(isSdkEvent({ type: 123, properties: {} })).toBe(false)
		expect(isSdkEvent({ notType: "missing" })).toBe(false)
	})

	test("returns false for object with non-object properties", () => {
		expect(isSdkEvent({ type: "test", properties: "should be object" })).toBe(false)
		expect(isSdkEvent({ type: "test", properties: 42 })).toBe(false)
	})

	test("returns true when properties is null", () => {
		expect(isSdkEvent({ type: "test", properties: null })).toBe(true)
	})

	test("returns true when properties is undefined", () => {
		expect(isSdkEvent({ type: "test" })).toBe(true)
	})

	test("accepts plain object with arbitrary properties", () => {
		expect(isSdkEvent({ type: "session.created", properties: { info: { id: "1" }, extra: "data" } })).toBe(true)
	})
})


// Note: isSdkEvent tests are at bottom, removed unused import
