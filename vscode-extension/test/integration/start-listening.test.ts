import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import { mockFn } from "@tkoehlerlg/bun-mock-extended"
import { describe, expect, test } from "bun:test"
import { startListeningForOpencodeEvents } from "../../source/utils/sdk.js"
import { server } from "./setup-opencode.js"

describe("startListeningForOpencodeEvents", () => {
	test("subscribes to SSE and returns disposables", async () => {
		const client = createOpencodeClient({ baseUrl: server.url })
		const infos: string[] = []
		const disposables = await startListeningForOpencodeEvents(client, () => {}, (message) => infos.push(message), () => {})

		expect(disposables.length).toBeGreaterThan(0)
		expect(infos).toContain("SSE event subscription established")
		disposables.forEach(disposable => disposable.dispose())
	})

	test("forwards valid SDK events to handler", async () => {
		const client = createOpencodeClient({ baseUrl: server.url })
		const sdkEventHandler = mockFn<Parameters<typeof startListeningForOpencodeEvents>[3]>()
		const disposables = await startListeningForOpencodeEvents(client, () => {}, () => {}, sdkEventHandler)

		await server.client.session.create({ title: "Test Event Forward" })

		await new Promise(resolve => setTimeout(resolve, 500))

		const sessionCreatedCalls = sdkEventHandler.mock.calls
			.map((call: unknown[]) => call[0])
			.filter((event: unknown): event is { type: string } => typeof event === "object" && event !== null && "type" in event && event.type === "session.created")

		expect(sessionCreatedCalls.length).toBeGreaterThan(0)
		disposables.forEach(disposable => disposable.dispose())
	})

	test("handles subscription failure", async () => {
		// TODO: Requires mocking client.event.subscribe to throw; avoid mock.
		// Could be tested by integration with an actual network failure scenario.
	})

	test("disposing stops event processing", async () => {
		const client = createOpencodeClient({ baseUrl: server.url })
		const sdkEventHandler = mockFn<Parameters<typeof startListeningForOpencodeEvents>[3]>()
		const disposables = await startListeningForOpencodeEvents(client, () => {}, () => {}, sdkEventHandler)

		await new Promise(r => setTimeout(r, 200))
		const callsBefore = sdkEventHandler.mock.calls.length

		disposables.forEach(d => d.dispose())

		await server.client.session.create({ title: "After dispose" })
		await new Promise(r => setTimeout(r, 500))

		expect(sdkEventHandler.mock.calls.length).toBe(callsBefore)
	})
})
