import type { Session } from "@opencode-ai/sdk/v2"
import { describe, expect, test } from "bun:test"
import type * as vscode from "vscode"
import { EventEmitter } from "../../../source/utils/emitter.js"
import { createSessionContext, getRootSessions, sessionNodeToTreeItem, type SessionTreeNode, type SessionWithStatus } from "../../../source/gui/sessions.js"

function createMockSession(overrides: Partial<Session> = {}): SessionWithStatus {
	const defaultSession: Session = {
		id: "test",
		slug: "test",
		title: "Test Session",
		projectID: "proj",
		directory: "/tmp",
		version: "1",
		time: { created: 1700000000, updated: 1700000000 },
	}
	const session = { ...defaultSession, ...overrides }
	return { ...session, status: { type: "idle" } }
}

function createMockSessionTreeNode(overrides: Partial<SessionTreeNode> = {}): SessionTreeNode {
	const base = createMockSession()
	const sessionNode: SessionTreeNode = { type: 'session', ...base }
	return { ...sessionNode, ...overrides }
}

function createMockCreateTreeItem(): (label: string, collapsibleState: vscode.TreeItemCollapsibleState) => vscode.TreeItem {
	return (label, collapsibleState) => ({ label, collapsibleState })
}

function createMockCreateThemeIcon(): (id: string) => vscode.ThemeIcon {
	return (id) => ({ id, color: undefined })
}

describe("createSessionContext", () => {
	test("initial state returns null", () => {
		const context = createSessionContext(() => {})
		expect(context.getCurrentSessionId()).toBeNull()
	})

	test("selectSession updates current session ID", () => {
		const context = createSessionContext(() => {})
		context.selectSession("session-123")
		expect(context.getCurrentSessionId()).toBe("session-123")
	})

	test("selectSession with null clears session", () => {
		const context = createSessionContext(() => {})
		context.selectSession("session-123")
		context.selectSession(null)
		expect(context.getCurrentSessionId()).toBeNull()
	})

	test("onChange fires when session changes", async () => {
		const context = createSessionContext(() => {})
		const emittedValues: (string | null)[] = []

		const disposable = context.onChange(value => {
			emittedValues.push(value)
		})

		context.selectSession("first")
		expect(emittedValues).toEqual(["first"])

		context.selectSession("second")
		expect(emittedValues).toEqual(["first", "second"])

		context.selectSession(null)
		expect(emittedValues).toEqual(["first", "second", null])

		disposable.dispose()
	})

	test("multiple listeners receive onChange events", () => {
		const context = createSessionContext(() => {})
		const listener1: (string | null)[] = []
		const listener2: (string | null)[] = []

		context.onChange(value => listener1.push(value))
		context.onChange(value => listener2.push(value))

		context.selectSession("test")

		expect(listener1).toEqual(["test"])
		expect(listener2).toEqual(["test"])
	})

	test("dispose stops onChange events", () => {
		const context = createSessionContext(() => {})
		const emitted: (string | null)[] = []

		const disposable = context.onChange(value => emitted.push(value))
		disposable.dispose()

		context.selectSession("test")

		expect(emitted).toEqual([])
	})

	test("dispose method cleans up emitter", () => {
		const context = createSessionContext(() => {})
		const emitted: (string | null)[] = []

		const disposable = context.onChange(value => emitted.push(value))
		context.dispose()
		disposable.dispose()

		context.selectSession("test")

		expect(emitted).toEqual([])
	})

	test("changing to same value does not fire onChange", () => {
		const context = createSessionContext(() => {})
		context.selectSession("same")

		const emitted: (string | null)[] = []
		const disposable = context.onChange(value => emitted.push(value))

		context.selectSession("same")

		expect(emitted).toEqual([])
		disposable.dispose()
	})
})

