import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import { beforeEach, describe, expect, test } from "bun:test"
import * as vscode from "vscode"
import { selectModelWithQuickPicker } from "../../source/gui/modelSelector.js"
import { createModelSelectorStatusBarItem } from "../../source/statusbar.js"
import { server } from "./setup-opencode.js"

describe("createModelSelectorStatusBarItem", () => {
	beforeEach(() => {
		// Reset the status bar items array in the mock
		vscode.window.statusBarItems = []
	})

	test("creates a status bar item with correct configuration", () => {
		createModelSelectorStatusBarItem()
		const item = vscode.window.statusBarItems[0] as vscode.StatusBarItem
		expect(item).toBeDefined()
		expect(item.alignment).toBe(vscode.StatusBarAlignment.Right)
		expect(item.priority).toBe(100)
		expect(item.command).toBe("opencode.model.select")
		expect(item.text).toBe("Loading...")
		expect(item.tooltip).toBe("Select OpenCode model")
	})

	test("setModelName updates the status bar item text", () => {
		const { setModelName } = createModelSelectorStatusBarItem()
		const item = vscode.window.statusBarItems[0] as vscode.StatusBarItem

		setModelName("openai/gpt-4")
		expect(item.text).toBe("openai/gpt-4")
	})

	test("dispose calls the status bar item dispose method", () => {
		const { dispose } = createModelSelectorStatusBarItem()
		const item = vscode.window.statusBarItems[0] as vscode.StatusBarItem

		let disposed = false
		item.dispose = () => { disposed = true }

		dispose()
		expect(disposed).toBe(true)
	})

	test("returns an object with setModelName and dispose functions", () => {
		const result = createModelSelectorStatusBarItem()
		expect(result.setModelName).toBeDefined()
		expect(result.dispose).toBeDefined()
		expect(typeof result.setModelName).toBe("function")
		expect(typeof result.dispose).toBe("function")
	})
})

describe("selectModelWithQuickPicker", () => {
	test("returns a function that can be used as a command handler", async () => {
		const client = createOpencodeClient({ baseUrl: server.url })
		const noticeError = (_msg: string, _err: unknown) => {}
		const setModel = async (_model: string) => {}
		// Bind to create a callable function
		const handler = selectModelWithQuickPicker.bind(undefined, client, noticeError, setModel)
		expect(typeof handler).toBe("function")
	})

	test("shows warning when no providers are available", async () => {
		// TODO
	})

	test("shows warning when no models are available", async () => {
		// TODO
	})

	test("calls setModel with the selected model", async () => {
		const client = createOpencodeClient({ baseUrl: server.url })
		const noticeError = (_msg: string, _err: unknown) => {}
		let capturedModel: string | undefined
		const setModel = (model: string) => {
			capturedModel = model
			return Promise.resolve()
		}

		await selectModelWithQuickPicker(client, noticeError, setModel)

		// The test server has a single provider "mock" with model "mock-model"
		expect(capturedModel).toBe("mock/mock-model")
	})

	test("does not call setModel if quickpick is cancelled", async () => {
		const client = createOpencodeClient({ baseUrl: server.url })
		const noticeError = (_msg: string, _err: unknown) => {}
		let setModelCalled = false
		const setModel = async (_model: string) => { setModelCalled = true }

		// Override showQuickPick to return undefined
		vscode.window.showQuickPick = async () => undefined

		await selectModelWithQuickPicker(client, noticeError, setModel)
		expect(setModelCalled).toBe(false)
	})
})
