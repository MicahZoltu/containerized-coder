import { OpencodeClient, Session, SessionStatus } from "@opencode-ai/sdk/v2"
import * as vscode from "vscode"

export interface SessionContext {
	getCurrentSessionId(): string | null
	selectSession(id: string | null): void
	onChange: vscode.Event<string | null>
	dispose(): void
}

export function createSessionContext(): SessionContext {
	let currentSessionId: string | null = null
	const emitter = new vscode.EventEmitter<string | null>()
	const getCurrentSessionId = () => currentSessionId
	const selectSession = (id: string | null) => {
		currentSessionId = id
		emitter.fire(id)
	}
	const onChange = emitter.event
	const dispose = emitter.dispose
	return { getCurrentSessionId, selectSession, onChange, dispose }
}

export interface SessionWithStatus {
	session: Session
	status: SessionStatus | undefined
}

export type SessionTreeNode =
	| { type: 'active-group' }
	| { type: 'archived-group' }
	| { type: 'session'; data: SessionWithStatus }

export async function getSessionsWithStatuses(client: OpencodeClient): Promise<SessionWithStatus[]> {
	const [sessionsResponse, statusesResponse] = await Promise.all([client.session.list(), client.session.status()])
	const sessions = sessionsResponse.data ?? []
	const statuses = statusesResponse.data ?? {}
	return sessions.map(session => ({ session, status: statuses[session.id] }))
}

export async function getSessionChildrenFromServer(client: OpencodeClient, parentSessionId: string): Promise<SessionWithStatus[]> {
	const [childrenResponse, statusesResponse] = await Promise.all([client.session.children({ sessionID: parentSessionId }), client.session.status()])
	const children = childrenResponse.data ?? []
	const statuses = statusesResponse.data ?? {}
	return children.map(session => ({ session, status: statuses[session.id] }))
}

export const getSessions = async (client: OpencodeClient, element?: SessionTreeNode): Promise<SessionTreeNode[]> => {
	switch (element?.type) {
		case undefined:
			return [{ type: 'active-group' }, { type: 'archived-group' }]
		case 'active-group':
			const activeSessions = await getSessionsWithStatuses(client)
			return getRootSessions(activeSessions, false)
		case 'archived-group':
			const archivedSessions = await getSessionsWithStatuses(client)
			return getRootSessions(archivedSessions, true)
		case 'session':
			const children = await getSessionChildrenFromServer(client, element.data.session.id)
			return children.map(s => ({ type: 'session', data: s }))
		default:
			throw new Error(`Unexpected element.type ${element satisfies never}`)
	}
}

export function sessionNodeToTreeItem(node: SessionTreeNode): vscode.TreeItem {
	if (node.type === 'active-group') {
		const item = new vscode.TreeItem("Active Sessions", vscode.TreeItemCollapsibleState.Expanded)
		item.id = 'active-group'
		item.contextValue = 'active-group'
		return item
	}
	if (node.type === 'archived-group') {
		const item = new vscode.TreeItem("Archived Sessions", vscode.TreeItemCollapsibleState.Collapsed)
		item.id = 'archived-group'
		item.contextValue = 'archived-group'
		return item
	}
	const { session, status } = node.data
	const item = new vscode.TreeItem(session.title)
	item.id = session.id
	item.description = formatSessionDescription(session)
	item.iconPath = new vscode.ThemeIcon(session.time.archived ? 'git-branch' : getSessionStatusIcon(status))
	item.contextValue = 'session'
	item.command = { command: "opencode.session.open", title: "Open Session", arguments: [session.id, session.title] }
	return item
}

function formatSessionDescription(session: Session): string {
	if (!session.time.archived) return new Date(session.time.updated).toISOString().slice(0, 19).replace('T', ' ')
	else return new Date(session.time.archived).toISOString().slice(0, 19).replace('T', ' ')
}

function getSessionStatusIcon(status: SessionStatus | undefined): string {
	if (!status) return "debug-rerun"
	if (status.type === "busy") return "sync~spin"
	if (status.type === "retry") return "error"
	return "debug-rerun"
}

