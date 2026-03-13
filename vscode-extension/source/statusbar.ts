import type * as vscode from "vscode"

export function createModelSelectorStatusBarItem(createStatusBarItem: (alignment: vscode.StatusBarAlignment, priority: number) => vscode.StatusBarItem) {
	const statusBarItem = createStatusBarItem(2 as vscode.StatusBarAlignment.Right, 100)
	statusBarItem.command = "opencode.model.select"
	statusBarItem.text = "Loading..."
	statusBarItem.tooltip = "Select OpenCode model"
	statusBarItem.show()

	const setModelName = (newText: string) => { statusBarItem.text = newText }
	const dispose = () => statusBarItem.dispose()

	return { setModelName, dispose }
}
