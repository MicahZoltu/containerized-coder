import { createOpencodeClient, type Event as SdkEvent } from "@opencode-ai/sdk/v2"
import * as vscode from "vscode"
import { registerCommands } from "./commands.js"
import { fileDiffToTreeItem, getFileDiffs } from "./gui/files.js"
import { selectModelWithQuickPicker } from "./gui/modelSelector.js"
import type { SessionContext } from "./gui/sessions.js"
import { archiveSession, createSession, createSessionContext, deleteSession, getSessions, renameSession, sessionNodeToTreeItem, unarchiveSession } from "./gui/sessions.js"
import { getTodos, todoItemToTreeItem } from "./gui/todos.js"
import { getModel, setModel } from "./opencode-helpers.js"
import { createModelSelectorStatusBarItem } from "./statusbar.js"
import { isPlainObject } from "./utils/typeGuards.js"
import { closeSessionPanel, disposeAllSessionPanels } from "./webview/panel.js"

let refreshIntervalId: NodeJS.Timeout | null = null

function isSdkEvent(obj: unknown): obj is SdkEvent {
	if (!isPlainObject(obj)) return false
	if (typeof obj.type !== 'string') return false
	const knownTypes = new Set([
		'session.created', 'session.updated', 'session.deleted',
		'todo.updated', 'session.diff', 'session.status',
		'session.idle', 'session.error'
	])
	if (!knownTypes.has(obj.type)) return false
	const props = obj.properties
	if (props !== undefined && props !== null) {
		if (!isPlainObject(props)) return false
	}
	return true
}

export function handleSdkEvent(noticeError: (message: string, error: unknown) => void, sessionsEmitter: vscode.EventEmitter<void>, sessionContext: SessionContext, todoEmitter: vscode.EventEmitter<void>, fileEmitter: vscode.EventEmitter<void>, event: SdkEvent) {
	const eventType = event.type

	switch (eventType) {
		case "session.created":
		case "session.updated":
		case "session.status":
		case "session.idle":
			sessionsEmitter.fire()
			break

		case "session.deleted":
			const sessionId = event.properties.info.id
			sessionsEmitter.fire()
			closeSessionPanel(sessionId)
			break

		case "todo.updated":
			if (sessionContext.getCurrentSessionId() === event.properties?.sessionID) {
				todoEmitter.fire()
			}
			break

		case "session.diff":
			if (sessionContext.getCurrentSessionId() === event.properties?.sessionID) {
				fileEmitter.fire()
			}
			break

		case "session.error":
			const error = event.properties?.error
			if (error) {
				const message = error?.data?.message || "An unknown error occurred in a session"
				noticeError('Session error', message)
			}
			break
	}
}

export async function startListeningForOpencodeEvents(client: ReturnType<typeof createOpencodeClient>, sdkEventHandler: (event: SdkEvent) => void): Promise<vscode.Disposable[]> {
	const disposables: vscode.Disposable[] = []

	try {
		const sse = await client.event.subscribe()
		const emitter = new vscode.EventEmitter<SdkEvent>()
		const listener = emitter.event(sdkEventHandler)
		disposables.push(listener, emitter)

		const backgroundStreamPumper = async () => {
			try {
				for await (const event of sse.stream) {
					if (isSdkEvent(event)) {
						emitter.fire(event)
					} else {
						console.error('Invalid event received:', event)
					}
				}
			} catch (error) {
				console.error("SSE stream error:", error)
			}
		}
		backgroundStreamPumper()

		disposables.push({ dispose: () => { listener.dispose(), emitter.dispose() } })

		console.log("SSE event subscription established")
	} catch (error) {
		console.error("Failed to subscribe to events:", error)
	}

	return disposables
}

export function setupPeriodicRefresh(refreshFn: () => Promise<unknown>): vscode.Disposable {
	refreshIntervalId = setInterval(() => { refreshFn().catch(console.error) }, 10000)
	const dispose = () => {
		if (!refreshIntervalId) return
		clearInterval(refreshIntervalId)
		refreshIntervalId = null
	}

	return { dispose }
}

