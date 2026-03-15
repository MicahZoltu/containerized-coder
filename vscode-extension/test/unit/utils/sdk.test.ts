import * as vscode from "vscode"
import { createOpencodeClient, type Event as SdkEvent, type Session, type UnknownError } from "@opencode-ai/sdk/v2"
import { describe, expect, test } from "bun:test"
import { createSessionContext } from "../../../source/gui/sessions.js"
import { EventEmitter } from '../../../source/utils/emitter.js'
import { handleSdkEvent, isSdkEvent } from "../../../source/utils/sdk.js"
import { closeSessionPanel, openSessionPanel } from '../../../source/webview/panel.js'

describe("handleSdkEvent", () => {
	test("session.created triggers sessionsEmitter.fire", async () => {
		const client = createOpencodeClient({ baseUrl: "http://localhost:3000" })
		const sessionsEmitter = new EventEmitter<void>(() => {})
		const fileEmitter = new EventEmitter<void>(() => {})
		const sessionContext = createSessionContext(() => {})
		const todoEmitter = new EventEmitter<void>(() => {})
		const panels = new Map<string, vscode.WebviewPanel>()

		let fireCount = 0
		sessionsEmitter.fire = () => { fireCount++ }

		const created = await client.session.create({})
		const session = created.data!

		const event: SdkEvent = { type: "session.created", properties: { info: session } }

		handleSdkEvent(() => {}, sessionsEmitter, sessionContext, todoEmitter, fileEmitter, closeSessionPanel.bind(undefined, panels), event)

		expect(fireCount).toBe(1)
		sessionsEmitter.dispose()
	})

	test("session.updated triggers sessionsEmitter.fire", async () => {
		const client = createOpencodeClient({ baseUrl: "http://localhost:3000" })
		const sessionsEmitter = new EventEmitter<void>(() => {})
		const fileEmitter = new EventEmitter<void>(() => {})
		const sessionContext = createSessionContext(() => {})
		const todoEmitter = new EventEmitter<void>(() => {})
		const panels = new Map<string, vscode.WebviewPanel>()

		let fireCount = 0
		sessionsEmitter.fire = () => { fireCount++ }

		const created = await client.session.create({})
		const session = created.data!

		const event: SdkEvent = { type: "session.updated", properties: { info: session } }

		handleSdkEvent(() => {}, sessionsEmitter, sessionContext, todoEmitter, fileEmitter, closeSessionPanel.bind(undefined, panels), event)

		expect(fireCount).toBe(1)
		sessionsEmitter.dispose()
	})

	test("session.deleted triggers sessionsEmitter.fire and closes panel", async () => {
		const sessionsEmitter = new EventEmitter<void>(() => {})
		const fileEmitter = new EventEmitter<void>(() => {})
		const sessionContext = createSessionContext(() => {})
		const todoEmitter = new EventEmitter<void>(() => {})
		const panels = new Map<string, vscode.WebviewPanel>()

		let fireCount = 0
		sessionsEmitter.fire = () => { fireCount++ }

		const sessionID = "test-session-id"
		const createWebviewPanel = vscode.window.createWebviewPanel.bind(vscode.window)
		openSessionPanel(createWebviewPanel, panels, sessionID, "Test Session")
		const sessionPanel = panels.get(sessionID)

		const session: Session = {
			id: sessionID,
			slug: "test",
			projectID: "proj",
			directory: "/tmp",
			title: "Test",
			version: "1",
			time: { created: Date.now(), updated: Date.now() }
		}

		const event: SdkEvent = { type: "session.deleted", properties: { info: session } }

		handleSdkEvent(() => {}, sessionsEmitter, sessionContext, todoEmitter, fileEmitter, closeSessionPanel.bind(undefined, panels), event)

		expect(fireCount).toBe(1)
		expect(sessionPanel?.disposed).toBe(true)
		sessionsEmitter.dispose()
	})

	test("todo.updated triggers todos refresh only for matching session", async () => {
		const sessionsEmitter = new EventEmitter<void>(() => {})
		const fileEmitter = new EventEmitter<void>(() => {})
		const sessionContext = createSessionContext(() => {})
		const todoEmitter = new EventEmitter<void>(() => {})
		const panels = new Map<string, vscode.WebviewPanel>()

		sessionContext.selectSession("selected-session")

		let emitted = false
		const dispose = todoEmitter.onFire(() => { emitted = true })


		handleSdkEvent(() => {}, sessionsEmitter, sessionContext, todoEmitter, fileEmitter, closeSessionPanel.bind(undefined, panels), { type: "todo.updated", properties: { sessionID: "selected-session", todos: [] } })
		expect(emitted).toBe(true)

		emitted = false
		handleSdkEvent(() => {}, sessionsEmitter, sessionContext, todoEmitter, fileEmitter, closeSessionPanel.bind(undefined, panels), { type: "todo.updated", properties: { sessionID: "other-session", todos: [] } })
		expect(emitted).toBe(false)

		dispose.dispose()
		sessionsEmitter.dispose()
	})

	test("session.diff triggers fileEmitter.fire only for matching session", async () => {
		const sessionsEmitter = new EventEmitter<void>(() => {})
		const fileEmitter = new EventEmitter<void>(() => {})
		const sessionContext = createSessionContext(() => {})
		const todoEmitter = new EventEmitter<void>(() => {})
		const panels = new Map<string, vscode.WebviewPanel>()

		sessionContext.selectSession("selected-session")

		let fireCount = 0
		fileEmitter.fire = () => { fireCount++ }

		handleSdkEvent(() => {}, sessionsEmitter, sessionContext, todoEmitter, fileEmitter, closeSessionPanel.bind(undefined, panels), { type: "session.diff", properties: { sessionID: "selected-session", diff: [] } })
		expect(fireCount).toBe(1)

		fireCount = 0
		handleSdkEvent(() => {}, sessionsEmitter, sessionContext, todoEmitter, fileEmitter, closeSessionPanel.bind(undefined, panels), { type: "session.diff", properties: { sessionID: "other-session", diff: [] } })
		expect(fireCount).toBe(0)
		sessionsEmitter.dispose()
	})

	test("session.status triggers sessionsEmitter.fire", async () => {
		const sessionsEmitter = new EventEmitter<void>(() => {})
		const fileEmitter = new EventEmitter<void>(() => {})
		const sessionContext = createSessionContext(() => {})
		const todoEmitter = new EventEmitter<void>(() => {})
		const panels = new Map<string, vscode.WebviewPanel>()

		let fireCount = 0
		sessionsEmitter.fire = () => { fireCount++ }

		const event: SdkEvent = {
			type: "session.status",
			properties: { sessionID: "session-123", status: { type: "busy" } }
		}

		handleSdkEvent(() => {}, sessionsEmitter, sessionContext, todoEmitter, fileEmitter, closeSessionPanel.bind(undefined, panels), event)

		expect(fireCount).toBe(1)
		sessionsEmitter.dispose()
	})

	test("session.idle triggers sessionsEmitter.fire", async () => {
		const sessionsEmitter = new EventEmitter<void>(() => {})
		const fileEmitter = new EventEmitter<void>(() => {})
		const sessionContext = createSessionContext(() => {})
		const todoEmitter = new EventEmitter<void>(() => {})
		const panels = new Map<string, vscode.WebviewPanel>()

		let fireCount = 0
		sessionsEmitter.fire = () => { fireCount++ }

		const event: SdkEvent = { type: "session.idle", properties: { sessionID: "session-123" } }

		handleSdkEvent(() => {}, sessionsEmitter, sessionContext, todoEmitter, fileEmitter, closeSessionPanel.bind(undefined, panels), event)

		expect(fireCount).toBe(1)
		sessionsEmitter.dispose()
	})

	test("session.error shows error message", async () => {
		const sessionsEmitter = new EventEmitter<void>(() => {})
		const fileEmitter = new EventEmitter<void>(() => {})
		const sessionContext = createSessionContext(() => {})
		const todoEmitter = new EventEmitter<void>(() => {})
		const panels = new Map<string, vscode.WebviewPanel>()

		const showErrorCalls: unknown[] = []
		const noticeError = (_: string, message: unknown) => showErrorCalls.push(message)

		const error: UnknownError = {
			name: "UnknownError",
			data: { message: "Test error message" }
		}

		const event: SdkEvent = {
			type: "session.error",
			properties: { error }
		}

		handleSdkEvent(noticeError, sessionsEmitter, sessionContext, todoEmitter, fileEmitter, closeSessionPanel.bind(undefined, panels), event)

		expect(showErrorCalls.length).toBe(1)
		expect(showErrorCalls[0]).toContain("Test error message")
		sessionsEmitter.dispose()
	})

	test("unknown event types are ignored", async () => {
		const sessionsEmitter = new EventEmitter<void>(() => {})
		const fileEmitter = new EventEmitter<void>(() => {})
		const sessionContext = createSessionContext(() => {})
		const todoEmitter = new EventEmitter<void>(() => {})
		const panels = new Map<string, vscode.WebviewPanel>()

		let fireCount = 0
		sessionsEmitter.fire = () => { fireCount++ }

		handleSdkEvent(() => {}, sessionsEmitter, sessionContext, todoEmitter, fileEmitter, closeSessionPanel.bind(undefined, panels), { type: "unknown.event.type", properties: {} } as unknown as SdkEvent)

		expect(fireCount).toBe(0)
		sessionsEmitter.dispose()
	})
})

describe("isSdkEvent", () => {
	test("returns true for valid SDK event", () => {
		expect(isSdkEvent({ type: "session.created", properties: { info: {} } })).toBe(true)
	})

	test("returns false for null", () => {
		expect(isSdkEvent(null)).toBe(false)
	})

	test("returns false for undefined", () => {
		expect(isSdkEvent(undefined)).toBe(false)
	})

	test("returns false for object without type string", () => {
		expect(isSdkEvent({ type: 123, properties: {} })).toBe(false)
		expect(isSdkEvent({ notType: "missing" })).toBe(false)
	})

	test("returns false for object with non-object properties", () => {
		expect(isSdkEvent({ type: "test", properties: "should be object" })).toBe(false)
		expect(isSdkEvent({ type: "test", properties: 42 })).toBe(false)
	})

	test("returns true when properties is null", () => {
		expect(isSdkEvent({ type: "test", properties: null })).toBe(true)
	})

	test("returns true when properties is undefined", () => {
		expect(isSdkEvent({ type: "test" })).toBe(true)
	})

	test("accepts plain object with arbitrary properties", () => {
		expect(isSdkEvent({ type: "session.created", properties: { info: { id: "1" }, extra: "data" } })).toBe(true)
	})
})
