import * as vscode from "vscode"

let outputChannel: vscode.OutputChannel | null = null

export function getOutputChannel(): vscode.OutputChannel {
	if (!outputChannel) {
		outputChannel = vscode.window.createOutputChannel("OpenCode GUI")
	}
	return outputChannel
}

export function log(message: string): void {
	const channel = getOutputChannel()
	const timestamp = new Date().toISOString()
	channel.appendLine(`[${timestamp}] ${message}`)
}

export function logError(message: string, error?: unknown): void {
	const channel = getOutputChannel()
	const timestamp = new Date().toISOString()
	const errorMsg = error instanceof Error ? error.message : String(error)
	channel.appendLine(`[${timestamp}] ERROR: ${message} ${errorMsg}`)
}
