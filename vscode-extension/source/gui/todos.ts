import { OpencodeClient, Todo } from "@opencode-ai/sdk/v2"
import * as vscode from "vscode"
import { SessionContext } from "./sessions.js"

export async function getTodos(client: OpencodeClient, session: SessionContext, root?: Todo): Promise<Todo[]> {
	if (root !== undefined) return []

	const sessionId = session.getCurrentSessionId()
	if (sessionId === null) return [{ content: 'Select A Session', priority: '', status: '' }]

	const result = await client.session.todo({ sessionID: sessionId })

	return result.data ?? []
}

export function todoItemToTreeItem(todo: Todo) {
	const treeItem = new vscode.TreeItem(todo.content, vscode.TreeItemCollapsibleState.None)
	treeItem.checkboxState = todo.status === 'completed' ? vscode.TreeItemCheckboxState.Checked : vscode.TreeItemCheckboxState.Unchecked
	// Use content as the ID since v2 Todo doesn't have an id field
	treeItem.id = todo.content
	return treeItem
}
