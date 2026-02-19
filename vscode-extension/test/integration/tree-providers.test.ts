import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import { beforeEach, describe, expect, test } from "bun:test"
import { getRootSessions, getSessionChildrenFromServer, getSessionsWithStatuses, type SessionWithStatus } from "../../source/gui/sessions.js"
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

describe("sessions - getSessionsWithStatuses", () => {
	let client: ReturnType<typeof createOpencodeClient>

	beforeEach(() => {
		client = createOpencodeClient({ baseUrl: server.url })
	})

	test("fetches sessions from server", async () => {
		await client.session.create({ title: "Test Session" })
		const sessions = await getSessionsWithStatuses(client)
		expect(sessions.length).toBeGreaterThan(0)
		const first = sessions[0]
		expect(first?.session.id).toBeDefined()
		expect(first?.session.title).toBeDefined()
	})

	test("includes status for each session", async () => {
		await client.session.create({ title: "Test Session" })
		const sessions = await getSessionsWithStatuses(client)
		const first = sessions[0]
		expect(first).toHaveProperty('session')
		expect(first).toHaveProperty('status')
	})
})

describe("sessions - getSessionChildrenFromServer", () => {
	let client: ReturnType<typeof createOpencodeClient>

	beforeEach(() => {
		client = createOpencodeClient({ baseUrl: server.url })
	})

	test("fetches children for a session", async () => {
		const parent = await client.session.create({ title: "Parent Session" })
		if (!parent.data) {
			throw new Error("Failed to create parent session")
		}
		await client.session.create({ title: "Child Session", parentID: parent.data.id })

		const children = await getSessionChildrenFromServer(client, parent.data.id)
		expect(children.length).toBeGreaterThan(0)
		const first = children[0]
		expect(first?.session.parentID).toBe(parent.data.id)
	})
})

describe("sessions - getRootSessions", () => {
	test("filters correctly for active group", () => {
		const sessions: SessionWithStatus[] = [
			{ session: createMockSession({ id: "root-1" }), status: undefined },
			{ session: createMockSession({ id: "child-1", parentID: "root-1" }), status: undefined },
			{ session: createMockSession({ id: "archived-1", time: { archived: 1234567890 } }), status: undefined }
		]
		const rootNodes = getRootSessions(sessions, false)
		expect(rootNodes.length).toBe(1)
		const first = rootNodes[0]
		expect(first?.type).toBe('session')
		if (first?.type === 'session') {
			expect(first.data.session.id).toBe("root-1")
		}
	})

	test("filters correctly for archived group", () => {
		const sessions: SessionWithStatus[] = [
			{ session: createMockSession({ id: "root-1" }), status: undefined },
			{ session: createMockSession({ id: "archived-1", time: { archived: 1234567890 } }), status: undefined },
			{ session: createMockSession({ id: "archived-child", time: { archived: 1234567891 }, parentID: "archived-1" }), status: undefined }
		]
		const rootNodes = getRootSessions(sessions, true)
		expect(rootNodes.length).toBe(1)
		const first = rootNodes[0]
		expect(first?.type).toBe('session')
		if (first?.type === 'session') {
			expect(first.data.session.id).toBe("archived-1")
		}
	})
})
