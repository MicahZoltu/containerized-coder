import { FileDiff } from "@opencode-ai/sdk/v2"
import type * as vscode from 'vscode'

export function fileDiffToTreeItem(createTreeItem: (label: string, collapsibleState: vscode.TreeItemCollapsibleState) => vscode.TreeItem, createThemeIcon: (id: string) => vscode.ThemeIcon, diff: FileDiff): vscode.TreeItem {
	const item = createTreeItem(diff.file, 0 as vscode.TreeItemCollapsibleState.None)
	item.description = `+${diff.additions} -${diff.deletions}`
	item.iconPath = getChangeIcon(createThemeIcon, diff)
	return item
}

function getChangeIcon(createThemeIcon: (id: string) => vscode.ThemeIcon, diff: FileDiff): vscode.ThemeIcon {
	switch (diff.status) {
		case 'added':
			return createThemeIcon("diff-added")
		case 'deleted':
			return createThemeIcon("diff-removed")
		case 'modified':
			return createThemeIcon("diff-modified")
		default:
			return createThemeIcon("file")
	}
}
