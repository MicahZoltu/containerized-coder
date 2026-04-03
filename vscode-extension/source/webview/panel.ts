import type * as vscode from "vscode"
import { getNonce } from "../utils/miscellaneous.js"
import type { SessionStateManagerInterface } from "../state/session-manager.js"

export function openSessionPanel(createWebviewPanel: typeof vscode.window.createWebviewPanel, panels: Map<string, vscode.WebviewPanel>, sessionManager: SessionStateManagerInterface, sessionID: string, sessionTitle: string): void {
	const existingPanel = panels.get(sessionID)
	if (existingPanel) {
		existingPanel.reveal()
		return
	}

	const panel = createWebviewPanel(`opencodeSession-${sessionID}`, sessionTitle, 1 as vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true })
	panel.webview.html = getWebviewContent(panel.webview.cspSource, sessionID, sessionTitle)
	panels.set(sessionID, panel)

	sessionManager.initializeSession(sessionID)

	const unsubscribe = sessionManager.subscribe(sessionID, (state) => {
		if (panel) {
			panel.webview.postMessage({ type: 'RENDER', state })
		}
	})

	panel.onDidDispose(() => {
		unsubscribe()
		panels.delete(sessionID)
	})
}

export function getWebviewContent(cspSource: string, sessionID: string, _sessionTitle: string): string {
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
		.message {
			margin: 1rem 0;
			padding: 0.5rem;
			border-radius: 4px;
		}
		.message-user {
			background-color: var(--vscode-sideBar-background);
		}
		.message-assistant {
			background-color: var(--vscode-editor-background);
		}
		.part {
			margin: 0.25rem 0;
		}
		.part-text {
			white-space: pre-wrap;
		}
		.part-reasoning {
			background-color: var(--vscode-editor-inactiveSelectionBackground);
			padding: 0.5rem;
			border-radius: 4px;
			font-style: italic;
		}
		.part-tool {
			background-color: var(--vscode-list-inactiveSelectionBackground);
			padding: 0.5rem;
			border-radius: 4px;
		}
		.part-file {
			display: inline-block;
			margin: 0.25rem;
			padding: 0.25rem 0.5rem;
			background-color: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			border-radius: 4px;
			text-decoration: none;
		}
		.part-step-start {
			border-left: 3px solid var(--vscode-progressBar-background);
			padding-left: 0.5rem;
			font-weight: bold;
		}
		.part-step-finish {
			border-left: 3px solid var(--vscode-charts-green);
			padding-left: 0.5rem;
		}
		.part-patch {
			background-color: var(--vscode-charts-green);
			padding: 0.5rem;
			border-radius: 4px;
		}
		.part-agent {
			background-color: var(--vscode-charts-blue);
			padding: 0.5rem;
			border-radius: 4px;
		}
		.part-retry {
			background-color: var(--vscode-charts-red);
			padding: 0.5rem;
			border-radius: 4px;
		}
		.part-compaction {
			background-color: var(--vscode-charts-yellow);
			padding: 0.5rem;
			border-radius: 4px;
		}
		.part-subtask {
			background-color: var(--vscode-charts-purple);
			padding: 0.5rem;
			border-radius: 4px;
		}
		.status-idle {
			color: var(--vscode-charts-green);
		}
		.status-busy {
			color: var(--vscode-charts-yellow);
		}
		.status-retry {
			color: var(--vscode-charts-red);
		}
		.todos {
			margin: 1rem 0;
		}
		.todo-item {
			padding: 0.25rem 0;
			border-bottom: 1px solid var(--vscode-panel-border);
		}
		.file-diffs {
			margin: 1rem 0;
		}
		.diff-item {
			padding: 0.25rem 0;
			border-bottom: 1px solid var(--vscode-panel-border);
		}
		.diff-added {
			color: var(--vscode-charts-green);
		}
		.diff-deleted {
			color: var(--vscode-charts-red);
		}
		.diff-modified {
			color: var(--vscode-charts-yellow);
		}
	</style>`

	const scripts = `
	<script nonce="${nonce}">
		let currentState = null;

		window.addEventListener('message', event => {
			const message = event.data;
			if (message.type === 'RENDER') {
				currentState = message.state;
				renderState(currentState);
			}
		});

		function renderState(state) {
			const container = document.querySelector('.container');
			container.innerHTML = '';

			const title = document.createElement('h1');
			title.className = 'title';
			title.textContent = state.session.title;
			container.appendChild(title);

			const status = document.createElement('p');
			status.className = 'status status-' + state.session.status;
			status.textContent = 'Status: ' + state.session.status;
			container.appendChild(status);

			const messagesDiv = document.createElement('div');
			messagesDiv.className = 'messages';
			state.messages.forEach(message => {
				const messageEl = renderMessage(message);
				messagesDiv.appendChild(messageEl);
			});
			container.appendChild(messagesDiv);

			if (state.todos.length > 0) {
				const todosDiv = document.createElement('div');
				todosDiv.className = 'todos';
				todosDiv.innerHTML = '<h3>Todo Items</h3>' + state.todos.map(todo => {
					return '<div class="todo-item">' + todo.content + ' [' + todo.status + ']</div>';
				}).join('');
				container.appendChild(todosDiv);
			}

			if (state.fileDiffs.length > 0) {
				const diffsDiv = document.createElement('div');
				diffsDiv.className = 'file-diffs';
				diffsDiv.innerHTML = '<h3>File Changes</h3>' + state.fileDiffs.map(diff => {
					return '<div class="diff-item diff-' + diff.status + '">' + diff.file + ' (+' + diff.additions + ' -' + diff.deletions + ')</div>';
				}).join('');
				container.appendChild(diffsDiv);
			}
		}

		function renderMessage(message) {
			const container = document.createElement('div');
			container.className = 'message message-' + message.role;

			const roleLabel = document.createElement('strong');
			roleLabel.textContent = message.role.toUpperCase();
			container.appendChild(roleLabel);

			message.parts.forEach(part => {
				const partEl = renderPart(part);
				container.appendChild(partEl);
			});

			return container;
		}

		function renderPart(part) {
			const container = document.createElement('div');
			container.className = 'part part-' + part.type;

			switch (part.type) {
				case 'text':
					container.textContent = part.text;
					break;
				case 'reasoning':
					container.textContent = 'Reasoning: ' + part.text;
					break;
				case 'tool':
					container.textContent = 'Tool: ' + part.status + (part.title ? ' - ' + part.title : '');
					if (part.output) {
						const output = document.createElement('pre');
						output.textContent = part.output;
						container.appendChild(output);
					}
					break;
				case 'file':
					const link = document.createElement('a');
					link.className = 'part-file';
					link.href = part.url;
					link.textContent = part.filename || part.url;
					link.target = '_blank';
					container.appendChild(link);
					break;
				case 'step-start':
					container.textContent = 'Step started';
					break;
				case 'step-finish':
					container.textContent = 'Step finished: ' + part.reason;
					break;
				case 'patch':
					container.textContent = 'Patch: ' + part.hash + ' (' + part.files.length + ' files)';
					break;
				case 'agent':
					container.textContent = 'Agent: ' + part.name;
					break;
				case 'retry':
					container.textContent = 'Retry attempt ' + part.attempt;
					break;
				case 'compaction':
					container.textContent = 'Compaction: ' + (part.auto ? 'auto' : 'manual');
					break;
				case 'subtask':
					container.textContent = 'Subtask: ' + part.description + ' (' + part.agent + ')';
					break;
				case 'snapshot':
					container.textContent = 'Snapshot available';
					break;
				default:
					container.textContent = 'Unknown part type: ' + part.type;
			}

			return container;
		}

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
	<div class="container"></div>
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
