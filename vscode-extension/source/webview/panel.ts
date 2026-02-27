import * as vscode from "vscode"
import { getNonce } from "../utils.js"

// Map to track open session panels: sessionID -> WebviewPanel
const sessionPanels = new Map<string, vscode.WebviewPanel>()

export function openSessionPanel(context: vscode.ExtensionContext, sessionID: string, sessionTitle: string): vscode.WebviewPanel {
	// Check if panel already exists for this session
	const existingPanel = sessionPanels.get(sessionID)
	if (existingPanel) {
		existingPanel.reveal()
		return existingPanel
	}

	// Create new panel for this session
	const panel = vscode.window.createWebviewPanel(`opencodeSession-${sessionID}`, sessionTitle, vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [context.extensionUri] })

	panel.webview.html = getWebviewContent(panel.webview, sessionID, sessionTitle)

	// Store in map for future reuse
	sessionPanels.set(sessionID, panel)

	// When panel is closed, remove from map
	panel.onDidDispose(() => sessionPanels.delete(sessionID), null)

	return panel
}

function getWebviewContent(webview: vscode.Webview, sessionID: string, sessionTitle: string): string {
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
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
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

// Function to close a session's webview if it exists
export function closeSessionPanel(sessionID: string): void {
	const panel = sessionPanels.get(sessionID)
	if (panel) {
		panel.dispose()
		sessionPanels.delete(sessionID)
	}
}

// Function to dispose all session panels (call on extension deactivate)
export function disposeAllSessionPanels(): void {
	for (const panel of sessionPanels.values()) {
		panel.dispose()
	}
	sessionPanels.clear()
}
