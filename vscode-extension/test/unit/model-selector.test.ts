import { OpencodeClient } from '@opencode-ai/sdk/v2'
import { mock, mockFn } from '@tkoehlerlg/bun-mock-extended'
import { describe, expect, test } from 'bun:test'
import type * as vscode from 'vscode'
import { selectModelWithQuickPicker } from '../../source/gui/modelSelector.js'
import { createModelSelectorStatusBarItem } from '../../source/statusbar.js'

describe('createModelSelectorStatusBarItem', () => {
	test('creates a status bar item with correct configuration', () => {
		const mockItem = mock<vscode.StatusBarItem>()
		const mockCreateStatusBarItem = mockFn<(alignment: vscode.StatusBarAlignment, priority: number) => vscode.StatusBarItem>()
		mockCreateStatusBarItem.mockReturnValue(mockItem)

		createModelSelectorStatusBarItem(mockCreateStatusBarItem)

		expect(mockCreateStatusBarItem).toHaveBeenCalledWith(2, 100)
		expect(mockItem.command).toBe('opencode.model.select')
		expect(mockItem.text).toBe('Loading...')
		expect(mockItem.tooltip).toBe('Select OpenCode model')
		expect(mockItem.show).toHaveBeenCalled()
	})

	test('setModelName updates the status bar item text', () => {
		const mockItem = mock<vscode.StatusBarItem>()
		const { setModelName } = createModelSelectorStatusBarItem(() => mockItem)

		setModelName('openai/gpt-4')
		expect(mockItem.text).toBe('openai/gpt-4')
	})

	test('dispose calls the status bar item dispose method', () => {
		const mockItem = mock<vscode.StatusBarItem>()
		const { dispose } = createModelSelectorStatusBarItem(() => mockItem)

		dispose()
		expect(mockItem.dispose).toHaveBeenCalled()
	})

	test('returns an object with setModelName and dispose functions', () => {
		const mockItem = mock<vscode.StatusBarItem>()
		const result = createModelSelectorStatusBarItem(() => mockItem)
		expect(result.setModelName).toBeDefined()
		expect(result.dispose).toBeDefined()
		expect(typeof result.setModelName).toBe('function')
		expect(typeof result.dispose).toBe('function')
	})
})

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
