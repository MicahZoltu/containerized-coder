import { describe, expect, test } from "bun:test"
import * as vscode from "vscode"
import { getRootSessions, sessionNodeToTreeItem, type SessionTreeNode, type SessionWithStatus } from "../../source/gui/sessions.js"

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

describe("sessions - sessionNodeToTreeItem", () => {
	test("creates tree item for active-group", () => {
		const node: SessionTreeNode = { type: 'active-group' }
		const item = sessionNodeToTreeItem(node)
		expect(item.label).toBe("Active Sessions")
		expect(item.contextValue).toBe('active-group')
		expect(item.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Expanded)
	})

	test("creates tree item for archived-group", () => {
		const node: SessionTreeNode = { type: 'archived-group' }
		const item = sessionNodeToTreeItem(node)
		expect(item.label).toBe("Archived Sessions")
		expect(item.contextValue).toBe('archived-group')
		expect(item.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Collapsed)
	})

	test("creates tree item for active session node", () => {
		const session = createMockSession({ id: "sess-123", title: "My Session" })
		const node: SessionTreeNode = { type: 'session', ...session, status: { type: "idle" } }
		const item = sessionNodeToTreeItem(node)
		expect(item.id).toBe("sess-123")
		expect(item.label).toBe("My Session")
		expect(item.description).toBeDefined()
		expect(item.iconPath).toBeInstanceOf(vscode.ThemeIcon)
		expect(item.contextValue).toBe('active-session')
		expect(item.command?.command).toBe("opencode.sessions.open")
		expect(item.command?.arguments).toEqual(["sess-123", "My Session"])
	})

	test("creates tree item for archived session", () => {
		const session = createMockSession({
			id: "archived-1",
			slug: "archived-1",
			title: "Archived Session",
			time: { archived: 1234567890 }
		})
		const node: SessionTreeNode = { type: 'session', ...session, status: { type: "idle" } }
		const item = sessionNodeToTreeItem(node)
		expect(item.id).toBe("archived-1")
		expect(item.contextValue).toBe('archived-session')
	})

	test("creates tree item for session with busy status", () => {
		const session = createMockSession({ id: "busy-1" })
		const node: SessionTreeNode = { type: 'session', ...session, status: { type: "busy" } }
		const item = sessionNodeToTreeItem(node)
		expect(item.id).toBe("busy-1")
		expect(item.contextValue).toBe('active-session')
	})
})

describe("sessions - getRootSessions", () => {
	test("returns root sessions for active group", () => {
		const sessions: SessionWithStatus[] = [
			{ ...createMockSession({ id: "root-1" }), status: { type: "idle" } },
			{ ...createMockSession({ id: "child-1", parentID: "root-1" }), status: { type: "idle" } }
		]
		const rootNodes = getRootSessions(sessions, false)
		expect(rootNodes.length).toBe(1)
		const first = rootNodes[0]
		expect(first?.type).toBe('session')
		if (first?.type === 'session') {
			expect(first.id).toBe("root-1")
		}
	})

	test("returns root sessions for archived group", () => {
		const sessions: SessionWithStatus[] = [
			{ ...createMockSession({ id: "archived-1", time: { archived: 1234567890 } }), status: { type: "idle" } },
			{ ...createMockSession({ id: "archived-child", time: { archived: 1234567891 }, parentID: "archived-1" }), status: { type: "idle" } }
		]
		const rootNodes = getRootSessions(sessions, true)
		expect(rootNodes.length).toBe(1)
		const first = rootNodes[0]
		expect(first?.type).toBe('session')
		if (first?.type === 'session') {
			expect(first.id).toBe("archived-1")
		}
	})

	test("excludes archived sessions from active group", () => {
		const sessions: SessionWithStatus[] = [
			{ ...createMockSession({ id: "active-1" }), status: { type: "idle" } },
			{ ...createMockSession({ id: "archived-1", time: { archived: 1234567890 } }), status: { type: "idle" } }
		]
		const rootNodes = getRootSessions(sessions, false)
		expect(rootNodes.length).toBe(1)
		const first = rootNodes[0]
		expect(first?.type).toBe('session')
		if (first?.type === 'session') {
			expect(first.id).toBe("active-1")
		}
	})
})
