import { mock, mockFn } from '@tkoehlerlg/bun-mock-extended'
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import type * as vscode from "vscode"
import { closeSessionPanel, getWebviewContent, openSessionPanel } from "../../../source/webview/panel.js"
import type { SessionStateManagerInterface } from "../../../source/state/session-manager.js"

describe("webview panel management", () => {
	let panels: Map<string, vscode.WebviewPanel>
	let sessionManager: SessionStateManagerInterface
	let mockCreateWebviewPanel: ReturnType<typeof mockFn<(viewType: string, title: string, showOptions: vscode.ViewColumn | { readonly viewColumn: vscode.ViewColumn; readonly preserveFocus?: boolean }, options?: vscode.WebviewPanelOptions & vscode.WebviewOptions) => vscode.WebviewPanel>>

	beforeEach(() => {
		panels = new Map()
		sessionManager = mock<SessionStateManagerInterface>()
		mockCreateWebviewPanel = mockFn<(viewType: string, title: string, showOptions: vscode.ViewColumn | { readonly viewColumn: vscode.ViewColumn; readonly preserveFocus?: boolean }, options?: vscode.WebviewPanelOptions & vscode.WebviewOptions) => vscode.WebviewPanel>()
	})

	afterEach(() => {
		for (const panel of panels.values()) {
			panel.dispose()
		}
		panels.clear()
		sessionManager.stop()
	})

	test("openSessionPanel creates new panel with correct properties", () => {
		const sessionID = "session-123"
		const sessionTitle = "Test Session"
		const mockPanel = mock<vscode.WebviewPanel>({
			viewType: `opencodeSession-${sessionID}`,
			title: sessionTitle,
			viewColumn: 1
		})
		mockCreateWebviewPanel.mockReturnValue(mockPanel)

		openSessionPanel(mockCreateWebviewPanel, panels, sessionManager, sessionID, sessionTitle)

		const panel = panels.get(sessionID)
		expect(panel).toBeDefined()
		expect(mockCreateWebviewPanel).toHaveBeenCalledWith(
			`opencodeSession-${sessionID}`,
			sessionTitle,
			1,
			expect.any(Object)
		)
	})

	test("openSessionPanel includes nonce in HTML for CSP", () => {
		const mockPanel = mock<vscode.WebviewPanel>()
		mockCreateWebviewPanel.mockReturnValue(mockPanel)

		openSessionPanel(mockCreateWebviewPanel, panels, sessionManager, "sess-1", "Title")
		const panel = panels.get("sess-1")
		const html = panel?.webview.html
		expect(html).toContain("Content-Security-Policy")
		expect(html).toContain("nonce=")
	})

	test("openSessionPanel reuses existing panel for same session", () => {
		const mockPanel = mock<vscode.WebviewPanel>()
		mockCreateWebviewPanel.mockReturnValue(mockPanel)

		openSessionPanel(mockCreateWebviewPanel, panels, sessionManager, "s1", "Session 1")
		const panel1 = panels.get("s1")
		openSessionPanel(mockCreateWebviewPanel, panels, sessionManager, "s1", "Session 1")
		const panel2 = panels.get("s1")
		expect(panel1).toBe(panel2)
	})

	test("openSessionPanel creates separate panels for different sessions", () => {
		const mockPanel1 = mock<vscode.WebviewPanel>()
		const mockPanel2 = mock<vscode.WebviewPanel>()
		mockCreateWebviewPanel
			.mockReturnValueOnce(mockPanel1)
			.mockReturnValueOnce(mockPanel2)

		openSessionPanel(mockCreateWebviewPanel, panels, sessionManager, "s1", "Session 1")
		openSessionPanel(mockCreateWebviewPanel, panels, sessionManager, "s2", "Session 2")
		const panel1 = panels.get("s1")
		const panel2 = panels.get("s2")
		expect(panel1).not.toBe(panel2)
	})

	test("closeSessionPanel disposes panel", () => {
		const mockPanel = mock<vscode.WebviewPanel>()
		mockCreateWebviewPanel.mockReturnValue(mockPanel)

		openSessionPanel(mockCreateWebviewPanel, panels, sessionManager, "s1", "Session 1")
		expect(mockPanel.dispose).not.toHaveBeenCalled()
		closeSessionPanel(panels, "s1")
		expect(mockPanel.dispose).toHaveBeenCalled()
		expect(panels.get("s1")).toBeUndefined()
	})

	test("closeSessionPanel does nothing for non-existent session", () => {
		const mockPanel = mock<vscode.WebviewPanel>()
		mockCreateWebviewPanel.mockReturnValue(mockPanel)

		openSessionPanel(mockCreateWebviewPanel, panels, sessionManager, "existing-session", "Existing")
		expect(mockPanel.dispose).not.toHaveBeenCalled()
		closeSessionPanel(panels, "non-existent")
		expect(mockPanel.dispose).not.toHaveBeenCalled()
	})

	test("dispose all panels cleanup", () => {
		const mockPanel1 = mock<vscode.WebviewPanel>()
		const mockPanel2 = mock<vscode.WebviewPanel>()
		const mockPanel3 = mock<vscode.WebviewPanel>()
		mockCreateWebviewPanel
			.mockReturnValueOnce(mockPanel1)
			.mockReturnValueOnce(mockPanel2)
			.mockReturnValueOnce(mockPanel3)

		openSessionPanel(mockCreateWebviewPanel, panels, sessionManager, "s1", "Session 1")
		openSessionPanel(mockCreateWebviewPanel, panels, sessionManager, "s2", "Session 2")
		openSessionPanel(mockCreateWebviewPanel, panels, sessionManager, "s3", "Session 3")
		expect(mockPanel1.dispose).not.toHaveBeenCalled()
		expect(mockPanel2.dispose).not.toHaveBeenCalled()
		expect(mockPanel3.dispose).not.toHaveBeenCalled()
		for (const panel of panels.values()) {
			panel.dispose()
		}
		panels.clear()
		expect(mockPanel1.dispose).toHaveBeenCalled()
		expect(mockPanel2.dispose).toHaveBeenCalled()
		expect(mockPanel3.dispose).toHaveBeenCalled()
	})

	test("postMessageToPanel sends message to webview", () => {
		const mockPanel = mock<vscode.WebviewPanel>()
		mockCreateWebviewPanel.mockReturnValue(mockPanel)

		openSessionPanel(mockCreateWebviewPanel, panels, sessionManager, "s1", "Session 1")
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

describe("getWebviewContent", () => {
	test("generates HTML with correct CSP", () => {
		const html = getWebviewContent("test-csp", "session-123", "Test Session")
		expect(html).toContain("Content-Security-Policy")
		expect(html).toContain("test-csp")
		expect(html).toContain("nonce=")
	})

	test("includes session ID in webview", () => {
		const html = getWebviewContent("csp", "session-123", "Test")
		expect(html).toContain("session-123")
	})

	test("includes session ID in console log", () => {
		const html = getWebviewContent("csp", "session-123", "Test")
		expect(html).toContain("session-123")
	})

	test("includes proper HTML structure", () => {
		const html = getWebviewContent("csp", "session-123", "Test")
		expect(html).toContain("<!DOCTYPE html>")
		expect(html).toContain("<html")
		expect(html).toContain("<head>")
		expect(html).toContain("<body>")
		expect(html).toContain("<div class=\"container\"></div>")
	})

	test("includes render script", () => {
		const html = getWebviewContent("csp", "session-123", "Test")
		expect(html).toContain("renderState")
		expect(html).toContain("renderMessage")
		expect(html).toContain("renderPart")
	})
})
