import { OpencodeClient } from '@opencode-ai/sdk/v2'
import { mock, mockFn } from '@tkoehlerlg/bun-mock-extended'
import { describe, expect, test } from 'bun:test'
import { selectModelWithQuickPicker } from '../../../source/gui/modelSelector.js'

describe('selectModelWithQuickPicker', () => {
	test('shows warning when no providers are available', async () => {
		const mockClient = mock<OpencodeClient>()
		const providerReturnValue = mock<Awaited<ReturnType<OpencodeClient['config']['providers']>>>({ data: { providers: [] } })
		mockClient.config.providers = mockFn<OpencodeClient['config']['providers']>().mockResolvedValue(providerReturnValue)

		const mockShowWarningMessage = mockFn<Parameters<typeof selectModelWithQuickPicker>[3]>()
		const setModel = async (_model: string) => {}

		await selectModelWithQuickPicker(mockClient, () => {}, setModel, mockShowWarningMessage, async () => undefined)

		expect(mockShowWarningMessage).toHaveBeenCalledWith("No models available", {})
	})

	test('shows warning when no models are available', async () => {
		const mockClient = mock<OpencodeClient>()
		const providerReturnValue = mock<Awaited<ReturnType<OpencodeClient['config']['providers']>>>({ data: { providers: [{ id: 'test', models: {} }] } })
		mockClient.config.providers = mockFn<OpencodeClient['config']['providers']>().mockResolvedValue(providerReturnValue)

		const mockShowWarningMessage = mockFn<Parameters<typeof selectModelWithQuickPicker>[3]>()
		const setModel = async (_model: string) => {}

		await selectModelWithQuickPicker(mockClient, () => {}, setModel, mockShowWarningMessage, async () => undefined)

		expect(mockShowWarningMessage).toHaveBeenCalledWith("No models available", {})
	})
})
