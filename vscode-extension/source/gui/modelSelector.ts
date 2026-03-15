import { OpencodeClient } from '@opencode-ai/sdk/v2'
import type * as vscode from 'vscode'
import { getModelList } from '../utils/opencode-helpers.js'

export async function selectModelWithQuickPicker(client: OpencodeClient, noticeError: (message: string, error: unknown) => unknown, setModel: (model: string) => Promise<unknown>, showWarningMessage: (message: string, options: { modal?: boolean }, ...actions: string[]) => Promise<string | undefined>, showQuickPick: <T extends vscode.QuickPickItem>(items: T[], options?: vscode.QuickPickOptions) => Promise<T | undefined>) {
	try {
		const models = await getModelList(client, noticeError)
		if (models.length === 0) {
			await showWarningMessage("No models available", {})
			return
		}
		const selected = await showQuickPick(models, { placeHolder: "Select a model", matchOnDescription: true })
		if (selected) await setModel(selected.label)
	} catch (error) {
		noticeError('Failed to get model selection from user', error)
	}
}
