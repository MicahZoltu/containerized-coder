import { createOpencode, type OpencodeClient, type Event as SdkEvent } from "@opencode-ai/sdk/v2"
import * as vscode from "vscode"
import { EventEmitter } from "./utils/emitter.js"
import { fileDiffToTreeItem } from "./gui/files.js"
import { getFileDiffs } from "./gui-support/getFileDiffs.js"
import { selectModelWithQuickPicker } from "./gui/modelSelector.js"
import type { SessionContext } from "./gui/sessions.js"
import { archiveSession, createSession, createSessionContext, deleteSession, fetchSessions, renameSession, sessionNodeToTreeItem, unarchiveSession } from "./gui/sessions.js"
import { getTodos, todoItemToTreeItem } from "./gui/todos.js"
import { getModel, setModel } from "./opencode-helpers.js"
import { createModelSelectorStatusBarItem } from "./statusbar.js"
import { nowAsString } from "./utils.js"
import { isSdkEvent } from "./utils/sdkEventGuards.js"
import { closeSessionPanel, disposeAllSessionPanels, openSessionPanel } from "./webview/panel.js"

export function handleSdkEvent(noticeError: (message: string, error: unknown) => void, sessionsEmitter: EventEmitter<void>, sessionContext: SessionContext, todoEmitter: EventEmitter<void>, fileEmitter: EventEmitter<void>, event: SdkEvent) {
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

export async function startListeningForOpencodeEvents(client: OpencodeClient, noticeError: (message: string, error: unknown) => void, noticeInfo: (message: string) => void, sdkEventHandler: (event: SdkEvent) => void) {
	const disposables: { dispose: () => void }[] = []

	try {
		const sse = await client.event.subscribe()
		const emitter = new EventEmitter<SdkEvent>(noticeError)
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

export function setupPeriodicRefresh(refreshFn: () => Promise<unknown>, noticeError: (message: string, error: unknown) => void) {
	const refreshIntervalId = setInterval(() => { refreshFn().catch(error => noticeError("Periodic refresh failed", error)) }, 10000)
	const dispose = () => {
		if (!refreshIntervalId) return
		clearInterval(refreshIntervalId)
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
		const sessionContext = createSessionContext(noticeError)
		const todoEmitter = new EventEmitter<void>(noticeError)
		sessionContext.onChange(() => todoEmitter.fire())
		const fileEmitter = new EventEmitter<void>(noticeError)
		sessionContext.onChange(() => fileEmitter.fire())

		const sessionsEmitter = new EventEmitter<void>(noticeError)

		const onModelNameChanged = async (newModelName: string) => modelSelector.setModelName(newModelName)
		const curriedGetModel = getModel.bind(undefined, client, noticeError, onModelNameChanged)
		const curriedSetModel = setModel.bind(undefined, client, noticeError, curriedGetModel)
		const curriedGetTodos = getTodos.bind(undefined, client, sessionContext)
		const curriedGetFileDiffs = getFileDiffs.bind(undefined, client, sessionContext)
		const curriedGetSessions = fetchSessions.bind(undefined, client)
		const curriedHandleSdkEvent = handleSdkEvent.bind(undefined, noticeError, sessionsEmitter, sessionContext, todoEmitter, fileEmitter)

		const sessionOpenCommand = vscode.commands.registerCommand("opencode.sessions.open", openSessionPanel.bind(undefined, context))
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
		sessionsTreeView.onDidChangeSelection(event => event.selection[0]?.type === 'session' && sessionContext.selectSession(event.selection[0].id))

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
