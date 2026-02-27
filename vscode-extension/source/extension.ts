import { createOpencode, type OpencodeClient, type Event as SdkEvent } from "@opencode-ai/sdk/v2"
import * as vscode from "vscode"
import { fileDiffToTreeItem, getFileDiffs } from "./gui/files.js"
import { selectModelWithQuickPicker } from "./gui/modelSelector.js"
import type { SessionContext } from "./gui/sessions.js"
import { archiveSession, createSession, createSessionContext, deleteSession, getSessions, renameSession, sessionNodeToTreeItem, unarchiveSession } from "./gui/sessions.js"
import { getTodos, todoItemToTreeItem } from "./gui/todos.js"
import { getModel, setModel } from "./opencode-helpers.js"
import { createModelSelectorStatusBarItem } from "./statusbar.js"
import { nowAsString } from "./utils.js"
import { isPlainObject } from "./utils/typeGuards.js"
import { closeSessionPanel, disposeAllSessionPanels, openSessionPanel } from "./webview/panel.js"

let refreshIntervalId: NodeJS.Timeout | null = null

function isSdkEvent(obj: unknown): obj is SdkEvent {
	if (!isPlainObject(obj)) return false
	if (typeof obj.type !== 'string') return false
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

export async function startListeningForOpencodeEvents(client: OpencodeClient, noticeError: (message: string, error: unknown) => void, noticeInfo: (message: string) => void, sdkEventHandler: (event: SdkEvent) => void): Promise<vscode.Disposable[]> {
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
						noticeError('Invalid event received', event)
					}
				}
			} catch (error) {
				noticeError("SSE stream error", error)
			}
		}
		backgroundStreamPumper()

		disposables.push({ dispose: () => { listener.dispose(), emitter.dispose() } })

		noticeInfo("SSE event subscription established")
	} catch (error) {
		noticeError("Failed to subscribe to events", error)
	}

	return disposables
}

export function setupPeriodicRefresh(refreshFn: () => Promise<unknown>, noticeError: (message: string, error: unknown) => void): vscode.Disposable {
	refreshIntervalId = setInterval(() => { refreshFn().catch(error => noticeError("Periodic refresh failed", error)) }, 10000)
	const dispose = () => {
		if (!refreshIntervalId) return
		clearInterval(refreshIntervalId)
		refreshIntervalId = null
	}

	return { dispose }
}

