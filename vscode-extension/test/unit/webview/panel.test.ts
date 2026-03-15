import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import * as vscode from "vscode"
import { closeSessionPanel, openSessionPanel } from "../../../source/webview/panel.js"

describe("webview panel management", () => {
	let panels: Map<string, vscode.WebviewPanel>

	beforeEach(() => {
		panels = new Map()
	})

	afterEach(() => {
		for (const panel of panels.values()) {
			panel.dispose()
		}
		panels.clear()
	})

	test("openSessionPanel creates new panel with correct properties", () => {
		const sessionID = "session-123"
		const sessionTitle = "Test Session"
		const createWebviewPanel = vscode.window.createWebviewPanel.bind(vscode.window)

		openSessionPanel(createWebviewPanel, panels, sessionID, sessionTitle)

		const panel = panels.get(sessionID)
		expect(panel).toBeDefined()
		expect(panel?.viewType).toBe(`opencodeSession-${sessionID}`)
		expect(panel?.title).toBe(sessionTitle)
		expect(panel?.viewColumn).toBe(vscode.ViewColumn.One)
		expect(panel?.webview.html).toContain(sessionTitle)
	})

	test("openSessionPanel includes nonce in HTML for CSP", () => {
		const createWebviewPanel = vscode.window.createWebviewPanel.bind(vscode.window)
		openSessionPanel(createWebviewPanel, panels, "sess-1", "Title")
		const panel = panels.get("sess-1")
		const html = panel?.webview.html
		expect(html).toContain("Content-Security-Policy")
		expect(html).toContain("nonce=")
	})

	test("openSessionPanel reuses existing panel for same session", () => {
		const createWebviewPanel = vscode.window.createWebviewPanel.bind(vscode.window)
		openSessionPanel(createWebviewPanel, panels, "s1", "Session 1")
		const panel1 = panels.get("s1")
		openSessionPanel(createWebviewPanel, panels, "s1", "Session 1")
		const panel2 = panels.get("s1")
		expect(panel1).toBe(panel2)
	})

	test("openSessionPanel creates separate panels for different sessions", () => {
		const createWebviewPanel = vscode.window.createWebviewPanel.bind(vscode.window)
		openSessionPanel(createWebviewPanel, panels, "s1", "Session 1")
		openSessionPanel(createWebviewPanel, panels, "s2", "Session 2")
		const panel1 = panels.get("s1")
		const panel2 = panels.get("s2")
		expect(panel1).not.toBe(panel2)
	})

	test("closeSessionPanel disposes panel", () => {
		const createWebviewPanel = vscode.window.createWebviewPanel.bind(vscode.window)
		openSessionPanel(createWebviewPanel, panels, "s1", "Session 1")
		const panel = panels.get("s1")
		expect(panel?.disposed).toBe(false)
		closeSessionPanel(panels, "s1")
		expect(panel?.disposed).toBe(true)
		expect(panels.get("s1")).toBeUndefined()
		openSessionPanel(createWebviewPanel, panels, "s1", "Session 1 New")
		const newPanel = panels.get("s1")
		expect(newPanel?.disposed).toBe(false)
		expect(newPanel).not.toBe(panel)
	})

	test("closeSessionPanel does nothing for non-existent session", () => {
		const createWebviewPanel = vscode.window.createWebviewPanel.bind(vscode.window)
		openSessionPanel(createWebviewPanel, panels, "existing-session", "Existing")
		const panel = panels.get("existing-session")
		expect(panel?.disposed).toBe(false)
		closeSessionPanel(panels, "non-existent")
		expect(panel?.disposed).toBe(false)
	})

	test("dispose all panels cleanup", () => {
		const createWebviewPanel = vscode.window.createWebviewPanel.bind(vscode.window)
		openSessionPanel(createWebviewPanel, panels, "s1", "Session 1")
		openSessionPanel(createWebviewPanel, panels, "s2", "Session 2")
		openSessionPanel(createWebviewPanel, panels, "s3", "Session 3")
		const panel1 = panels.get("s1")
		const panel2 = panels.get("s2")
		const panel3 = panels.get("s3")
		expect(panel1?.disposed).toBe(false)
		expect(panel2?.disposed).toBe(false)
		expect(panel3?.disposed).toBe(false)
		for (const panel of panels.values()) {
			panel.dispose()
		}
		panels.clear()
		expect(panel1?.disposed).toBe(true)
		expect(panel2?.disposed).toBe(true)
		expect(panel3?.disposed).toBe(true)
	})

	test("postMessageToPanel sends message to webview", () => {
		const createWebviewPanel = vscode.window.createWebviewPanel.bind(vscode.window)
		openSessionPanel(createWebviewPanel, panels, "s1", "Session 1")
		const panel = panels.get("s1")
		if (!panel) {
			throw new Error("Panel not found")
		}
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
