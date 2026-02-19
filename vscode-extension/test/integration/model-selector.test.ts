import { beforeEach, describe, expect, test } from "bun:test";
import * as vscode from "vscode";
import { selectModelWithQuickPicker } from "../../source/gui/modelSelector.js";
import { createModelSelectorStatusBarItem } from "../../source/statusbar.js";

describe("createModelSelectorStatusBarItem", () => {
	beforeEach(() => {
		// Reset the status bar items array in the mock
		(vscode.window as any).statusBarItems = [];
	});

	test("creates a status bar item with correct configuration", () => {
		createModelSelectorStatusBarItem();
		const item = (vscode.window as any).statusBarItems[0] as vscode.StatusBarItem;
		expect(item).toBeDefined();
		expect(item.alignment).toBe(vscode.StatusBarAlignment.Right);
		expect(item.priority).toBe(100);
		expect(item.command).toBe("opencode.model.select");
		expect(item.text).toBe("Loading...");
		expect(item.tooltip).toBe("Select OpenCode model");
	});

	test("setModelName updates the status bar item text", () => {
		const { setModelName } = createModelSelectorStatusBarItem();
		const item = (vscode.window as any).statusBarItems[0] as vscode.StatusBarItem;

		setModelName("openai/gpt-4");
		expect(item.text).toBe("openai/gpt-4");
	});

	test("dispose calls the status bar item dispose method", () => {
		const { dispose } = createModelSelectorStatusBarItem();
		const item = (vscode.window as any).statusBarItems[0] as vscode.StatusBarItem;

		let disposed = false;
		item.dispose = () => { disposed = true; };

		dispose();
		expect(disposed).toBe(true);
	});

	test("returns an object with setModelName and dispose functions", () => {
		const result = createModelSelectorStatusBarItem();
		expect(result.setModelName).toBeDefined();
		expect(result.dispose).toBeDefined();
		expect(typeof result.setModelName).toBe("function");
		expect(typeof result.dispose).toBe("function");
	});
});

describe("selectModelWithQuickPicker", () => {
	test("returns a function that can be used as a command handler", () => {
		const client = {} as any;
		const noticeError = (_msg: string, _err: unknown) => {};
		const setModel = async (_model: string) => {};
		// Bind to create a callable function
		const handler = selectModelWithQuickPicker.bind(undefined, client, noticeError, setModel);
		expect(typeof handler).toBe("function");
	});

	test("shows warning when no providers are available", async () => {
		const client = {
			config: {
				providers: async () => ({ data: { providers: [] } })
			}
		} as any;
		const noticeError = (_msg: string, _err: unknown) => {};
		const setModel = async (_model: string) => {};

		const handler = selectModelWithQuickPicker.bind(undefined, client, noticeError, setModel);

		let warningMessage: string | undefined;
		(vscode.window as any).showWarningMessage = async (msg: string) => {
			warningMessage = msg;
		};

		await handler();
		expect(warningMessage).toBe("No models available");
	});

	test("shows warning when no models are available", async () => {
		const client = {
			config: {
				providers: async () => ({
					data: {
						providers: [{ id: "openai", models: {} }]
					}
				})
			}
		} as any;
		const noticeError = (_msg: string, _err: unknown) => {};
		const setModel = async (_model: string) => {};

		const handler = selectModelWithQuickPicker.bind(undefined, client, noticeError, setModel);

		let warningMessage: string | undefined;
		(vscode.window as any).showWarningMessage = async (msg: string) => {
			warningMessage = msg;
		};

		await handler();
		expect(warningMessage).toBe("No models available");
	});

	test("calls setModel with the selected model", async () => {
		const client = {
			config: {
				providers: async () => ({
					data: {
						providers: [
							{ id: "openai", models: { "gpt-4": {}, "gpt-3.5-turbo": {} } },
							{ id: "anthropic", models: { "claude-3": {} } }
						]
					}
				})
			}
		} as any;
		let capturedModel: string | undefined;
		const setModel = (model: string) => {
			capturedModel = model;
			return Promise.resolve();
		};
		const noticeError = (_msg: string, _err: unknown) => {};

		const handler = selectModelWithQuickPicker.bind(undefined, client, noticeError, setModel);
		await handler();

		expect(capturedModel).toBe("openai/gpt-4");
	});

	test("does not call setModel if quickpick is cancelled", async () => {
		const client = {
			config: {
				providers: async () => ({
					data: {
						providers: [{ id: "openai", models: { "gpt-4": {} } }]
					}
				})
			}
		} as any;
		let setModelCalled = false;
		const setModel = async (_model: string) => { setModelCalled = true; };
		const noticeError = (_msg: string, _err: unknown) => {};

		// Override showQuickPick to return undefined
		(vscode.window as any).showQuickPick = async () => undefined;

		const handler = selectModelWithQuickPicker.bind(undefined, client, noticeError, setModel);
		await handler();
		expect(setModelCalled).toBe(false);
	});
});