// entrypoint called by VSCode when extension is loaded
export async function activate(context: vscode.ExtensionContext) {
	const outputChannel = vscode.window.createOutputChannel("OpenCode GUI Logs")
	context.subscriptions.push(outputChannel)

	const noticeError = async (message: string, error: unknown) => {
		const errorMessage = error instanceof Error ? error.message : String(error)
		const formatted = `${nowAsString()} [ERROR] ${message}: ${errorMessage}`
		outputChannel.appendLine(formatted)
		if (error instanceof Error) {
			const stack = error.stack
			if (stack) {
				outputChannel.appendLine(stack)
			}
		}
		const selection = await vscode.window.showErrorMessage(`${message}: ${errorMessage}`, 'See Log')
		if (selection === 'See Log') {
			outputChannel.show()
		}
		// NOTE: This is intentionally a tail call because `showErrorMessage` may take a long time to resolve
	}

	const noticeInfo = (message: string) => {
		const formatted = `${nowAsString()} [INFO] ${message}`
		console.log(formatted)
		outputChannel.appendLine(formatted)
	}

	try {
		noticeInfo("OpenCode extension activating...")

		const { client, server } = await createOpencode()

		const modelSelector = createModelSelectorStatusBarItem()
		const sessionContext = createSessionContext()
		const todoEmitter = new vscode.EventEmitter<void>()
		sessionContext.onChange(() => todoEmitter.fire())
		const fileEmitter = new vscode.EventEmitter<void>()
		sessionContext.onChange(() => fileEmitter.fire())

		const sessionsEmitter = new vscode.EventEmitter<void>()

		const onModelNameChanged = async (newModelName: string) => modelSelector.setModelName(newModelName)
		const curriedGetModel = getModel.bind(undefined, client, noticeError, onModelNameChanged)
		const curriedSetModel = setModel.bind(undefined, client, noticeError, curriedGetModel)
		const curriedGetTodos = getTodos.bind(undefined, client, sessionContext)
		const curriedGetFileDiffs = getFileDiffs.bind(undefined, client, sessionContext)
		const curriedGetSessions = getSessions.bind(undefined, client)
		const curriedHandleSdkEvent = handleSdkEvent.bind(undefined, noticeError, sessionsEmitter, sessionContext, todoEmitter, fileEmitter)

		const sessionOpenCommand = vscode.commands.registerCommand("opencode.session.open", openSessionPanel.bind(undefined, context))
		const sessionSelectCommand = vscode.commands.registerCommand("opencode.model.select", selectModelWithQuickPicker.bind(undefined, client, noticeError, curriedSetModel))
		const sessionCreateCommand = vscode.commands.registerCommand("opencode.sessions.create", createSession.bind(undefined, client, noticeError, sessionsEmitter))
		const sessionRefreshCommand = vscode.commands.registerCommand("opencode.sessions.refresh", () => sessionsEmitter.fire())
		const sessionRenameCommand = vscode.commands.registerCommand("opencode.sessions.rename", renameSession.bind(undefined, client, noticeError, sessionsEmitter))
		const sessionArchiveCommand = vscode.commands.registerCommand("opencode.sessions.archive", archiveSession.bind(undefined, client, noticeError, sessionsEmitter))
		const sessionUnarchiveCommand = vscode.commands.registerCommand("opencode.sessions.unarchive", unarchiveSession.bind(undefined, client, noticeError, sessionsEmitter))
		const sessionDeleteCommand = vscode.commands.registerCommand("opencode.sessions.delete", deleteSession.bind(undefined, client, noticeError, sessionsEmitter, sessionContext))

		const todoTreeView = vscode.window.createTreeView("opencode.todos", { treeDataProvider: { getTreeItem: todoItemToTreeItem, getChildren: curriedGetTodos, onDidChangeTreeData: todoEmitter.event }, showCollapseAll: false })
		const fileDiffTreeView = vscode.window.createTreeView("opencode.files", { treeDataProvider: { getTreeItem: fileDiffToTreeItem, getChildren: curriedGetFileDiffs, onDidChangeTreeData: fileEmitter.event }, showCollapseAll: false })
		const sessionsTreeView = vscode.window.createTreeView("opencode.sessions", { treeDataProvider: { getTreeItem: sessionNodeToTreeItem, getChildren: curriedGetSessions, onDidChangeTreeData: sessionsEmitter.event }, showCollapseAll: true })
		sessionsTreeView.onDidChangeSelection(event => event.selection[0]?.type === 'session' && sessionContext.selectSession(event.selection[0].data.session.id))

		context.subscriptions.push(
			{ dispose: () => server.close() },
			outputChannel,
			modelSelector,
			sessionContext,

			todoEmitter,
			fileEmitter,
			sessionsEmitter,

			sessionOpenCommand,
			sessionSelectCommand,
			sessionCreateCommand,
			sessionRefreshCommand,
			sessionRenameCommand,
			sessionArchiveCommand,
			sessionUnarchiveCommand,
			sessionDeleteCommand,

			todoTreeView,
			fileDiffTreeView,
			sessionsTreeView,

			setupPeriodicRefresh(curriedGetModel, noticeError),

			{ dispose: disposeAllSessionPanels },

			...await startListeningForOpencodeEvents(client, noticeError, noticeInfo, curriedHandleSdkEvent),
		)

		// initial query for the current model at startup
		curriedGetModel()

		noticeInfo("OpenCode extension activated successfully")
	} catch (error) {
		noticeError("Failed to activate OpenCode extension", error)
	}
}

// exit point called by VSCode when extension is unloaded
export function deactivate(): void { }