// entrypoint called by VSCode when extension is loaded
export async function activate(context: vscode.ExtensionContext) {
	console.log("OpenCode extension activating...")

	try {
		const noticeError = (message: string, error: unknown) => {
			console.error(message, error)
			vscode.window.showErrorMessage(`${message}: ${error}`)
		}
		const client = createOpencodeClient()

		const modelSelector = createModelSelectorStatusBarItem()
		context.subscriptions.push(modelSelector)

		const sessionContext = createSessionContext()
		context.subscriptions.push(sessionContext)

		const todoEmitter = new vscode.EventEmitter<void>()
		sessionContext.onChange(() => todoEmitter.fire())
		context.subscriptions.push(todoEmitter)

		const fileEmitter = new vscode.EventEmitter<void>()
		sessionContext.onChange(() => fileEmitter.fire())
		context.subscriptions.push(fileEmitter)

		const sessionsEmitter = new vscode.EventEmitter<void>()
		context.subscriptions.push(sessionsEmitter)

		const onModelNameChanged = async (newModelName: string) => modelSelector.setModelName(newModelName)
		const curriedGetModel = getModel.bind(undefined, client, noticeError, onModelNameChanged)
		const curriedSetModel = setModel.bind(undefined, client, noticeError, curriedGetModel)
		const curriedModelQuickPicker = selectModelWithQuickPicker.bind(undefined, client, noticeError, curriedSetModel)
		const curriedGetTodos = getTodos.bind(undefined, client, sessionContext)
		const curriedGetFileDiffs = getFileDiffs.bind(undefined, client, sessionContext)
		const curriedGetSessions = getSessions.bind(undefined, client)
		const curriedCreateSession = createSession(client, noticeError, sessionsEmitter)
		const curriedRenameSession = renameSession(client, noticeError, sessionsEmitter)
		const curriedArchiveSession = archiveSession(client, noticeError, sessionsEmitter)
		const curriedUnarchiveSession = unarchiveSession(client, noticeError, sessionsEmitter)
		const curriedDeleteSession = deleteSession(client, noticeError, sessionsEmitter, sessionContext)

		context.subscriptions.push(...registerCommands(context, curriedCreateSession, curriedRenameSession, curriedArchiveSession, curriedUnarchiveSession, curriedDeleteSession, curriedModelQuickPicker, sessionsEmitter))

		vscode.window.createTreeView("opencode.todos", { treeDataProvider: { getTreeItem: todoItemToTreeItem, getChildren: curriedGetTodos, onDidChangeTreeData: todoEmitter.event }, showCollapseAll: false })
		vscode.window.createTreeView("opencode.files", { treeDataProvider: { getTreeItem: fileDiffToTreeItem, getChildren: curriedGetFileDiffs, onDidChangeTreeData: fileEmitter.event }, showCollapseAll: false })
		const sessionsTreeView = vscode.window.createTreeView("opencode.sessions", { treeDataProvider: { getTreeItem: sessionNodeToTreeItem, getChildren: curriedGetSessions, onDidChangeTreeData: sessionsEmitter.event }, showCollapseAll: true })
		sessionsTreeView.onDidChangeSelection(event => event.selection[0]?.type === 'session' && sessionContext.selectSession(event.selection[0].data.session.id))

		const curriedHandleSdkEvent = handleSdkEvent.bind(undefined, noticeError, sessionsEmitter, sessionContext, todoEmitter, fileEmitter)
		context.subscriptions.push(...await startListeningForOpencodeEvents(client, curriedHandleSdkEvent))

		context.subscriptions.push(setupPeriodicRefresh(curriedGetModel))
		curriedGetModel()

		context.subscriptions.push({ dispose: disposeAllSessionPanels })

		console.log("OpenCode extension activated successfully")
	} catch (error) {
		console.error("Failed to activate OpenCode extension:", error)
		vscode.window.showErrorMessage(`OpenCode extension failed to activate: ${error}`)
	}
}

// exit point called by VSCode when extension is unloaded
export function deactivate(): void { }
