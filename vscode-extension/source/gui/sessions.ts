import { OpencodeClient, Session, SessionStatus } from "@opencode-ai/sdk/v2"
import * as vscode from "vscode"
import { EventEmitter } from "../utils/emitter.js"

export interface SessionContext {
	getCurrentSessionId(): string | null
	selectSession(id: string | null): void
	onChange: EventEmitter<string | null>['event']
	dispose(): void
}

export function createSessionContext(noticeError: (message: string, error: unknown) => void): SessionContext {
	let currentSessionId: string | null = null
	const emitter = new EventEmitter<string | null>(noticeError)
	const getCurrentSessionId = () => currentSessionId
	const selectSession = (id: string | null) => {
		if (currentSessionId === id) return
		currentSessionId = id
		emitter.fire(id)
	}
	const onChange = emitter.event.bind(emitter)
	const dispose = emitter.dispose.bind(emitter)
	return { getCurrentSessionId, selectSession, onChange, dispose }
}

export type SessionWithStatus = Session & { status: SessionStatus }

export type SessionTreeNode =
	| { type: 'active-group' }
	| { type: 'archived-group' }
	| { type: 'session' } & SessionWithStatus

async function fetchSessionsWithStatuses(client: OpencodeClient): Promise<SessionWithStatus[]> {
	const [sessionsResponse, statusesResponse] = await Promise.all([client.session.list(), client.session.status()])
	const sessions = sessionsResponse.data ?? []
	const statuses = statusesResponse.data ?? {}
	return sessions.map(session => ({ ...session, status: statuses[session.id] ?? { type: "idle" } }))
}

async function fetchSessionChildrenFromServer(client: OpencodeClient, parentSessionId: string): Promise<SessionWithStatus[]> {
	const [childrenResponse, statusesResponse] = await Promise.all([client.session.children({ sessionID: parentSessionId }), client.session.status()])
	const children = childrenResponse.data ?? []
	const statuses = statusesResponse.data ?? {}
	return children.map(session => ({ ...session, status: statuses[session.id] ?? { type: "idle" } }))
}

export const fetchSessions = async (client: OpencodeClient, element?: SessionTreeNode): Promise<SessionTreeNode[]> => {
	switch (element?.type) {
		case undefined:
			return [{ type: 'active-group' }, { type: 'archived-group' }]
		case 'active-group':
			const activeSessions = await fetchSessionsWithStatuses(client)
			return getRootSessions(activeSessions, false)
		case 'archived-group':
			const archivedSessions = await fetchSessionsWithStatuses(client)
			return getRootSessions(archivedSessions, true)
		case 'session':
			const children = await fetchSessionChildrenFromServer(client, element.id)
			return children.map(session => ({ type: 'session', ...session }))
		default:
			throw new Error(`Unexpected element.type ${element satisfies never}`)
	}
}

export function sessionNodeToTreeItem(node: SessionTreeNode): vscode.TreeItem {
	if (node.type === 'active-group') {
		const item = new vscode.TreeItem("Active Sessions", 2 as vscode.TreeItemCollapsibleState.Expanded)
		item.id = 'active-group'
		item.contextValue = 'active-group'
		return item
	}
	if (node.type === 'archived-group') {
		const item = new vscode.TreeItem("Archived Sessions", 1 as vscode.TreeItemCollapsibleState.Collapsed)
		item.id = 'archived-group'
		item.contextValue = 'archived-group'
		return item
	}
	const item = new vscode.TreeItem(node.title)
	item.id = node.id
	item.description = formatSessionDescription(node)
	item.iconPath = new vscode.ThemeIcon(node.time.archived ? 'git-branch' : getSessionStatusIcon(node.status))
	item.contextValue = node.time.archived ? 'archived-session' : 'active-session'
	item.command = { command: "opencode.sessions.open", title: "Open Session", arguments: [node.id, node.title] }
	return item
}

function formatSessionDescription(session: Session): string {
	if (!session.time.archived) return new Date(session.time.updated * 1000).toISOString().slice(0, 19).replace('T', ' ')
	else return new Date(session.time.archived * 1000).toISOString().slice(0, 19).replace('T', ' ')
}

function getSessionStatusIcon(status: SessionStatus): string {
	if (status.type === "busy") return "sync~spin"
	if (status.type === "retry") return "error"
	return "debug-rerun"
}

export function getRootSessions(sessions: SessionWithStatus[], isArchivedGroup: boolean): SessionTreeNode[] {
	return sessions
		.filter(session => !session.parentID && !!session.time?.archived === isArchivedGroup)
		.map(session => ({ type: 'session', ...session }))
}

export async function createSession(client: OpencodeClient, noticeError: (message: string, error: unknown) => void, sessionsEmitter: EventEmitter<void>) {
	try {
		await client.session.create({})
		sessionsEmitter.fire()
	} catch (error) {
		noticeError("Failed to create session", error)
	}
}

export async function renameSession(client: OpencodeClient, noticeError: (message: string, error: unknown) => void, sessionsEmitter: EventEmitter<void>, node?: SessionTreeNode) {
	if (node?.type !== 'session') {
		vscode.window.showWarningMessage("Please select a session to rename")
		return
	}
	const sessionId = node.id
	const currentTitle = node.title
	const newTitle = await vscode.window.showInputBox({ prompt: "Enter new session title", placeHolder: "Session title", value: currentTitle })

	if (!newTitle || newTitle === currentTitle) return

	try {
		await client.session.update({ sessionID: sessionId, title: newTitle })
		sessionsEmitter.fire()
	} catch (error) {
		noticeError("Failed to rename session", error)
	}
}

export async function archiveSession(client: OpencodeClient, noticeError: (message: string, error: unknown) => void, sessionsEmitter: EventEmitter<void>, node?: SessionTreeNode) {
	if (node?.type !== 'session') {
		vscode.window.showWarningMessage("Please select a session to archive")
		return
	}
	const sessionId = node.id

	try {
		await client.session.update({ sessionID: sessionId, time: { archived: Math.floor(Date.now() / 1000) } })
		sessionsEmitter.fire()
	} catch (error) {
		noticeError("Failed to archive session", error)
	}
}

export async function unarchiveSession(client: OpencodeClient, noticeError: (message: string, error: unknown) => void, sessionsEmitter: EventEmitter<void>, node?: SessionTreeNode) {
	if (node?.type !== 'session') {
		vscode.window.showWarningMessage("Please select a session to unarchive")
		return
	}
	const sessionId = node.id

	try {
		await client.session.update({ sessionID: sessionId, time: { archived: 0 } })
		sessionsEmitter.fire()
	} catch (error) {
		noticeError("Failed to unarchive session", error)
	}
}

export async function deleteSession(client: OpencodeClient, noticeError: (message: string, error: unknown) => void, sessionsEmitter: EventEmitter<void>, sessionContext: SessionContext, node?: SessionTreeNode) {
	if (node?.type !== 'session') {
		vscode.window.showWarningMessage("Please select a session to delete")
		return
	}
	const sessionId = node.id

	const confirmed = await vscode.window.showWarningMessage("Are you sure you want to delete this session? This cannot be undone.", { modal: true }, "Yes")

	if (confirmed !== "Yes") return

	try {
		await client.session.delete({ sessionID: sessionId })
		sessionsEmitter.fire()
		if (sessionContext.getCurrentSessionId() === sessionId) {
			sessionContext.selectSession(null)
		}
	} catch (error) {
		noticeError("Failed to delete session", error)
	}
}
