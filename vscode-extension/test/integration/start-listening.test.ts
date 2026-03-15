import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import { afterEach, beforeEach, describe, expect, jest, mock, test } from "bun:test"
import { startListeningForOpencodeEvents } from "../../source/utils/sdk.js"
import { server } from "./setup-opencode.js"

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

		await server.client.session.create({ title: "Test Event Forward" })

		await new Promise(resolve => setTimeout(resolve, 500))

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

		await new Promise(r => setTimeout(r, 200))
		const callsBefore = sdkEventHandler.mock.calls.length

		disposables.forEach(d => d.dispose())

		await server.client.session.create({ title: "After dispose" })
		await new Promise(r => setTimeout(r, 500))

		expect(sdkEventHandler.mock.calls.length).toBe(callsBefore)
	})
})
