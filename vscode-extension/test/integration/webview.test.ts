import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as vscode from "vscode";
import { closeSessionPanel, disposeAllSessionPanels, getAllSessionPanels, openSessionPanel, postMessageToPanel } from "../../source/webview/panel.js";
import { createMockExtensionContext } from "../helpers.js";

describe("webview panel management", () => {
	beforeEach(() => {
		disposeAllSessionPanels();
	});

	afterEach(() => {
		disposeAllSessionPanels();
	});

	test("openSessionPanel creates new panel with correct properties", () => {
		const context = createMockExtensionContext();
		const sessionID = "session-123";
		const sessionTitle = "Test Session";

		const panel = openSessionPanel(context, sessionID, sessionTitle);

		expect(panel).toBeDefined();
		expect(panel.viewType).toBe(`opencodeSession-${sessionID}`);
		expect(panel.title).toBe(sessionTitle);
		expect(panel.viewColumn).toBe(vscode.ViewColumn.One);
		expect(panel.webview.html).toContain(sessionTitle);
	});

	test("openSessionPanel includes nonce in HTML for CSP", () => {
		const context = createMockExtensionContext();
		const panel = openSessionPanel(context, "sess-1", "Title");
		const html = panel.webview.html;
		expect(html).toContain("Content-Security-Policy");
		expect(html).toContain("nonce=");
	});

	test("openSessionPanel stores panel in map", () => {
		const context = createMockExtensionContext();
		const panel = openSessionPanel(context, "s1", "Session 1");
		const panels = getAllSessionPanels();
		expect(panels.length).toBe(1);
		expect(panels[0]).toBe(panel);
	});

	test("openSessionPanel reuses existing panel for same session", () => {
		const context = createMockExtensionContext();
		const panel1 = openSessionPanel(context, "s1", "Session 1");
		const panel2 = openSessionPanel(context, "s1", "Session 1");
		expect(panel1).toBe(panel2);
		expect(getAllSessionPanels().length).toBe(1);
	});

	test("openSessionPanel creates separate panels for different sessions", () => {
		const context = createMockExtensionContext();
		const panel1 = openSessionPanel(context, "s1", "Session 1");
		const panel2 = openSessionPanel(context, "s2", "Session 2");
		expect(panel1).not.toBe(panel2);
		expect(getAllSessionPanels().length).toBe(2);
	});

	test("closeSessionPanel disposes panel and removes from map", () => {
		const context = createMockExtensionContext();
		const panel = openSessionPanel(context, "s1", "Session 1");
		expect(panel.disposed).toBe(false);
		closeSessionPanel("s1");
		expect(panel.disposed).toBe(true);
		expect(getAllSessionPanels().length).toBe(0);
	});

	test("closeSessionPanel does nothing for non-existent session", () => {
		closeSessionPanel("non-existent");
		expect(getAllSessionPanels().length).toBe(0);
	});

	test("disposeAllSessionPanels disposes all and clears map", () => {
		const context = createMockExtensionContext();
		openSessionPanel(context, "s1", "Session 1");
		openSessionPanel(context, "s2", "Session 2");
		openSessionPanel(context, "s3", "Session 3");
		expect(getAllSessionPanels().length).toBe(3);
		disposeAllSessionPanels();
		expect(getAllSessionPanels().length).toBe(0);
	});

	test("postMessageToPanel sends message to webview", () => {
		const context = createMockExtensionContext();
		const panel = openSessionPanel(context, "s1", "Session 1");
		let capturedMsg: unknown = null;
		// Spy on postMessage by replacing the method
		panel.webview.postMessage = async (msg: unknown): Promise<boolean> => {
			capturedMsg = msg;
			return true;
		};
		postMessageToPanel(panel, { type: "test", data: {} });
		// Verify the message was sent with expected type
		if (capturedMsg && typeof capturedMsg === 'object' && capturedMsg !== null && 'type' in capturedMsg) {
			const msg = capturedMsg as { type: string };
			expect(msg.type).toBe("test");
		} else {
			throw new Error("Captured message does not have expected shape");
		}
	});
});
