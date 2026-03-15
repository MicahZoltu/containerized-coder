import { OpencodeClient } from "@opencode-ai/sdk/v2"

export async function getModelList(client: OpencodeClient, noticeError: (message: string, error: unknown) => unknown) {
	try {
		const providersResult = await client.config.providers()
		const providers = providersResult.data?.providers ?? []

		const models = []
		for (const provider of providers) {
			const modelKeys = Object.keys(provider.models)
			for (const modelId of modelKeys) {
				models.push({ provider: provider.id, model: modelId })
			}
		}
		const mappedModels = models.map(model => ({ label: `${model.provider}/${model.model}`, description: model.provider, alwaysShow: true }))
		return mappedModels
	} catch (error) {
		noticeError('Failed to get model list from server', error)
		return []
	}
}

export async function getModel(client: OpencodeClient, noticeError: (message: string, error: unknown) => unknown, announce: (modelName: string) => unknown) {
	try {
		const configResult = await client.config.get()
		const model = configResult.data?.model ?? "Not set"
		announce(model)
		return model
	} catch (error) {
		noticeError('Failed to get model from server', error)
		return 'Unknown'
	}
}

export async function setModel(client: OpencodeClient, noticeError: (message: string, error: unknown) => unknown, getModel: () => Promise<unknown>, model: string) {
	try {
		await client.config.update({ config: { model } })
		await getModel()
	} catch (error) {
		noticeError('Failed to set model on server', error)
	}
}
