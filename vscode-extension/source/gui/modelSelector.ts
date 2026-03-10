import { OpencodeClient } from '@opencode-ai/sdk/v2'
import * as vscode from 'vscode'
import { getModelList } from '../opencode-helpers.js'

export async function selectModelWithQuickPicker(client: OpencodeClient, noticeError: (message: string, error: unknown) => unknown, setModel: (model: string) => Promise<unknown>) {
	try {
		const models = await getModelList(client, noticeError)
		if (models.length === 0) {
			vscode.window.showWarningMessage("No models available")
			return
		}
		const selected = await vscode.window.showQuickPick(models, { placeHolder: "Select a model", matchOnDescription: true })
		if (selected) await setModel(selected.label)
	} catch (error) {
		noticeError('Failed to get model selection from user', error)
	}
}
