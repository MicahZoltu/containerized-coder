import { describe, expect, test } from "bun:test"
import { server } from "./setup-opencode.js"

describe("session", () => {
	test("create session", async () => {
		const response = await server.client.session.create({})
		expect(response.data?.id).toBeDefined()
		expect(response.data?.title).toBeDefined()
	})

	test("list sessions", async () => {
		const created = await server.client.session.create({})
		const sessionId = created.data!.id

		const response = await server.client.session.list()
		const ids = response.data?.map((s) => s.id) ?? []
		expect(ids).toContain(sessionId)
	})

	test("get session", async () => {
		const created = await server.client.session.create({})
		const sessionId = created.data!.id

		const response = await server.client.session.get({ sessionID: sessionId })
		expect(response.data?.id).toBe(sessionId)
	})

	test("update session", async () => {
		const created = await server.client.session.create({})
		const sessionId = created.data!.id

		const response = await server.client.session.update({
			sessionID: sessionId,
			title: "Updated Title",
		})
		expect(response.data?.title).toBe("Updated Title")
	})

	test("delete session", async () => {
		const created = await server.client.session.create({})
		const sessionId = created.data!.id

		await server.client.session.delete({ sessionID: sessionId })

		const list = await server.client.session.list()
		const ids = list.data?.map((s) => s.id) ?? []
		expect(ids).not.toContain(sessionId)
	})
})