export function getRootSessions(sessions: SessionWithStatus[], isArchivedGroup: boolean): SessionTreeNode[] {
	return sessions
		.filter(session => !session.session.parentID && !!session.session.time?.archived === isArchivedGroup)
		.map(session => ({ type: 'session', data: session }))
}

export function createSession(client: OpencodeClient, noticeError: (message: string, error: unknown) => void, sessionsEmitter: vscode.EventEmitter<void>): () => Promise<void> {
	return async () => {
		const title = await vscode.window.showInputBox({ prompt: "Enter session title", placeHolder: "Session title" })

		if (!title) return

		try {
			await client.session.create({ title })
			sessionsEmitter.fire()
		} catch (error) {
			noticeError("Failed to create session", error)
		}
	}
}

export function renameSession(client: OpencodeClient, noticeError: (message: string, error: unknown) => void, sessionsEmitter: vscode.EventEmitter<void>): (sessionItem?: vscode.TreeItem) => Promise<void> {
	return async (sessionItem?: vscode.TreeItem) => {
		const sessionID = sessionItem?.id
		if (!sessionID) {
			vscode.window.showWarningMessage("Please select a session to rename")
			return
		}

		const currentTitle = typeof sessionItem?.label === 'string' ? sessionItem.label : ""
		const newTitle = await vscode.window.showInputBox({ prompt: "Enter new session title", placeHolder: "Session title", value: currentTitle })

		if (!newTitle || newTitle === currentTitle) return

		try {
			await client.session.update({ sessionID, title: newTitle })
			sessionsEmitter.fire()
		} catch (error) {
			noticeError("Failed to rename session", error)
		}
	}
}

export function archiveSession(client: OpencodeClient, noticeError: (message: string, error: unknown) => void, sessionsEmitter: vscode.EventEmitter<void>): (sessionItem?: vscode.TreeItem) => Promise<void> {
	return async (sessionItem?: vscode.TreeItem) => {
		const sessionID = sessionItem?.id
		if (!sessionID) {
			vscode.window.showWarningMessage("Please select a session to archive")
			return
		}

		try {
			await client.session.update({ sessionID, time: { archived: Math.floor(Date.now() / 1000) } })
			sessionsEmitter.fire()
		} catch (error) {
			noticeError("Failed to archive session", error)
		}
	}
}

export function unarchiveSession(client: OpencodeClient, noticeError: (message: string, error: unknown) => void, sessionsEmitter: vscode.EventEmitter<void>): (sessionItem?: vscode.TreeItem) => Promise<void> {
	return async (sessionItem?: vscode.TreeItem) => {
		const sessionID = sessionItem?.id
		if (!sessionID) {
			vscode.window.showWarningMessage("Please select a session to unarchive")
			return
		}

		try {
			await client.session.update({ sessionID, time: { archived: 0 } })
			sessionsEmitter.fire()
		} catch (error) {
			noticeError("Failed to unarchive session", error)
		}
	}
}

export function deleteSession(client: OpencodeClient, noticeError: (message: string, error: unknown) => void, sessionsEmitter: vscode.EventEmitter<void>, sessionContext: SessionContext): (sessionItem?: vscode.TreeItem) => Promise<void> {
	return async (sessionItem?: vscode.TreeItem) => {
		const sessionID = sessionItem?.id
		if (!sessionID) {
			vscode.window.showWarningMessage("Please select a session to delete")
			return
		}

		const confirmed = await vscode.window.showWarningMessage("Are you sure you want to delete this session? This cannot be undone.", { modal: true }, "Yes")

		if (confirmed !== "Yes") return

		try {
			await client.session.delete({ sessionID })
			sessionsEmitter.fire()
			if (sessionContext.getCurrentSessionId() === sessionID) {
				sessionContext.selectSession(null)
			}
		} catch (error) {
			noticeError("Failed to delete session", error)
		}
	}
}
