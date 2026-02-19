import type { Operation, Action } from "./types/operations"

/**
 * Get operation configuration based on operation type
 * Uses discriminated union for type-safe rendering
 */

export interface OperationViewConfig {
	icon: string
	cssClass: string
	defaultExpanded: boolean
	renderContent: () => string
	getActions: () => Action[]
}

export function getOperationConfig(op: Operation): OperationViewConfig {
	const base = {
		icon: getIcon(op),
		cssClass: getCssClass(op),
		defaultExpanded: getDefaultExpanded(op),
	}

	switch (op.type) {
		case "text":
			return {
				...base,
				renderContent: () => `<div class="text-content">${escapeHtml(op.content)}</div>`,
				getActions: () => [{ id: "copy", label: "Copy", icon: "copy" }],
			}

		case "thinking":
			return {
				...base,
				renderContent: () => `<div class="thinking-content">${escapeHtml(op.content)}</div>`,
				getActions: () => (op.status === "complete" ? [{ id: "copy", label: "Copy", icon: "copy" }] : []),
			}

		case "tool":
			return {
				...base,
				renderContent: () => renderToolContent(op),
				getActions: () => getToolActions(op),
			}

		case "file-attachment":
			return {
				...base,
				renderContent: () => renderFileAttachment(op),
				getActions: () => [{ id: "open", label: "Open", icon: "link-external" }],
			}

		case "file-change":
			return {
				...base,
				renderContent: () => `<div class="file-change-content"><code>${escapeHtml(op.files.join(", "))}</code></div>`,
				getActions: () => [
					{ id: "view-diff", label: "View Diff", icon: "diff" },
					{ id: "apply", label: "Apply", icon: "check" },
				],
			}

		case "error":
			return {
				...base,
				renderContent: () => renderErrorContent(op),
				getActions: () => [{ id: "retry", label: "Retry", icon: "refresh" }],
			}

		case "user-message":
			return {
				...base,
				renderContent: () => `<div class="user-message-content">${escapeHtml(op.content)}</div>`,
				getActions: () => [],
			}

		case "start":
			return {
				...base,
				renderContent: () => '<div class="start-content">Start of history</div>',
				getActions: () => [],
			}

		default:
			// Fallback for other types - show minimal info
			return {
				...base,
				renderContent: () => `<div class="generic-content">${op.type}</div>`,
				getActions: () => [],
			}
	}
}

function getIcon(op: Operation): string {
	switch (op.type) {
		case "text":
			return "comment"
		case "thinking":
			return "sparkle"
		case "tool":
			return "tools"
		case "file-attachment":
			return "file"
		case "file-change":
			return "diff"
		case "error":
			return "error"
		case "user-message":
			return "account"
		case "start":
			return "record"
		default:
			return "circle"
	}
}

function getCssClass(op: Operation): string {
	return `op-${op.type}`
}

function getDefaultExpanded(op: Operation): boolean {
	switch (op.type) {
		case "thinking":
		case "text":
		case "error":
		case "file-change":
		case "user-message":
			return true
		case "tool":
		case "file-attachment":
		case "start":
		default:
			return false
	}
}

function renderToolContent(op: Extract<Operation, { type: "tool" }>): string {
	switch (op.state) {
		case "pending":
			return `<div class="tool-pending">Waiting to run: ${escapeHtml(op.tool)}</div>`
		case "running":
			return `<div class="tool-running"><span class="spinner"></span> Running: ${escapeHtml(op.tool)}</div>`
		case "completed":
			return `<div class="tool-completed"><pre><code>${escapeHtml(op.output || "")}</code></pre></div>`
		case "error":
			return `<div class="tool-error"><strong>Error:</strong> ${escapeHtml(op.error || "")}</div>`
		default:
			return `<div class="tool-unknown">${escapeHtml(op.tool)}</div>`
	}
}

function getToolActions(op: Extract<Operation, { type: "tool" }>): Action[] {
	if (op.state === "completed") {
		return [{ id: "copy", label: "Copy", icon: "copy" }]
	}
	return []
}

function renderFileAttachment(op: Extract<Operation, { type: "file-attachment" }>): string {
	if (op.mime.startsWith("image/")) {
		return `<img src="${escapeHtml(op.url)}" alt="${escapeHtml(op.filename || "image")}" class="file-image" />`
	}
	return `<div class="file-attachment">📎 ${escapeHtml(op.filename || "File")}</div>`
}

function renderErrorContent(op: Extract<Operation, { type: "error" }>): string {
	let content = `<div class="error-content">${escapeHtml(op.error)}</div>`

	if (op.errorType) {
		content += `<div class="error-type">Type: ${escapeHtml(op.errorType)}</div>`
	}

	if (op.providerID) {
		content += `<div class="error-provider">Provider: ${escapeHtml(op.providerID)}</div>`
	}

	if (op.statusCode !== undefined) {
		content += `<div class="error-status">Status Code: ${op.statusCode}</div>`
	}

	if (op.isRetryable !== undefined) {
		content += `<div class="error-retryable">Retryable: ${op.isRetryable ? "Yes" : "No"}</div>`
	}

	if (op.retries !== undefined) {
		content += `<div class="error-retries">Retries: ${op.retries}</div>`
	}

	if (op.responseHeaders && Object.keys(op.responseHeaders).length > 0) {
		content += `<details class="error-headers"><summary>Response Headers</summary><pre>${escapeHtml(JSON.stringify(op.responseHeaders, null, 2))}</pre></details>`
	}

	if (op.metadata && Object.keys(op.metadata).length > 0) {
		content += `<details class="error-metadata"><summary>Metadata</summary><pre>${escapeHtml(JSON.stringify(op.metadata, null, 2))}</pre></details>`
	}

	if (op.responseBody) {
		content += `<details class="error-body"><summary>Response Body</summary><pre>${escapeHtml(op.responseBody)}</pre></details>`
	}

	return content
}

function escapeHtml(str: string): string {
	return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}
