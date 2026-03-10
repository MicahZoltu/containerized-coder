import * as vscode from 'vscode'

declare module 'vscode' {
	namespace window {
		var statusBarItems: vscode.StatusBarItem[]
	}
	interface WebviewPanel {
		readonly disposed: boolean
	}
}
