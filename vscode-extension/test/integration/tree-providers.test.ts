import { describe, expect, test } from "bun:test"
import { fetchSessions, getRootSessions, type SessionWithStatus, type SessionTreeNode } from "../../source/gui/sessions.js"
import { server } from "./setup-opencode.mjs"

function createMockSession(overrides: any = {}): any {
	return {
		id: "test",
		slug: "test",
		title: "Test Session",
		projectID: "proj",
		directory: "/tmp",
		version: "1",
		time: { created: 1700000000, updated: 1700000000 },
		...overrides
	}
}

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
		expect(first.data.id).toBeDefined()
		expect(first.data.title).toBeDefined()
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
		expect(first.data).toHaveProperty('status')
	})
})

describe("sessions - fetchSessions (children)", () => {
	test("fetches children for a session", async () => {
		const parent = await server.client.session.create({ title: "Parent Session" })
		if (!parent.data) {
			throw new Error("Failed to create parent session")
		}
		await server.client.session.create({ title: "Child Session", parentID: parent.data.id })

		const parentNode: SessionTreeNode = { type: 'session', data: { ...parent.data, status: { type: "idle" } } }
		const childNodes = await fetchSessions(server.client, parentNode)
		expect(childNodes.length).toBeGreaterThan(0)
		const first = childNodes[0]
		if (!first) {
			throw new Error('Expected node to exist')
		}
		if (first.type !== 'session') {
			throw new Error('Expected first node to be a session')
		}
		expect(first.data.parentID).toBe(parent.data.id)
	})
})

describe("sessions - fetchtRootSessions", () => {
	test("filters correctly for active group", () => {
		const sessions: SessionWithStatus[] = [
			{ ...createMockSession({ id: "root-1" }), status: { type: "idle" } },
			{ ...createMockSession({ id: "child-1", parentID: "root-1" }), status: { type: "idle" } },
			{ ...createMockSession({ id: "archived-1", time: { archived: 1234567890 } }), status: { type: "idle" } }
		]
		const rootNodes = getRootSessions(sessions, false)
		expect(rootNodes.length).toBe(1)
		const first = rootNodes[0]
		expect(first?.type).toBe('session')
		if (first?.type === 'session') {
			expect(first.data.id).toBe("root-1")
		}
	})

	test("filters correctly for archived group", () => {
		const sessions: SessionWithStatus[] = [
			{ ...createMockSession({ id: "root-1" }), status: { type: "idle" } },
			{ ...createMockSession({ id: "archived-1", time: { archived: 1234567890 } }), status: { type: "idle" } },
			{ ...createMockSession({ id: "archived-child", time: { archived: 1234567891 }, parentID: "archived-1" }), status: { type: "idle" } }
		]
		const rootNodes = getRootSessions(sessions, true)
		expect(rootNodes.length).toBe(1)
		const first = rootNodes[0]
		expect(first?.type).toBe('session')
		if (first?.type === 'session') {
			expect(first.data.id).toBe("archived-1")
		}
	})
})
