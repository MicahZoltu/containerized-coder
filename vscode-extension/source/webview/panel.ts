import type * as vscode from "vscode"
import { getNonce } from "../utils/miscellaneous.js"

export function openSessionPanel(createWebviewPanel: typeof vscode.window.createWebviewPanel, panels: Map<string, vscode.WebviewPanel>, sessionID: string, sessionTitle: string): void {
	const existingPanel = panels.get(sessionID)
	if (existingPanel) {
		existingPanel.reveal()
		return
	}

	const panel = createWebviewPanel(`opencodeSession-${sessionID}`, sessionTitle, 1 as vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true })
	panel.webview.html = getWebviewContent(panel.webview.cspSource, sessionID, sessionTitle)
	panels.set(sessionID, panel)
	panel.onDidDispose(() => panels.delete(sessionID), null)
}

export function getWebviewContent(cspSource: string, sessionID: string, sessionTitle: string): string {
	const nonce = getNonce()

	const stylesVscode =`
	<style>
		body {
			padding: 1rem;
			margin: 0;
			background-color: var(--vscode-editor-background);
			color: var(--vscode-editor-foreground);
		}
		.title {
			font-size: 1.5rem;
			font-weight: bold;
			margin-bottom: 1rem;
			color: var(--vscode-foreground);
		}
		.placeholder {
			color: var(--vscode-descriptionForeground);
			font-style: italic;
		}
	</style>`

	const scripts = `
	<script nonce="${nonce}">
		window.addEventListener('message', event => {
			const message = event.data;
			console.log('Received message from extension:', message);
		});

		document.addEventListener('DOMContentLoaded', () => {
			console.log('Webview loaded for session:', '${sessionID}');
		});
	</script>`

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
	${stylesVscode}
</head>
<body>
	<div class="container">
		<h1 class="title">${sessionTitle}</h1>
		<p class="placeholder">Session content will be implemented in Phase 3.</p>
	</div>
	${scripts}
</body>
</html>`
}

export function closeSessionPanel(panels: Map<string, vscode.WebviewPanel>, sessionID: string): void {
	const panel = panels.get(sessionID)
	if (panel) {
		panel.dispose()
		panels.delete(sessionID)
	}
}
