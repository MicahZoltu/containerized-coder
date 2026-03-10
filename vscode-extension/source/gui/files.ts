import { FileDiff } from "@opencode-ai/sdk/v2"
import * as vscode from "vscode"

export function fileDiffToTreeItem(diff: FileDiff) {
	const item = new vscode.TreeItem(diff.file, vscode.TreeItemCollapsibleState.None)
	item.description = `+${diff.additions} -${diff.deletions}`
	item.iconPath = getChangeIcon(diff)
	return item
}

function getChangeIcon(diff: FileDiff): vscode.ThemeIcon {
	switch (diff.status) {
		case 'added':
			return new vscode.ThemeIcon("diff-added")
		case 'deleted':
			return new vscode.ThemeIcon("diff-removed")
		case 'modified':
			return new vscode.ThemeIcon("diff-modified")
		default:
			return new vscode.ThemeIcon("file")
	}
}
