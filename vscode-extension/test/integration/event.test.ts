import { type Event as SdkEvent } from "@opencode-ai/sdk/v2"
import { describe, expect, test } from "bun:test"
import { server } from "./setup-opencode.js"

describe("server SSE events", () => {
	test("subscribe to events", async () => {
		const events: SdkEvent[] = []

		const result = await server.client.event.subscribe()

		;(async () => {
			for await (const event of result.stream) {
				events.push(event)
			}
		})()

		await new Promise((r) => setTimeout(r, 100))

		await server.client.session.create({})
		await new Promise((r) => setTimeout(r, 500))

		const createdEvents = events.filter((e) => e.type === "session.created")
		expect(createdEvents.length).toBeGreaterThan(0)
	})

	test("receive session events", async () => {
		const events: SdkEvent[] = []

		const result = await server.client.event.subscribe()

		;(async () => {
			for await (const event of result.stream) {
				events.push(event)
			}
		})()

		await new Promise((r) => setTimeout(r, 100))

		const created = await server.client.session.create({})
		const sessionId = created.data!.id

		await server.client.session.update({
			sessionID: sessionId,
			title: "New Title",
		})

		await new Promise((r) => setTimeout(r, 500))

		const updatedEvents = events.filter((e) => e.type === "session.updated")
		expect(updatedEvents.length).toBeGreaterThan(0)
	})
})
