import { FileDiff, OpencodeClient } from "@opencode-ai/sdk/v2"
import * as vscode from "vscode"
import { SessionContext } from "./sessions.js"

export async function getFileDiffs(client: OpencodeClient, session: SessionContext, root?: FileDiff): Promise<FileDiff[]> {
	if (root !== undefined) return []

	const sessionId = session.getCurrentSessionId()
	if (sessionId === null) return []

	const result = await client.session.diff({ sessionID: sessionId })

	return result.data ?? []
}

export function fileDiffToTreeItem(diff: FileDiff) {
	const item = new vscode.TreeItem(diff.file, vscode.TreeItemCollapsibleState.None)
	item.description = `+${diff.additions} -${diff.deletions}`
	item.iconPath = getChangeIcon(diff)
	item.tooltip = `File: ${diff.file}\nAdditions: ${diff.additions}\nDeletions: ${diff.deletions}`
	return item
}

export function getChangeIcon(diff: FileDiff): vscode.ThemeIcon {
	if (diff.additions > 0 && diff.deletions === 0) {
		return new vscode.ThemeIcon("git-add")
	} else if (diff.deletions > 0 && diff.additions === 0) {
		return new vscode.ThemeIcon("git-remove")
	} else if (diff.additions > 0 || diff.deletions > 0) {
		return new vscode.ThemeIcon("git-modified")
	} else {
		return new vscode.ThemeIcon("file")
	}
}
