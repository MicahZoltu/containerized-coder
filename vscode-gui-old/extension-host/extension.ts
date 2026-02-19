import * as vscode from "vscode"
import { AssistantPanel } from "./assistantPanel"
import { backend } from "./opencodeBackend"
import { getOutputChannel } from "./logger"
import { DiffContentProvider } from "./diffProvider"

let activePanel: AssistantPanel | null = null

export function activate(context: vscode.ExtensionContext) {
	// Create output channel immediately so it appears in the list
	getOutputChannel()

	// Register diff content provider
	const diffProvider = DiffContentProvider.getInstance()
	context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider("opencode-diff", diffProvider))

	const openAssistant = vscode.commands.registerCommand("opencode.gui.openAssistant", () => {
		if (activePanel) {
			activePanel.reveal()
		} else {
			activePanel = new AssistantPanel(context, () => {
				activePanel = null
			})
		}
	})

	context.subscriptions.push(openAssistant)

	const restartServer = vscode.commands.registerCommand("opencode.gui.restartServer", async () => {
		backend.stop()
		await backend.start()
	})
	context.subscriptions.push(restartServer)

	context.subscriptions.push({
		dispose: () => {
			backend.stop()
		},
	})
}

export function deactivate() {
	backend.stop()
}
