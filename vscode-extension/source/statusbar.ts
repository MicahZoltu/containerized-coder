import * as vscode from "vscode"

export function createModelSelectorStatusBarItem() {
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)
  statusBarItem.command = "opencode.model.select"
  statusBarItem.text = "Loading..."
  statusBarItem.tooltip = "Select OpenCode model"
  statusBarItem.show()

  const setModelName = (newText: string) => { statusBarItem.text = newText }
  const dispose = () => statusBarItem.dispose()

  return { setModelName, dispose }
}
