import { createOpencode } from "@opencode-ai/sdk/v2"
import * as vscode from "vscode"
import { getFileDiffs } from "./gui-support/getFileDiffs.js"
import { fileDiffToTreeItem } from "./gui/files.js"
import { selectModelWithQuickPicker } from "./gui/modelSelector.js"
import { archiveSession, createSession, createSessionContext, deleteSession, fetchSessions, renameSession, sessionNodeToTreeItem, unarchiveSession } from "./gui/sessions.js"
import { getTodos, todoItemToTreeItem } from "./gui/todos.js"
import { getModel, setModel } from "./opencode-helpers.js"
import { createModelSelectorStatusBarItem } from "./gui/statusbar.js"
import { EventEmitter } from "./utils/emitter.js"
import { nowAsString, setupPeriodicRefresh } from "./utils/miscellaneous.js"
import { handleSdkEvent, startListeningForOpencodeEvents } from "./utils/sdk.js"
import { closeSessionPanel, disposeAllSessionPanels, openSessionPanel } from "./webview/panel.js"

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

		const createTreeItem = (label: string, collapsibleState: vscode.TreeItemCollapsibleState) => new vscode.TreeItem(label, collapsibleState)
		const createThemeIcon = (id: string) => new vscode.ThemeIcon(id)
		const createStatusBarItem = (alignment: vscode.StatusBarAlignment, priority: number) => vscode.window.createStatusBarItem(alignment, priority)
		const showWarningMessage = async (message: string, options: { modal?: boolean }, ...actions: string[]) => await vscode.window.showWarningMessage(message, options, ...actions)
		const showQuickPick = async <T extends vscode.QuickPickItem>(items: T[], options?: vscode.QuickPickOptions) => await vscode.window.showQuickPick(items, options)
		const modelSelector = createModelSelectorStatusBarItem(createStatusBarItem)
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
		const curriedHandleSdkEvent = handleSdkEvent.bind(undefined, noticeError, sessionsEmitter, sessionContext, todoEmitter, fileEmitter, closeSessionPanel)

		const sessionOpenCommand = vscode.commands.registerCommand("opencode.sessions.open", openSessionPanel.bind(undefined, context))
		const sessionSelectCommand = vscode.commands.registerCommand("opencode.model.select", selectModelWithQuickPicker.bind(undefined, client, noticeError, curriedSetModel, showWarningMessage, showQuickPick))
		const sessionCreateCommand = vscode.commands.registerCommand("opencode.sessions.create", createSession.bind(undefined, client, noticeError, sessionsEmitter))
		const sessionRefreshCommand = vscode.commands.registerCommand("opencode.sessions.refresh", () => sessionsEmitter.fire())
		const sessionRenameCommand = vscode.commands.registerCommand("opencode.sessions.rename", renameSession.bind(undefined, client, noticeError, sessionsEmitter))
		const sessionArchiveCommand = vscode.commands.registerCommand("opencode.sessions.archive", archiveSession.bind(undefined, client, noticeError, sessionsEmitter))
		const sessionUnarchiveCommand = vscode.commands.registerCommand("opencode.sessions.unarchive", unarchiveSession.bind(undefined, client, noticeError, sessionsEmitter))
		const sessionDeleteCommand = vscode.commands.registerCommand("opencode.sessions.delete", deleteSession.bind(undefined, client, noticeError, sessionsEmitter, sessionContext))

		const todoTreeView = vscode.window.createTreeView("opencode.todos", { treeDataProvider: { getTreeItem: (todo) => todoItemToTreeItem(createTreeItem, todo), getChildren: curriedGetTodos, onDidChangeTreeData: todoEmitter.event }, showCollapseAll: false })
		const fileDiffTreeView = vscode.window.createTreeView("opencode.files", { treeDataProvider: { getTreeItem: (diff) => fileDiffToTreeItem(createTreeItem, createThemeIcon, diff), getChildren: curriedGetFileDiffs, onDidChangeTreeData: fileEmitter.event }, showCollapseAll: false })
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
