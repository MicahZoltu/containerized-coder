import * as vscode from "vscode"
import { openSessionPanel } from "./webview/panel.js"

export function registerCommands(context: vscode.ExtensionContext, createSession: () => Promise<void>, renameSession: (sessionItem?: vscode.TreeItem) => Promise<void>, archiveSession: (sessionItem?: vscode.TreeItem) => Promise<void>, unarchiveSession: (sessionItem?: vscode.TreeItem) => Promise<void>, deleteSession: (sessionItem?: vscode.TreeItem) => Promise<void>, selectModelWithQuickPicker: () => void, sessionsEmitter: vscode.EventEmitter<void>): vscode.Disposable[] {
	return [
		vscode.commands.registerCommand("opencode.session.open", openSessionPanel.bind(undefined, context)),
		vscode.commands.registerCommand("opencode.model.select", selectModelWithQuickPicker),
		vscode.commands.registerCommand("opencode.sessions.create", createSession),
		vscode.commands.registerCommand("opencode.sessions.refresh", sessionsEmitter.fire),
		vscode.commands.registerCommand("opencode.sessions.rename", renameSession),
		vscode.commands.registerCommand("opencode.sessions.archive", archiveSession),
		vscode.commands.registerCommand("opencode.sessions.unarchive", unarchiveSession),
		vscode.commands.registerCommand("opencode.sessions.delete", deleteSession),
	]
}