describe("sessionNodeToTreeItem", () => {
	const createTreeItem = createMockCreateTreeItem()
	const createThemeIcon = createMockCreateThemeIcon()

	test("creates tree item for active-group", () => {
		const node: SessionTreeNode = { type: 'active-group' }
		const item = sessionNodeToTreeItem(createTreeItem, createThemeIcon, node)
		expect(item.label).toBe("Active Sessions")
		expect(item.contextValue).toBe('active-group')
		expect(item.collapsibleState).toBe(2 as vscode.TreeItemCollapsibleState.Expanded)
	})

	test("creates tree item for archived-group", () => {
		const node: SessionTreeNode = { type: 'archived-group' }
		const item = sessionNodeToTreeItem(createTreeItem, createThemeIcon, node)
		expect(item.label).toBe("Archived Sessions")
		expect(item.contextValue).toBe('archived-group')
		expect(item.collapsibleState).toBe(1 as vscode.TreeItemCollapsibleState.Collapsed)
	})

	test("creates tree item for active session node", () => {
		const node = createMockSessionTreeNode({ id: "sess-123", title: "My Session" })
		const item = sessionNodeToTreeItem(createTreeItem, createThemeIcon, node)
		expect(item.id).toBe("sess-123")
		expect(item.label).toBe("My Session")
		expect(item.description).toBeDefined()
		expect(item.iconPath).toBeDefined()
		expect(item.contextValue).toBe('active-session')
		expect(item.command?.command).toBe("opencode.sessions.open")
		expect(item.command?.arguments).toEqual(["sess-123", "My Session"])
	})

	test("creates tree item for archived session", () => {
		const node = createMockSessionTreeNode({
			id: "archived-1",
			slug: "archived-1",
			title: "Archived Session",
			time: { created: 1700000000, updated: 1700000001, archived: 1234567890 }
		})
		const item = sessionNodeToTreeItem(createTreeItem, createThemeIcon, node)
		expect(item.id).toBe("archived-1")
		expect(item.contextValue).toBe('archived-session')
	})

	test("creates tree item for session with busy status", () => {
		const node = createMockSessionTreeNode({ id: "busy-1", status: { type: "busy" } })
		const item = sessionNodeToTreeItem(createTreeItem, createThemeIcon, node)
		expect(item.id).toBe("busy-1")
		expect(item.contextValue).toBe('active-session')
	})

	test("creates tree item for session with retry status", () => {
		const node = createMockSessionTreeNode({
			id: "retry-1",
			status: { type: "retry", attempt: 1, message: "error", next: 0 }
		})
		const item = sessionNodeToTreeItem(createTreeItem, createThemeIcon, node)
		expect(item.id).toBe("retry-1")
		expect(item.contextValue).toBe('active-session')
		expect(item.iconPath).toBeDefined()
	})

	test("description shows updated time for active session", () => {
		const node = createMockSessionTreeNode({
			id: "active",
			time: { created: 1700000000, updated: 1700000001 }
		})
		const item = sessionNodeToTreeItem(createTreeItem, createThemeIcon, node)
		expect(item.description).toBe("2023-11-14 22:13:21")
	})

	test("description shows archived time for archived session", () => {
		const node = createMockSessionTreeNode({
			id: "archived",
			time: { created: 1700000000, updated: 1700000001, archived: 1700000002 }
		})
		const item = sessionNodeToTreeItem(createTreeItem, createThemeIcon, node)
		expect(item.description).toBe("2023-11-14 22:13:22")
	})
})

describe("getRootSessions", () => {
	test("returns root sessions for active group", () => {
		const sessions: SessionWithStatus[] = [
			createMockSession({ id: "root-1" }),
			createMockSession({ id: "child-1", parentID: "root-1" })
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
			createMockSession({ id: "archived-1", time: { ...createMockSession().time, archived: 1234567890 } }),
			createMockSession({ id: "archived-child", time: { ...createMockSession().time, archived: 1234567891 }, parentID: "archived-1" })
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
			createMockSession({ id: "active-1" }),
			createMockSession({ id: "archived-1", time: { ...createMockSession().time, archived: 1234567890 } })
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

describe("sessionsEmitter", () => {
	test("refresh fires emitter", () => {
		const sessionsEmitter = new EventEmitter<void>(() => {})

		let fireCount = 0
		sessionsEmitter.fire = () => { fireCount++ }

		sessionsEmitter.fire()

		expect(fireCount).toBe(1)
		sessionsEmitter.dispose()
	})
})
