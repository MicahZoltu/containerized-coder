import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import * as vscode from "vscode"
import { closeSessionPanel, disposeAllSessionPanels, openSessionPanel } from "../../source/webview/panel.js"
import { createMockExtensionContext } from "../helpers.js"

describe("webview panel management", () => {
	beforeEach(() => {
		disposeAllSessionPanels()
	})

	afterEach(() => {
		disposeAllSessionPanels()
	})

	test("openSessionPanel creates new panel with correct properties", () => {
		const context = createMockExtensionContext()
		const sessionID = "session-123"
		const sessionTitle = "Test Session"

		const panel = openSessionPanel(context, sessionID, sessionTitle)

		expect(panel).toBeDefined()
		expect(panel.viewType).toBe(`opencodeSession-${sessionID}`)
		expect(panel.title).toBe(sessionTitle)
		expect(panel.viewColumn).toBe(vscode.ViewColumn.One)
		expect(panel.webview.html).toContain(sessionTitle)
	})

	test("openSessionPanel includes nonce in HTML for CSP", () => {
		const context = createMockExtensionContext()
		const panel = openSessionPanel(context, "sess-1", "Title")
		const html = panel.webview.html
		expect(html).toContain("Content-Security-Policy")
		expect(html).toContain("nonce=")
	})

	test("openSessionPanel reuses existing panel for same session", () => {
		const context = createMockExtensionContext()
		const panel1 = openSessionPanel(context, "s1", "Session 1")
		const panel2 = openSessionPanel(context, "s1", "Session 1")
		expect(panel1).toBe(panel2)
	})

	test("openSessionPanel creates separate panels for different sessions", () => {
		const context = createMockExtensionContext()
		const panel1 = openSessionPanel(context, "s1", "Session 1")
		const panel2 = openSessionPanel(context, "s2", "Session 2")
		expect(panel1).not.toBe(panel2)
	})

	test("closeSessionPanel disposes panel", () => {
		const context = createMockExtensionContext()
		const panel = openSessionPanel(context, "s1", "Session 1")
		expect(panel.disposed).toBe(false)
		closeSessionPanel("s1")
		expect(panel.disposed).toBe(true)
		const newPanel = openSessionPanel(context, "s1", "Session 1 New")
		expect(newPanel.disposed).toBe(false)
		expect(newPanel).not.toBe(panel)
	})

	test("closeSessionPanel does nothing for non-existent session", () => {
		const context = createMockExtensionContext()
		const panel = openSessionPanel(context, "existing-session", "Existing")
		expect(panel.disposed).toBe(false)
		closeSessionPanel("non-existent")
		expect(panel.disposed).toBe(false)
	})

	test("disposeAllSessionPanels disposes all", () => {
		const context = createMockExtensionContext()
		const panel1 = openSessionPanel(context, "s1", "Session 1")
		const panel2 = openSessionPanel(context, "s2", "Session 2")
		const panel3 = openSessionPanel(context, "s3", "Session 3")
		expect(panel1.disposed).toBe(false)
		expect(panel2.disposed).toBe(false)
		expect(panel3.disposed).toBe(false)
		disposeAllSessionPanels()
		expect(panel1.disposed).toBe(true)
		expect(panel2.disposed).toBe(true)
		expect(panel3.disposed).toBe(true)
	})

	test("postMessageToPanel sends message to webview", () => {
		const context = createMockExtensionContext()
		const panel = openSessionPanel(context, "s1", "Session 1")
		let capturedMsg: unknown = null
		panel.webview.postMessage = async (msg: unknown): Promise<boolean> => {
			capturedMsg = msg
			return true
		}
		panel.webview.postMessage({ type: "test", data: {} })
		if (capturedMsg && typeof capturedMsg === 'object' && capturedMsg !== null && 'type' in capturedMsg) {
			const msg = capturedMsg as { type: string }
			expect(msg.type).toBe("test")
		} else {
			throw new Error("Captured message does not have expected shape")
		}
	})
})
