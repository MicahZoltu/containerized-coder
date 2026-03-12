import { OpencodeClient, Todo } from "@opencode-ai/sdk/v2"
import type * as vscode from "vscode"
import { SessionContext } from "./sessions.js"

export async function getTodos(client: OpencodeClient, session: SessionContext, root?: Todo): Promise<Todo[]> {
	if (root !== undefined) return []

	const sessionId = session.getCurrentSessionId()
	if (sessionId === null) return [{ content: 'Select A Session', priority: '', status: '' }]

	const result = await client.session.todo({ sessionID: sessionId })

	return result.data ?? []
}

export function todoItemToTreeItem(createTreeItem: (label: string, collapsibleState: vscode.TreeItemCollapsibleState) => vscode.TreeItem, todo: Todo): vscode.TreeItem {
	const treeItem = createTreeItem(todo.content, 0 as vscode.TreeItemCollapsibleState.None)
	treeItem.checkboxState = (todo.status === 'completed') ? 1 as vscode.TreeItemCheckboxState.Checked : 0 as vscode.TreeItemCheckboxState.Unchecked
	treeItem.id = todo.content
	return treeItem
}
