import { createOpencodeClient, type Event as SdkEvent, type Session, type UnknownError } from "@opencode-ai/sdk/v2"
import { afterEach, describe, expect, test } from "bun:test"
import * as vscode from 'vscode'
import { handleSdkEvent } from "../../source/extension.js"
import { createSessionContext } from "../../source/gui/sessions.js"
import { openSessionPanel } from '../../source/webview/panel.js'
import { createMockExtensionContext } from "../helpers.js"
import { mockLlm } from "./setup-mock-llm.js"
import { server } from "./setup-opencode.mjs"

describe("server SSE events", () => {
	afterEach(async () => {
		mockLlm.clear()
		for (const sessionId in await server.client.session.list()) {
			await server.client.session.delete({ sessionID: sessionId }).catch(() => {})
		}
	})

	test("subscribe to events", async () => {
		const events: SdkEvent[] = []

		const result = await server.client.event.subscribe()

		;(async () => {
			for await (const event of result.stream) {
				events.push(event)
			}
		})()

		await new Promise((r) => setTimeout(r, 100))

		await server.client.session.create({})
		await new Promise((r) => setTimeout(r, 500))

		const createdEvents = events.filter((e) => e.type === "session.created")
		expect(createdEvents.length).toBeGreaterThan(0)
	})

	test("receive session events", async () => {
		const events: SdkEvent[] = []

		const result = await server.client.event.subscribe()

		;(async () => {
			for await (const event of result.stream) {
				events.push(event)
			}
		})()

		await new Promise((r) => setTimeout(r, 100))

		const created = await server.client.session.create({})
		const sessionId = created.data!.id

		await server.client.session.update({
			sessionID: sessionId,
			title: "New Title",
		})

		await new Promise((r) => setTimeout(r, 500))

		const updatedEvents = events.filter((e) => e.type === "session.updated")
		expect(updatedEvents.length).toBeGreaterThan(0)
	})
})

