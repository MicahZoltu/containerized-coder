import { describe, expect, test } from "bun:test"
import { fetchSessions, type SessionTreeNode } from "../../source/gui/sessions.js"
import { server } from "./setup-opencode.js"

describe("sessions - fetchSessions (root)", () => {
	test("fetches sessions from server", async () => {
		await server.client.session.create({ title: "Test Session" })
		const nodes = await fetchSessions(server.client, { type: 'active-group' })
		expect(nodes.length).toBeGreaterThan(0)
		const first = nodes[0]
		if (!first) {
			throw new Error('Expected node to exist')
		}
		if (first.type !== 'session') {
			throw new Error('Expected first node to be a session')
		}
		expect(first.id).toBeDefined()
		expect(first.title).toBeDefined()
	})

	test("includes status for each session", async () => {
		await server.client.session.create({ title: "Test Session" })
		const nodes = await fetchSessions(server.client, { type: 'active-group' })
		const first = nodes[0]
		if (!first) {
			throw new Error('Expected node to exist')
		}
		if (first.type !== 'session') {
			throw new Error('Expected first node to be a session')
		}
		expect(first).toHaveProperty('status')
	})
})

describe("sessions - fetchSessions (children)", () => {
	test("fetches children for a session", async () => {
		const parent = await server.client.session.create({ title: "Parent Session" })
		if (!parent.data) {
			throw new Error("Failed to create parent session")
		}
		await server.client.session.create({ title: "Child Session", parentID: parent.data.id })

		const parentNode: SessionTreeNode = { type: 'session', ...parent.data, status: { type: "idle" } }
		const childNodes = await fetchSessions(server.client, parentNode)
		expect(childNodes.length).toBeGreaterThan(0)
		const first = childNodes[0]
		if (!first) {
			throw new Error('Expected node to exist')
		}
		if (first.type !== 'session') {
			throw new Error('Expected first node to be a session')
		}
		expect(first.parentID).toBe(parent.data.id)
	})
})
