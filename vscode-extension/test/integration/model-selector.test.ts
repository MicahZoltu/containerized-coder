import { createOpencodeClient } from '@opencode-ai/sdk/v2'
import { mockFn } from '@tkoehlerlg/bun-mock-extended'
import { describe, expect, test } from 'bun:test'
import { selectModelWithQuickPicker } from '../../source/gui/modelSelector.js'
import { server } from './setup-opencode.js'

describe('selectModelWithQuickPicker', () => {
	test('returns a function that can be used as a command handler', async () => {
		const client = createOpencodeClient({ baseUrl: server.url })
		const noticeError = (_msg: string, _err: unknown) => {}
		const setModel = async (_model: string) => {}
		// Bind to create a callable function
		const handler = selectModelWithQuickPicker.bind(undefined, client, noticeError, setModel)
		expect(typeof handler).toBe('function')
	})

	test('calls setModel with the selected model', async () => {
		const client = createOpencodeClient({ baseUrl: server.url })
		const noticeError = (_msg: string, _err: unknown) => {}
		const mockSetModel = mockFn<Parameters<typeof selectModelWithQuickPicker>[2]>()
		const mockShowQuickPicker = mockFn<Parameters<typeof selectModelWithQuickPicker>[4]>().mockReturnValue(Promise.resolve({alwaysShow: true, description: 'mock', label: 'mock/mock-model'}))

		await selectModelWithQuickPicker(client, noticeError, mockSetModel, async () => 'mock/model', mockShowQuickPicker)

		// The test server has a single provider 'mock' with model 'mock-model'
		expect(mockSetModel).toHaveBeenCalledWith('mock/mock-model')
		expect(mockShowQuickPicker).toHaveBeenCalledWith([{ alwaysShow: true, description: 'mock', label: 'mock/mock-model' }], { placeHolder: "Select a model", matchOnDescription: true })
	})

	test('does not call setModel if quickpick is cancelled', async () => {
		const client = createOpencodeClient({ baseUrl: server.url })
		const noticeError = (_msg: string, _err: unknown) => {}
		let setModelCalled = false
		const setModel = async (_model: string) => { setModelCalled = true }

		await selectModelWithQuickPicker(client, noticeError, setModel, async () => 'mock/model', async () => undefined)
		expect(setModelCalled).toBe(false)
	})
})