describe("extension event handler", () => {
	test("session.created triggers sessionsEmitter.fire", async () => {
		const client = createOpencodeClient({ baseUrl: server.url })
		const sessionsEmitter = new vscode.EventEmitter<void>()
		const fileEmitter = new vscode.EventEmitter<void>()
		const sessionContext = createSessionContext()
		const todoEmitter = new vscode.EventEmitter<void>()

		let fireCount = 0
		sessionsEmitter.fire = () => { fireCount++ }

		const created = await client.session.create({})
		const session = created.data!

		const event: SdkEvent = { type: "session.created", properties: { info: session } }

		handleSdkEvent(() => {}, sessionsEmitter, sessionContext, todoEmitter, fileEmitter, event)

		expect(fireCount).toBe(1)
		sessionsEmitter.dispose()
	})

	test("session.updated triggers sessionsEmitter.fire", async () => {
		const client = createOpencodeClient({ baseUrl: server.url })
		const sessionsEmitter = new vscode.EventEmitter<void>()
		const fileEmitter = new vscode.EventEmitter<void>()
		const sessionContext = createSessionContext()
		const todoEmitter = new vscode.EventEmitter<void>()

		let fireCount = 0
		sessionsEmitter.fire = () => { fireCount++ }

		const created = await client.session.create({})
		const session = created.data!

		const event: SdkEvent = { type: "session.updated", properties: { info: session } }

		handleSdkEvent(() => {}, sessionsEmitter, sessionContext, todoEmitter, fileEmitter, event)

		expect(fireCount).toBe(1)
		sessionsEmitter.dispose()
	})

	test("session.deleted triggers sessionsEmitter.fire and closes panel", async () => {
		const sessionsEmitter = new vscode.EventEmitter<void>()
		const fileEmitter = new vscode.EventEmitter<void>()
		const sessionContext = createSessionContext()
		const todoEmitter = new vscode.EventEmitter<void>()

		let fireCount = 0
		sessionsEmitter.fire = () => { fireCount++ }

		const context = createMockExtensionContext()
		const sessionID = "test-session-id"
		const sessionPanel = openSessionPanel(context, sessionID, "Test Session")

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

		handleSdkEvent(() => {}, sessionsEmitter, sessionContext, todoEmitter, fileEmitter, event)

		expect(fireCount).toBe(1)
		expect(sessionPanel.disposed).toBe(true)
		sessionsEmitter.dispose()
	})

	test("todo.updated triggers todos refresh only for matching session", async () => {
		const sessionsEmitter = new vscode.EventEmitter<void>()
		const fileEmitter = new vscode.EventEmitter<void>()
		const sessionContext = createSessionContext()
		const todoEmitter = new vscode.EventEmitter<void>()

		sessionContext.selectSession("selected-session")

		let emitted = false
		const dispose = todoEmitter.event(() => { emitted = true })


		handleSdkEvent(() => {}, sessionsEmitter, sessionContext, todoEmitter, fileEmitter, { type: "todo.updated", properties: { sessionID: "selected-session", todos: [] } })
		expect(emitted).toBe(true)

		emitted = false
		handleSdkEvent(() => {}, sessionsEmitter, sessionContext, todoEmitter, fileEmitter, { type: "todo.updated", properties: { sessionID: "other-session", todos: [] } })
		expect(emitted).toBe(false)

		dispose.dispose()
		sessionsEmitter.dispose()
	})

	test("session.diff triggers fileEmitter.fire only for matching session", async () => {
		const sessionsEmitter = new vscode.EventEmitter<void>()
		const fileEmitter = new vscode.EventEmitter<void>()
		const sessionContext = createSessionContext()
		const todoEmitter = new vscode.EventEmitter<void>()

		sessionContext.selectSession("selected-session")

		let fireCount = 0
		fileEmitter.fire = () => { fireCount++ }

		handleSdkEvent(() => {}, sessionsEmitter, sessionContext, todoEmitter, fileEmitter, { type: "session.diff", properties: { sessionID: "selected-session", diff: [] } })
		expect(fireCount).toBe(1)

		fireCount = 0
		handleSdkEvent(() => {}, sessionsEmitter, sessionContext, todoEmitter, fileEmitter, { type: "session.diff", properties: { sessionID: "other-session", diff: [] } })
		expect(fireCount).toBe(0)
		sessionsEmitter.dispose()
	})

	test("session.status triggers sessionsEmitter.fire", async () => {
		const sessionsEmitter = new vscode.EventEmitter<void>()
		const fileEmitter = new vscode.EventEmitter<void>()
		const sessionContext = createSessionContext()
		const todoEmitter = new vscode.EventEmitter<void>()

		let fireCount = 0
		sessionsEmitter.fire = () => { fireCount++ }

		const event: SdkEvent = {
			type: "session.status",
			properties: { sessionID: "session-123", status: { type: "busy" } }
		}

		handleSdkEvent(() => {}, sessionsEmitter, sessionContext, todoEmitter, fileEmitter, event)

		expect(fireCount).toBe(1)
		sessionsEmitter.dispose()
	})

	test("session.idle triggers sessionsEmitter.fire", async () => {
		const sessionsEmitter = new vscode.EventEmitter<void>()
		const fileEmitter = new vscode.EventEmitter<void>()
		const sessionContext = createSessionContext()
		const todoEmitter = new vscode.EventEmitter<void>()

		let fireCount = 0
		sessionsEmitter.fire = () => { fireCount++ }

		const event: SdkEvent = { type: "session.idle", properties: { sessionID: "session-123" } }

		handleSdkEvent(() => {}, sessionsEmitter, sessionContext, todoEmitter, fileEmitter, event)

		expect(fireCount).toBe(1)
		sessionsEmitter.dispose()
	})

	test("session.error shows error message", async () => {
		const sessionsEmitter = new vscode.EventEmitter<void>()
		const fileEmitter = new vscode.EventEmitter<void>()
		const sessionContext = createSessionContext()
		const todoEmitter = new vscode.EventEmitter<void>()

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

		handleSdkEvent(noticeError, sessionsEmitter, sessionContext, todoEmitter, fileEmitter, event)

		expect(showErrorCalls.length).toBe(1)
		expect(showErrorCalls[0]).toContain("Test error message")
		sessionsEmitter.dispose()
	})

	test("unknown event types are ignored", async () => {
		const sessionsEmitter = new vscode.EventEmitter<void>()
		const fileEmitter = new vscode.EventEmitter<void>()
		const sessionContext = createSessionContext()
		const todoEmitter = new vscode.EventEmitter<void>()

		let fireCount = 0
		sessionsEmitter.fire = () => { fireCount++ }

		handleSdkEvent(() => {}, sessionsEmitter, sessionContext, todoEmitter, fileEmitter, { type: "unknown.event.type", properties: {} } as unknown as SdkEvent)

		expect(fireCount).toBe(0)
		sessionsEmitter.dispose()
	})
})
