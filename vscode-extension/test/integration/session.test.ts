import { afterEach, describe, expect, test } from "bun:test"
import { mockLlm } from "./setup-mock-llm.js"
import { server } from "./setup-opencode.mjs"

describe("session", () => {
	let sessionId: string

	afterEach(async () => {
		mockLlm.clear()
		if (sessionId) {
			await server.client.session.delete({ sessionID: sessionId }).catch(() => {})
		}
	})

	test("create session", async () => {
		const response = await server.client.session.create({})
		expect(response.data?.id).toBeDefined()
		expect(response.data?.title).toBeDefined()
		sessionId = response.data!.id
	})

	test("list sessions", async () => {
		const created = await server.client.session.create({})
		sessionId = created.data!.id

		const response = await server.client.session.list()
		const ids = response.data?.map((s) => s.id) ?? []
		expect(ids).toContain(sessionId)
	})

	test("get session", async () => {
		const created = await server.client.session.create({})
		sessionId = created.data!.id

		const response = await server.client.session.get({ sessionID: sessionId })
		expect(response.data?.id).toBe(sessionId)
	})

	test("update session", async () => {
		const created = await server.client.session.create({})
		sessionId = created.data!.id

		const response = await server.client.session.update({
			sessionID: sessionId,
			title: "Updated Title",
		})
		expect(response.data?.title).toBe("Updated Title")
	})

	test("delete session", async () => {
		const created = await server.client.session.create({})
		sessionId = created.data!.id

		await server.client.session.delete({ sessionID: sessionId })

		const list = await server.client.session.list()
		const ids = list.data?.map((s) => s.id) ?? []
		expect(ids).not.toContain(sessionId)
		sessionId = "" // Prevent afterEach from trying to delete again
	})
})
