import * as vscode from 'vscode'

declare module 'vscode' {
	interface Window {
		statusBarItems: vscode.StatusBarItem[]
	}
	interface WebviewPanel {
		readonly disposed: boolean
	}
}
