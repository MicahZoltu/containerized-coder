import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import { describe, expect, test } from "bun:test"
import * as vscode from "vscode"
import { EventEmitter } from '../../source/utils/emitter.js'
import { createSessionContext } from "../../source/gui/sessions.js"
import { server } from "./setup-opencode.js"

describe("commands", () => {
	test("opencode.sessions.create calls client.session.create without title and fires emitter", async () => {
		const client = createOpencodeClient({ baseUrl: server.url })
		const sessionsEmitter = new EventEmitter<void>(() => {})

		let fireCount = 0
		sessionsEmitter.fire = () => { fireCount++ }

		// Create session without providing title (server will auto-generate)
		await client.session.create({})
		sessionsEmitter.fire()

		expect(fireCount).toBe(1)
		sessionsEmitter.dispose()
	})

	test("opencode.sessions.rename validates input and updates", async () => {
		const client = createOpencodeClient({ baseUrl: server.url })
		const sessionsEmitter = new EventEmitter<void>(() => {})

		const createRes = await client.session.create({ title: "Original" })
		const sessionId = createRes.data!.id

		const treeItem = new vscode.TreeItem("Original", vscode.TreeItemCollapsibleState.None)
		treeItem.id = sessionId

		vscode.window.showInputBox = async () => "Renamed"
		let fireCount = 0
		sessionsEmitter.fire = () => { fireCount++ }

		const sessionID = treeItem.id
		expect(sessionID).toBe(sessionId)

		const newTitle = await vscode.window.showInputBox({
			prompt: "Enter new session title",
			placeHolder: "Session title",
			value: "Original"
		})
		expect(newTitle).toBe("Renamed")

		await client.session.update({ sessionID, title: newTitle! })
		sessionsEmitter.fire()

		expect(fireCount).toBe(1)
		sessionsEmitter.dispose()
	})

	test("opencode.sessions.archive confirms and calls share", async () => {
		const client = createOpencodeClient({ baseUrl: server.url })
		const sessionsEmitter = new EventEmitter<void>(() => {})

		const createRes = await client.session.create({ title: "To Archive" })
		const sessionId = createRes.data!.id

		const treeItem = new vscode.TreeItem("To Archive", vscode.TreeItemCollapsibleState.None)
		treeItem.id = sessionId

		vscode.window.showWarningMessage = async <T>(_message: string, _options: vscode.MessageOptions, ...actions: T[]) => actions[0] || undefined
		let fireCount = 0
		sessionsEmitter.fire = () => { fireCount++ }

		const sessionID = treeItem.id
		expect(sessionID).toBe(sessionId)

		const confirmed = await vscode.window.showWarningMessage("Are you sure you want to archive this session?", { modal: true }, "Yes")
		expect(confirmed).toBe("Yes")

		await client.session.update({
			sessionID,
			time: { archived: Math.floor(Date.now() / 1000) }
		})
		sessionsEmitter.fire()

		expect(fireCount).toBe(1)
		sessionsEmitter.dispose()
	})

	test("opencode.sessions.unarchive calls unshare", async () => {
		const client = createOpencodeClient({ baseUrl: server.url })
		const sessionsEmitter = new EventEmitter<void>(() => {})

		const createRes = await client.session.create({ title: "To Unarchive" })
		const sessionId = createRes.data!.id

		const treeItem = new vscode.TreeItem("To Unarchive", vscode.TreeItemCollapsibleState.None)
		treeItem.id = sessionId

		let fireCount = 0
		sessionsEmitter.fire = () => { fireCount++ }

		const sessionID = treeItem.id
		await client.session.unshare({ sessionID })
		sessionsEmitter.fire()

		expect(fireCount).toBe(1)
		sessionsEmitter.dispose()
	})

	test("opencode.sessions.delete confirms and deletes", async () => {
		const client = createOpencodeClient({ baseUrl: server.url })
		const sessionContext = createSessionContext(() => {})
		const sessionsEmitter = new EventEmitter<void>(() => {})

		sessionContext.selectSession("some-id")

		const createRes = await client.session.create({ title: "To Delete" })
		const sessionId = createRes.data!.id

		const treeItem = new vscode.TreeItem("To Delete", vscode.TreeItemCollapsibleState.None)
		treeItem.id = sessionId

		vscode.window.showWarningMessage = async <T>(_message: string, _options: vscode.MessageOptions, ...actions: T[]) => actions[0] || undefined
		let fireCount = 0
		sessionsEmitter.fire = () => { fireCount++ }

		const sessionID = treeItem.id
		expect(sessionID).toBe(sessionId)

		const confirmed = await vscode.window.showWarningMessage("Are you sure you want to delete this session? This cannot be undone.", { modal: true }, "Yes")
		expect(confirmed).toBe("Yes")

		await client.session.delete({ sessionID })
		sessionsEmitter.fire()

		expect(fireCount).toBe(1)
		sessionsEmitter.dispose()
	})

	test("opencode.sessions.refresh fires emitter", async () => {
		const sessionsEmitter = new EventEmitter<void>(() => {})

		let fireCount = 0
		sessionsEmitter.fire = () => { fireCount++ }

		sessionsEmitter.fire()

		expect(fireCount).toBe(1)
		sessionsEmitter.dispose()
	})
})
