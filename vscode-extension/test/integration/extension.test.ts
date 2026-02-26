import { type Event as SdkEvent, type Session } from "@opencode-ai/sdk/v2"
import { describe, expect, test } from "bun:test"
import * as vscode from "vscode"
import { registerCommands } from "../../source/commands.js"
import { handleSdkEvent, setupPeriodicRefresh } from "../../source/extension.js"
import { createSessionContext } from "../../source/gui/sessions.js"
import { createMockExtensionContext } from "../helpers.js"

describe("event handler", () => {
	test("handleSdkEvent returns function that handles session.created", () => {
		const sessionsEmitter = new vscode.EventEmitter<void>()
		const fileEmitter = new vscode.EventEmitter<void>()
		const sessionContext = createSessionContext()
		const todoEmitter = new vscode.EventEmitter<void>()

		const session: Session = {
			id: "test",
			slug: "test",
			title: "Test",
			projectID: "proj",
			directory: "/tmp",
			version: "1",
			time: { created: Date.now(), updated: Date.now() }
		}
		const event: SdkEvent = { type: "session.created", properties: { info: session } }
		handleSdkEvent(() => {}, sessionsEmitter, sessionContext, todoEmitter, fileEmitter, event)

		sessionsEmitter.dispose()
	})
})

describe("refresh coordination", () => {
	test("setupPeriodicRefresh returns disposable", () => {
		const refreshFn = async () => {}
		const disposable = setupPeriodicRefresh(refreshFn, () => {})
		expect(disposable).toEqual({ dispose: expect.any(Function) })
		disposable.dispose()
	})
})

describe("command registration", () => {
	test("registerCommands returns disposables", () => {
		const context = createMockExtensionContext()
		const sessionsEmitter = new vscode.EventEmitter<void>()

		const disposables = registerCommands(context, async () => {}, async () => {}, async () => {}, async () => {}, async () => {}, async () => {}, sessionsEmitter)

		expect(Array.isArray(disposables)).toBe(true)
		sessionsEmitter.dispose()
	})
})
