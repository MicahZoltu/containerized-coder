import {
	initModelSelector,
	setProviders,
	setSelectedModel,
	showApiKeyPrompt,
	showConnectionError,
} from "./modelSelector.js"
import { showTooltip, hideTooltip } from "./tooltip.js"

// Type definitions for operations
interface OperationBase {
	id: string
	type: string
	title: string
	timestamp: number | undefined
	expanded: boolean
	status: "pending" | "running" | "complete" | "error"
	content?: string
	agent?: string
}

interface TextOperation extends OperationBase {
	type: "text"
	content: string
	model?: { providerID: string; modelID: string }
}

interface ThinkingOperation extends OperationBase {
	type: "thinking"
	content: string
	model?: { providerID: string; modelID: string }
}

interface ToolOperation extends OperationBase {
	type: "tool"
	tool: string
	callID: string
	state: "pending" | "running" | "completed" | "error"
	startTime?: number
	endTime?: number
	output?: string
	error?: string
	attachments?: Array<{ mime: string; url: string; filename?: string }>
	input?: Record<string, unknown>
	metadata?: {
		filePath?: string
		preview?: string
		truncated?: boolean
		loaded?: string[]
		diff?: string
		filediff?: {
			file: string
			before: string
			after: string
			additions: number
			deletions: number
		}
		command?: string
		exit?: number
		description?: string
		sessionId?: string
		requestId?: string
		answers?: string[][]
	}
}

interface FileAttachmentOperation extends OperationBase {
	type: "file-attachment"
	mime: string
	url: string
	filename?: string
}

interface FileChangeOperation extends OperationBase {
	type: "file-change"
	files: string[]
}

interface ErrorOperation extends OperationBase {
	type: "error"
	error: string
	errorType?: string
	statusCode?: number
	responseBody?: string
	providerID?: string
	isRetryable?: boolean
	responseHeaders?: Record<string, string>
	metadata?: Record<string, string>
	retries?: number
}

interface UserMessageOperation extends OperationBase {
	type: "user-message"
	content: string
	model?: { providerID: string; modelID: string }
}

interface StartOperation extends OperationBase {
	type: "start"
}

interface StepStartOperation extends OperationBase {
	type: "step-start"
	snapshot?: string
}

interface StepFinishOperation extends OperationBase {
	type: "step-finish"
	reason: string
	cost?: number
	tokens?: {
		input: number
		output: number
		reasoning: number
		cache: { read: number; write: number }
	}
	snapshot?: string
}

interface QuestionOption {
	label: string
	description: string
}

interface QuestionInfo {
	question: string
	header: string
	options: QuestionOption[]
	multiple?: boolean
	custom?: boolean
}

interface PermissionRequest {
	id: string
	sessionID: string
	permission: string
	patterns: string[]
	metadata: Record<string, unknown>
	always: string[]
	tool?: {
		messageID: string
		callID: string
	}
}

type PermissionReply = "once" | "always" | "reject"

type SessionStatus =
	| { type: "idle" }
	| { type: "busy" }
	| { type: "retry"; attempt: number; message: string; next: number }

interface TodoItem {
	id: string
	content: string
	status: "pending" | "in_progress" | "completed" | "cancelled"
	priority: "high" | "medium" | "low"
}

type Operation =
	| TextOperation
	| ThinkingOperation
	| ToolOperation
	| FileAttachmentOperation
	| FileChangeOperation
	| ErrorOperation
	| UserMessageOperation
	| StartOperation
	| StepStartOperation
	| StepFinishOperation

// Message types from extension
interface ExtMessage {
	panelId: string
	type:
		| "init"
		| "addOperation"
		| "updateOperation"
		| "removeOperation"
		| "setTheme"
		| "setAvailableModels"
		| "setSessionModel"
		| "promptApiKey"
		| "providerConnectionError"
		| "setCancelButtonVisible"
		| "setSessions"
		| "updateSessionStatus"
		| "setCurrentSession"
		| "setOperations"
		| "setParentSession"
		| "setTodos"
		| "setTodoSidebarVisible"
		| "questionRequestId"
		| "permissionRequest"
	data: any
}

// Provider type for model selector
interface Provider {
	id: string
	name: string
	source: "env" | "config" | "custom" | "api"
	env: string[]
	key?: string
	options: Record<string, unknown>
	models: Record<string, Model>
	connected: boolean
	auth?: {
		type: "oauth" | "apikey"
		scopes?: string[]
	}
}

interface Model {
	id: string
	name: string
	providerID: string
	description?: string
	cost?: {
		input: number
		output: number
	}
	contextWindow?: number
}

interface WebviewMessage {
	panelId: string
	type:
		| "init"
		| "submitPrompt"
		| "operationAction"
		| "toggleCollapse"
		| "cancelSession"
		| "selectSession"
		| "createSession"
		| "refreshSessions"
		| "switchToSession"
		| "archiveSession"
		| "unarchiveSession"
		| "deleteSession"
		| "renameSession"
		| "requestRenameSession"
		| "answerQuestion"
		| "rejectQuestion"
		| "getQuestionRequestId"
		| "toggleTodoSidebar"
		| "replyPermission"
	data: any
}

type AgentMode = "build" | "plan" | "docs"

// VSCode API type
declare function acquireVsCodeApi(): {
	postMessage(message: WebviewMessage): void
}

// Module state
const vscode = acquireVsCodeApi()
const operations = new Map<string, Operation>()
let isFollowing = true
let panelId: string | null = null
let currentStepContainer: HTMLElement | null = null
let currentMode: AgentMode = "build"
let currentSessionId: string | null = null
let parentSessionId: string | null = null
let parentSessionTitle: string | null = null
let todos: TodoItem[] = []
let todoSidebarVisible = false

// DOM elements
const container = document.getElementById("operations-container") as HTMLDivElement
const topBar = document.getElementById("top-bar") as HTMLDivElement
const input = document.getElementById("prompt-input") as HTMLTextAreaElement
const submitBtn = document.getElementById("submit-btn") as HTMLButtonElement
const cancelBtn = document.getElementById("cancel-btn") as HTMLButtonElement
const jumpToBottomBtn = document.getElementById("jump-to-bottom") as HTMLDivElement
const modeButtons = document.querySelectorAll(".mode-btn")
const sessionDropdownTrigger = document.getElementById("session-dropdown-trigger") as HTMLDivElement
const sessionDropdownLabel = document.getElementById("session-dropdown-label") as HTMLSpanElement
const sessionDropdownMenu = document.getElementById("session-dropdown-menu") as HTMLDivElement
const sessionListActive = document.getElementById("session-list-active") as HTMLDivElement
const sessionListSeparator = document.getElementById("session-list-separator") as HTMLDivElement
const sessionListTrashed = document.getElementById("session-list-trashed") as HTMLDivElement
const newSessionBtn = document.getElementById("new-session-btn") as HTMLButtonElement
const refreshSessionsBtn = document.getElementById("refresh-sessions-btn") as HTMLButtonElement
const renameSessionBtn = document.getElementById("rename-session-btn") as HTMLButtonElement
const sessionSelector = document.getElementById("session-selector") as HTMLDivElement
const todoSidebar = document.getElementById("todo-sidebar") as HTMLDivElement
const todoList = document.getElementById("todo-list") as HTMLDivElement
const todoToggleBtn = document.getElementById("todo-toggle-btn") as HTMLButtonElement
const todoToggleFixed = document.getElementById("todo-toggle-fixed") as HTMLButtonElement
const todoBadge = document.getElementById("todo-badge") as HTMLSpanElement
const todoActiveCount = document.getElementById("todo-active-count") as HTMLSpanElement

// Create parent session banner
const parentBanner = document.createElement("div")
parentBanner.id = "parent-session-banner"
parentBanner.style.display = "none"
parentBanner.innerHTML = `
	<button id="back-to-parent-btn" class="parent-banner-btn">
		← Back to Parent Session
	</button>
	<span id="parent-session-title"></span>
`
topBar.insertBefore(parentBanner, topBar.firstChild)

const backToParentBtn = document.getElementById("back-to-parent-btn") as HTMLButtonElement

// Escape HTML to prevent XSS
function escapeHtml(str: string | undefined): string {
	if (!str) return ""
	const div = document.createElement("div")
	div.textContent = str
	return div.innerHTML
}

// Configure marked with syntax highlighting
const marked = (window as any).marked
if (marked) {
	marked.setOptions({
		highlight: function (code: string, lang: string) {
			const hljs = (window as any).hljs
			if (!hljs) return escapeHtml(code)

			if (lang && hljs.getLanguage(lang)) {
				try {
					return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
				} catch {
					return hljs.highlightAuto(code).value
				}
			}
			return hljs.highlightAuto(code).value
		},
		langPrefix: "hljs language-",
		gfm: true,
		breaks: true,
	})
}

// Parse markdown-style content using marked
function renderMarkdownWithCodeBlocks(content: string): string {
	if (!content) return ""

	const marked = (window as any).marked
	if (marked) {
		return marked.parse(content)
	}

	// Fallback to simple HTML escaping if marked isn't available
	return escapeHtml(content).replace(/\n/g, "<br>")
}

// Track which languages have been loaded
const loadedLanguages = new Set<string>()

// Dynamically load a language module
async function loadLanguage(languageId: string): Promise<boolean> {
	if (loadedLanguages.has(languageId)) return true

	try {
		const module = await import(`./dependencies/languages/${languageId}.min.js`)
		if (module.default) {
			const hljs = (window as any).hljs
			hljs.registerLanguage(languageId, module.default)
		}
		loadedLanguages.add(languageId)
		return true
	} catch {
		return false
	}
}

// Apply syntax highlighting to code blocks in the DOM
async function highlightCodeBlocks(container: HTMLElement): Promise<void> {
	const hljs = (window as any).hljs
	if (!hljs) return

	const blocks = Array.from(container.querySelectorAll("pre code:not(.hljs)"))

	for (const block of blocks) {
		const className = block.className
		const langMatch = className.match(/language-(\w+)/)

		if (langMatch) {
			const lang = langMatch[1]
			await loadLanguage(lang)
		}

		hljs.highlightElement(block)
	}
}

function startElapsedTimers(): void {
	setInterval(() => {
		document.querySelectorAll(".tool-elapsed-running").forEach((el) => {
			const start = parseInt((el as HTMLElement).dataset.start || "0")
			if (start) {
				const elapsed = ((Date.now() - start) / 1000).toFixed(1)
				el.textContent = `${elapsed}s`
			}
		})
	}, 100)
}

// Render operation content based on type
function renderContent(op: Operation): string {
	switch (op.type) {
		case "text":
			return `<div class="text-content">${renderMarkdownWithCodeBlocks(op.content)}</div>`

		case "thinking":
			return `<div class="thinking-content">${renderMarkdownWithCodeBlocks(op.content)}</div>`

		case "tool":
			return renderToolContent(op)

		case "file-attachment":
			return renderFileAttachment(op)

		case "file-change":
			return `<div class="file-changes"><code>${op.files.map((f: string) => escapeHtml(f)).join("<br>")}</code></div>`

		case "error": {
			const errOp = op as ErrorOperation
			let errorHtml = `<div class="error-content"><strong>${escapeHtml(errOp.title || "Error")}:</strong> ${escapeHtml(errOp.error)}</div>`
			if (errOp.errorType) {
				errorHtml += `<div class="error-detail">Type: ${escapeHtml(errOp.errorType)}</div>`
			}
			if (errOp.providerID) {
				errorHtml += `<div class="error-detail">Provider: ${escapeHtml(errOp.providerID)}</div>`
			}
			if (errOp.statusCode) {
				errorHtml += `<div class="error-detail">Status Code: ${errOp.statusCode}</div>`
			}
			if (errOp.isRetryable !== undefined) {
				errorHtml += `<div class="error-detail">Retryable: ${errOp.isRetryable ? "Yes" : "No"}</div>`
			}
			if (errOp.retries !== undefined) {
				errorHtml += `<div class="error-detail">Retries: ${errOp.retries}</div>`
			}
			if (errOp.responseHeaders && Object.keys(errOp.responseHeaders).length > 0) {
				errorHtml += `<details class="error-response-details"><summary>Response Headers</summary><pre>${escapeHtml(JSON.stringify(errOp.responseHeaders, null, 2))}</pre></details>`
			}
			if (errOp.metadata && Object.keys(errOp.metadata).length > 0) {
				errorHtml += `<details class="error-response-details"><summary>Metadata</summary><pre>${escapeHtml(JSON.stringify(errOp.metadata, null, 2))}</pre></details>`
			}
			if (errOp.responseBody) {
				const truncatedBody = errOp.responseBody.length > 500 ? errOp.responseBody.substring(0, 500) + "..." : errOp.responseBody
				errorHtml += `<details class="error-response-details"><summary>Response Body</summary><pre>${escapeHtml(truncatedBody)}</pre></details>`
			}
			return errorHtml
		}

		case "user-message":
			return `<div class="user-message">${renderMarkdownWithCodeBlocks(op.content)}</div>`

		case "start":
			return '<div class="start-marker">Start of history</div>'

		default: {
			const unknownOp = op as Operation
			return unknownOp.content !== undefined
				? `<div>${escapeHtml(unknownOp.content)}</div>`
				: `<div>${unknownOp.type}</div>`
		}
	}
}

function renderToolContent(op: ToolOperation): string {
	const header = renderToolHeader(op)

	switch (op.state) {
		case "pending":
			return `<div class="tool-pending">${header}<span class="spinner"></span> Waiting...</div>`
		case "running":
			if (op.tool === "question") {
				return renderQuestionToolRunning(op)
			}
			return renderRunningTool(op, header)
		case "completed":
			if (op.tool === "question") {
				return renderQuestionToolCompleted(op)
			}
			return renderCompletedTool(op, header)
		case "error":
			return `<div class="tool-error">${header}<strong>Failed:</strong> ${escapeHtml(op.error || "Unknown error")}</div>`
		default:
			return `<div>${header}${escapeHtml(op.tool)}</div>`
	}
}

function renderToolHeader(op: ToolOperation): string {
	const input = op.input || {}

	switch (op.tool) {
		case "read":
			const filePath = op.metadata?.filePath || (input.filePath as string) || "Unknown file"
			const offset = input.offset as number
			const limit = input.limit as number
			const range = offset !== undefined ? ` [offset=${offset}${limit ? `, limit=${limit}` : ""}]` : ""
			return `<div class="tool-header"><span class="tool-icon">→</span> Read ${escapeHtml(filePath)}${range}</div>`

		case "edit":
			const editPath = op.metadata?.filediff?.file || (input.filePath as string) || "Unknown file"
			return `<div class="tool-header"><span class="tool-icon">✎</span> Edit ${escapeHtml(editPath)}</div>`

		case "bash":
			const desc = op.metadata?.description || (input.description as string)
			if (desc) {
				return `<div class="tool-header"><span class="tool-icon">$</span> ${escapeHtml(desc)}</div>`
			}
			return `<div class="tool-header"><span class="tool-icon">$</span> Bash command</div>`

		case "apply_patch":
			return `<div class="tool-header"><span class="tool-icon">⚡</span> Apply patch</div>`

		case "webfetch":
			const url = (op.input?.url as string) || "Unknown URL"
			return `<div class="tool-header"><span class="tool-icon">🌐</span> Fetch ${escapeHtml(url)}</div>`

		default:
			return `<div class="tool-header"><span class="tool-icon">⚙</span> ${escapeHtml(op.tool)}</div>`
	}
}

function renderElapsed(op: ToolOperation): string {
	if (op.startTime) {
		const elapsed = op.endTime ? op.endTime - op.startTime : Date.now() - op.startTime
		const seconds = (elapsed / 1000).toFixed(1)
		if (op.endTime) {
			return `<span class="tool-elapsed">${seconds}s</span>`
		}
		return `<span class="tool-elapsed tool-elapsed-running" data-start="${op.startTime}">${seconds}s</span>`
	}
	return ""
}

function renderRunningTool(op: ToolOperation, header: string): string {
	const input = op.input || {}
	const inputDisplay = renderToolInput(op.tool, input)
	const elapsed = renderElapsed(op)

	switch (op.tool) {
		case "task": {
			const runningSessionId = op.metadata?.sessionId
			const subtaskButton = runningSessionId
				? `<div class="tool-actions"><button class="tool-action-btn subtask-link" data-action="switchToSubtask" data-session-id="${escapeHtml(runningSessionId)}" data-op-id="${op.id}">Open Sub-Session →</button></div>`
				: ""
			return `<div class="tool-running">${header}${inputDisplay || ""}${subtaskButton}${elapsed}<span class="spinner"></span> Running...</div>`
		}

		case "read":
		case "edit": {
			const filePath = op.metadata?.filePath || (input.filePath as string)
			const icon = op.tool === "edit" ? "✎" : "→"
			if (filePath) {
				const clickableHeader = `<div class="tool-read-header"><span class="tool-icon">${icon}</span> <span class="tool-read-filename tool-action-link" data-action="openFile" data-file="${escapeHtml(filePath)}" data-op-id="${op.id}">${escapeHtml(filePath)}</span></div>`
				return `<div class="tool-running">${clickableHeader}${elapsed}<span class="spinner"></span> ${op.tool === "edit" ? "Editing..." : "Reading..."}</div>`
			}
			return `<div class="tool-running">${header}${inputDisplay || ""}${elapsed}<span class="spinner"></span> Running...</div>`
		}

		default:
			return `<div class="tool-running">${header}${inputDisplay || ""}${elapsed}<span class="spinner"></span> Running...</div>`
	}
}

function renderCompletedTool(op: ToolOperation, header: string): string {
	const elapsed = renderElapsed(op)

	switch (op.tool) {
		case "read":
			return renderReadTool(op, header)
		case "edit":
			return renderEditTool(op, header)
		case "task": {
			const subtaskSessionId = op.metadata?.sessionId
			const subtaskButton = subtaskSessionId
				? `<div class="tool-actions"><button class="tool-action-btn subtask-link" data-action="switchToSubtask" data-session-id="${escapeHtml(subtaskSessionId)}" data-op-id="${op.id}">Open Sub-Session →</button></div>`
				: ""
			let html = `<div class="tool-completed">${header}${elapsed}${subtaskButton}`
			if (op.output) {
				html += `<details class="tool-output-container" open><summary>Task output</summary><div class="tool-output"><pre><code class="language-txt">${escapeHtml(op.output)}</code></pre></div></details>`
			}
			html += `</div>`
			return html
		}
		case "bash":
			return renderBashTool(op, header)
		case "webfetch":
			return renderWebFetchTool(op, header)
		default: {
			const input = op.input || {}
			const hasOutput = op.output && op.output.length > 0
			let html = `<div class="tool-completed">${header}${elapsed}`

			const inputDisplay = renderToolInput(op.tool, input)
			if (inputDisplay) {
				html += inputDisplay
			}

			if (hasOutput) {
				html += `<details class="tool-output-container"><summary>Tool output</summary><div class="tool-output"><pre><code class="language-txt">${escapeHtml(op.output!)}</code></pre></div></details>`
			}

			html += `</div>`

			if (op.attachments?.length) {
				html += `<div class="attachments">${op.attachments
					.map((a) => `<a href="${escapeHtml(a.url)}" target="_blank">${escapeHtml(a.filename || "attachment")}</a>`)
					.join(" ")}</div>`
			}
			return html
		}
	}
}

function renderToolInput(tool: string, input: Record<string, unknown>): string | null {
	switch (tool) {
		case "bash":
			const cmd = input.command as string
			if (cmd) {
				return `<div class="tool-command-section"><div class="tool-command-label">Command:</div><pre><code class="language-sh">${escapeHtml(cmd)}</code></pre></div>`
			}
			return null
		case "read":
			const filePath = input.filePath as string
			if (filePath) {
				return `<div class="tool-command-section"><div class="tool-command-label">File:</div><code>${escapeHtml(filePath)}</code></div>`
			}
			return null
		case "edit":
			const editPath = input.filePath as string
			if (editPath) {
				return `<div class="tool-command-section"><div class="tool-command-label">File:</div><code>${escapeHtml(editPath)}</code></div>`
			}
			return null
		case "write":
			const writePath = input.filePath as string
			if (writePath) {
				return `<div class="tool-command-section"><div class="tool-command-label">File:</div><code>${escapeHtml(writePath)}</code></div>`
			}
			return null
		case "glob":
			const pattern = input.pattern as string
			if (pattern) {
				return `<div class="tool-command-section"><div class="tool-command-label">Pattern:</div><code>${escapeHtml(pattern)}</code></div>`
			}
			return null
		case "grep":
			const grepPattern = input.pattern as string
			if (grepPattern) {
				return `<div class="tool-command-section"><div class="tool-command-label">Pattern:</div><code>${escapeHtml(grepPattern)}</code></div>`
			}
			return null
		default:
			// For other tools, show any relevant string input
			const relevantKeys = ["command", "path", "url", "pattern", "query", "filePath"]
			for (const key of relevantKeys) {
				const value = input[key] as string
				if (value) {
					return `<div class="tool-command-section"><div class="tool-command-label">${key}:</div><code>${escapeHtml(value)}</code></div>`
				}
			}
			return null
	}
}

function renderWebFetchTool(op: ToolOperation, header: string): string {
	const url = (op.input?.url as string) || "Unknown URL"
	const output = op.output || ""

	return `<div class="tool-webfetch">${header}
		<div class="webfetch-url">Fetched: <a href="${escapeHtml(url)}" target="_blank">${escapeHtml(url)}</a></div>
		<details class="tool-output-container"><summary>View fetched content</summary>
			<div class="tool-output"><pre><code class="language-html">${escapeHtml(output)}</code></pre></div>
		</details>
	</div>`
}

function renderReadTool(op: ToolOperation, header: string): string {
	const filePath = op.metadata?.filePath || (op.input?.filePath as string) || "Unknown file"
	const preview = op.metadata?.preview || ""
	const loaded = op.metadata?.loaded || []
	const elapsed = renderElapsed(op)

	let html = `<div class="tool-read">`

	html += `<div class="tool-read-header"><span class="tool-icon">→</span> <span class="tool-read-filename tool-action-link" data-action="openFile" data-file="${escapeHtml(filePath)}" data-op-id="${op.id}">${escapeHtml(filePath)}</span>${elapsed}</div>`

	if (preview) {
		html += `<details class="tool-output-container"><summary>File contents</summary><div class="tool-file-preview"><pre><code>${escapeHtml(preview)}</code></pre></div></details>`
	}

	if (loaded.length > 0) {
		html += `<div class="tool-loaded-files"><div class="tool-loaded-header">↳ Also loaded:</div>${loaded.map((f) => `<div class="tool-loaded-file">${escapeHtml(f)}</div>`).join("")}</div>`
	}

	html += "</div>"
	return html
}

function renderEditTool(op: ToolOperation, header: string): string {
	const metadata = op.metadata
	const elapsed = renderElapsed(op)

	if (!metadata?.filediff) {
		const input = op.input || {}
		const inputDisplay = renderToolInput(op.tool, input)

		let html = `<div class="tool-completed">${header}${elapsed}`
		if (inputDisplay) {
			html += inputDisplay
		}
		if (op.output) {
			html += `<details class="tool-output-container"><summary>Tool output</summary><div class="tool-output"><pre><code class="language-txt">${escapeHtml(op.output)}</code></pre></div></details>`
		}
		html += `</div>`
		return html
	}

	const filediff = metadata.filediff
	const diff = metadata.diff || ""
	const filePath = filediff.file || "Unknown file"

	let html = `<div class="tool-edit">`

	html += `<div class="tool-read-header"><span class="tool-icon">✎</span> <span class="tool-read-filename tool-action-link" data-action="openFile" data-file="${escapeHtml(filePath)}" data-op-id="${op.id}">${escapeHtml(filePath)}</span>${elapsed}</div>`

	html += `<div class="tool-diff-stats"><span class="tool-diff-added">+${filediff.additions}</span> <span class="tool-diff-removed">-${filediff.deletions}</span></div>`

	html += `<div class="tool-actions"><button class="tool-action-btn" data-action="viewDiff" data-file="${escapeHtml(filediff.file)}" data-op-id="${op.id}">View Diff</button></div>`

	if (diff) {
		html += `<details class="tool-output-container"><summary>View diff</summary><div class="tool-diff-preview"><pre><code class="language-diff">${escapeHtml(diff)}</code></pre></div></details>`
	}

	html += "</div>"
	return html
}

function renderBashTool(op: ToolOperation, header: string): string {
	const metadata = op.metadata
	const exit = metadata?.exit
	const input = op.input || {}
	const cmd = metadata?.command || (input.command as string)
	const elapsed = renderElapsed(op)

	let html = `<div class="tool-bash">${header}${elapsed}`

	if (cmd) {
		html += `<div class="tool-command-section"><div class="tool-command-label">Command:</div><pre><code class="language-sh">${escapeHtml(cmd)}</code></pre></div>`
	}

	if (exit !== undefined) {
		const exitClass = exit === 0 ? "tool-exit-success" : "tool-exit-failed"
		html += `<div class="tool-exit-code ${exitClass}">Exit ${exit}</div>`
	}

	if (op.output) {
		html += `<details class="tool-output-container"><summary>Command output</summary><div class="tool-bash-output"><pre><code class="language-sh">${escapeHtml(op.output)}</code></pre></div></details>`
	}

	html += "</div>"
	return html
}

function renderFileAttachment(op: FileAttachmentOperation): string {
	if (op.mime?.startsWith("image/")) {
		return `<img src="${escapeHtml(op.url)}" alt="${escapeHtml(op.filename || "image")}" class="file-image" />`
	}
	return `<div class="file-link"><a href="${escapeHtml(op.url)}" target="_blank">${escapeHtml(op.filename || "File")}</a></div>`
}

function renderQuestionToolRunning(op: ToolOperation): string {
	const questions = op.input?.questions as QuestionInfo[] | undefined
	if (!questions) return '<div class="tool-running"><span class="spinner"></span> Waiting for question...</div>'

	const hasMultiple = questions.length > 1
	const canSubmit = !hasMultiple

	let html = `<div class="question-container" data-call-id="${op.callID || ""}">`

	if (hasMultiple) {
		html += `<div class="question-tabs">`
		questions.forEach((q, i) => {
			html += `<button class="question-tab ${i === 0 ? "active" : ""}" data-index="${i}">${escapeHtml(q.header)}</button>`
		})
		html += `</div>`
	}

	questions.forEach((q, i) => {
		html += `<div class="question-panel ${i === 0 ? "active" : ""}" data-index="${i}">`
		html += `<div class="question-text">${escapeHtml(q.question)}</div>`
		html += `<div class="question-options" data-multiple="${q.multiple || false}">`
		q.options.forEach((opt) => {
			html += `<button class="question-option" data-label="${escapeHtml(opt.label)}">
				<span class="option-label">${escapeHtml(opt.label)}</span>
				<span class="option-description">${escapeHtml(opt.description)}</span>
			</button>`
		})
		html += `</div>`
		if (q.custom !== false) {
			html += `<div class="question-custom-input">
				<input type="text" class="custom-answer-input" placeholder="Type your own answer..." />
				<button class="custom-add-btn" disabled>Add</button>
			</div>`
		}
		html += `</div>`
	})

	html += `<div class="question-actions">`
	html += `<button class="question-dismiss-btn" ${!canSubmit ? "disabled" : ""}>Dismiss</button>`
	html += `<button class="question-submit-btn" ${!canSubmit ? "disabled" : ""}>Submit</button>`
	html += `</div>`
	html += `</div>`

	return html
}

function renderQuestionToolCompleted(op: ToolOperation): string {
	const questions = op.input?.questions as QuestionInfo[] | undefined
	const answers = op.metadata?.answers

	if (!questions) return '<div class="tool-completed">Question completed</div>'

	let html = `<div class="question-container question-completed">`

	questions.forEach((q, i) => {
		html += `<div class="question-panel">`
		html += `<div class="question-text">${escapeHtml(q.question)}</div>`
		if (answers && answers[i]) {
			html += `<div class="question-answers">`
			html += `<span class="answer-label">Answer:</span> `
			html += answers[i].map((a) => `<span class="answer-value">${escapeHtml(a)}</span>`).join(", ")
			html += `</div>`
		}
		html += `</div>`
	})

	html += `</div>`
	return html
}

function setupQuestionToolEventListeners(el: HTMLElement, op: ToolOperation): void {
	const questions = op.input?.questions as QuestionInfo[] | undefined
	if (!questions) return

	const callID = op.callID
	const selectedOptions = new Map<number, Set<string>>()
	questions.forEach((_, i) => selectedOptions.set(i, new Set()))

	const viewedTabs = new Set([0])
	const submitBtn = el.querySelector(".question-submit-btn") as HTMLButtonElement

	function updateSubmitButton() {
		if (submitBtn && viewedTabs.size === questions!.length) {
			submitBtn.disabled = false
		}
	}

	el.querySelectorAll(".question-tab").forEach((tab) => {
		tab.addEventListener("click", (e) => {
			e.stopPropagation()
			const index = parseInt((tab as HTMLElement).dataset.index || "0")
			viewedTabs.add(index)
			updateSubmitButton()
			el.querySelectorAll(".question-tab").forEach((t) => t.classList.remove("active"))
			tab.classList.add("active")
			el.querySelectorAll(".question-panel").forEach((p) => {
				p.classList.toggle("active", parseInt((p as HTMLElement).dataset.index || "0") === index)
			})
		})
	})

	el.querySelectorAll(".question-option").forEach((btn) => {
		btn.addEventListener("click", (e) => {
			e.stopPropagation()
			const panel = btn.closest(".question-panel")
			const optionsContainer = panel?.querySelector(".question-options")
			const index = parseInt(panel?.getAttribute("data-index") || "0")
			const label = (btn as HTMLElement).dataset.label || ""
			const multiple = optionsContainer?.getAttribute("data-multiple") === "true"

			if (multiple) {
				btn.classList.toggle("selected")
				const selected = selectedOptions.get(index) || new Set()
				if (btn.classList.contains("selected")) {
					selected.add(label)
				} else {
					selected.delete(label)
				}
				selectedOptions.set(index, selected)
			} else {
				panel?.querySelectorAll(".question-option").forEach((b) => b.classList.remove("selected"))
				btn.classList.add("selected")
				selectedOptions.set(index, new Set([label]))
			}
		})
	})

	el.querySelectorAll(".question-custom-input").forEach((container) => {
		const input = container.querySelector(".custom-answer-input") as HTMLInputElement
		const addBtn = container.querySelector(".custom-add-btn") as HTMLButtonElement
		const panel = container.closest(".question-panel")
		const index = parseInt(panel?.getAttribute("data-index") || "0")
		const optionsContainer = panel?.querySelector(".question-options")
		const multiple = optionsContainer?.getAttribute("data-multiple") === "true"

		input?.addEventListener("input", () => {
			addBtn.disabled = !input.value.trim()
		})

		input?.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && input.value.trim()) {
				e.preventDefault()
				addCustomAnswer()
			}
		})

		addBtn?.addEventListener("click", (e) => {
			e.stopPropagation()
			addCustomAnswer()
		})

		function addCustomAnswer() {
			if (!input.value.trim()) return
			const customLabel = input.value.trim()
			const selected = selectedOptions.get(index) || new Set()

			if (!multiple) {
				panel?.querySelectorAll(".question-option").forEach((b) => b.classList.remove("selected"))
			}

			const newBtn = document.createElement("button")
			newBtn.className = "question-option selected"
			newBtn.dataset.label = customLabel
			newBtn.innerHTML = `<span class="option-label">${escapeHtml(customLabel)}</span>`
			optionsContainer?.appendChild(newBtn)

			newBtn.addEventListener("click", (e) => {
				e.stopPropagation()
				if (multiple) {
					newBtn.classList.toggle("selected")
					if (newBtn.classList.contains("selected")) {
						selected.add(customLabel)
					} else {
						selected.delete(customLabel)
					}
				} else {
					panel?.querySelectorAll(".question-option").forEach((b) => b.classList.remove("selected"))
					newBtn.classList.add("selected")
					selectedOptions.set(index, new Set([customLabel]))
				}
			})

			if (!multiple) {
				selected.clear()
			}
			selected.add(customLabel)
			selectedOptions.set(index, selected)

			input.value = ""
			addBtn.disabled = true
		}
	})

	async function fetchRequestId(callID: string): Promise<string | null> {
		if (!panelId) return null
		const currentPanelId = panelId
		return new Promise((resolve) => {
			const handler = (event: MessageEvent) => {
				const msg = event.data
				if (msg.type === "questionRequestId" && msg.data.callID === callID) {
					window.removeEventListener("message", handler)
					resolve(msg.data.requestId)
				}
			}
			window.addEventListener("message", handler)
			vscode.postMessage({
				panelId: currentPanelId,
				type: "getQuestionRequestId",
				data: { callID },
			})
		})
	}

	el.querySelector(".question-dismiss-btn")?.addEventListener("click", async (e) => {
		e.stopPropagation()
		if (!panelId || !callID) return

		const requestId = await fetchRequestId(callID)
		if (!requestId) return

		vscode.postMessage({
			panelId,
			type: "rejectQuestion",
			data: { requestId },
		})
	})

	el.querySelector(".question-submit-btn")?.addEventListener("click", async (e) => {
		e.stopPropagation()
		if (!panelId || !callID) return

		const requestId = await fetchRequestId(callID)
		if (!requestId) return

		const answers: string[][] = []
		questions.forEach((_, i) => {
			const selected = selectedOptions.get(i) || new Set()
			answers.push(Array.from(selected))
		})

		vscode.postMessage({
			panelId,
			type: "answerQuestion",
			data: { requestId, answers },
		})
	})
}

// Get icon emoji based on operation type
function getIcon(op: Operation): string {
	const icons: Record<string, string> = {
		code: "💻",
		thinking: "💭",
		tool: "🔧",
		"file-attachment": "📎",
		"file-change": "📝",
		error: "❌",
		"user-message": "👤",
		start: "🚀",
		question: "❓",
	}
	return icons[op.type] || "🤖"
}

function getCopyableContent(op: Operation): string | null {
	switch (op.type) {
		case "text":
		case "thinking":
		case "user-message":
			return ("content" in op && op.content) ? op.content : null
		default:
			return null
	}
}

// Create DOM element for an operation
async function createOperationElement(op: Operation): Promise<HTMLElement> {
	const el = document.createElement("div")
	el.className = `operation op-${op.type}${op.expanded ? " expanded" : ""}${op.status === "pending" ? " pending" : ""}`
	el.dataset.id = op.id

	const statusBadge =
		op.type === "user-message" || op.type === "start" ? "" : `<span class="op-status ${op.status}">${op.status}</span>`
	const contentHtml = renderContent(op)

	// Get first line of content for preview (if operation has content)
	let previewText = ""
	if ("content" in op && op.content) {
		const firstLine = op.content.split("\n")[0].trim()
		if (firstLine.length > 0 && firstLine !== op.title) {
			previewText = firstLine.length > 100 ? firstLine.substring(0, 97) + "..." : firstLine
		}
	}
	const titlePreview = previewText ? `<span class="op-title-preview">${escapeHtml(previewText)}</span>` : ""

	// Model badge for user-message and text operations
	let modelBadge = ""
	const model = "model" in op ? op.model : undefined
	if (model) {
		modelBadge = `<span class="op-model">${escapeHtml(model.providerID)}: ${escapeHtml(model.modelID)}</span>`
	}

	// Agent badge for all operations
	let agentBadge = ""
	if (op.agent) {
		agentBadge = `<span class="op-agent">${escapeHtml(op.agent)}</span>`
	}

	const timeBadge = op.timestamp !== undefined ? `<span class="op-time">${formatTime(op.timestamp)}</span>` : ""

	const copyableContent = getCopyableContent(op)
	const copyButton = copyableContent
		? `<button class="op-copy-btn" title="Copy raw text">📋</button>`
		: ""

	el.innerHTML = `
		<div class="op-header">
			<span class="op-icon">${getIcon(op)}</span>
			<span class="op-title">${escapeHtml(op.title)}</span>
			${titlePreview}
			<span class="op-meta">${modelBadge}${agentBadge}${statusBadge}${timeBadge}${copyButton}</span>
			<span class="op-toggle">▼</span>
		</div>
		 <div class="op-body">
			<div class="op-content">${contentHtml}</div>
		</div>
	`

	if (copyableContent) {
		const copyBtn = el.querySelector(".op-copy-btn") as HTMLButtonElement
		if (copyBtn) {
			copyBtn.addEventListener("click", async (e) => {
				e.stopPropagation()
				try {
					// Get operation ID from parent element and fetch current operation state
					const opId = el.dataset.id
					const currentOp = opId ? operations.get(opId) : null
					const contentToCopy = currentOp ? getCopyableContent(currentOp) : null

					if (contentToCopy) {
						await navigator.clipboard.writeText(contentToCopy)
						const originalTitle = copyBtn.title
						copyBtn.textContent = "✓"
						copyBtn.title = "Copied!"
						setTimeout(() => {
							copyBtn.textContent = "📋"
							copyBtn.title = originalTitle
						}, 1500)
					}
				} catch (err) {
					console.error("Failed to copy:", err)
				}
			})
		}
	}

	// Toggle expand/collapse
	const header = el.querySelector(".op-header")
	if (header) {
		header.addEventListener("click", () => {
			const isExpanded = el.classList.toggle("expanded")
			if (panelId) {
				vscode.postMessage({
					panelId,
					type: "toggleCollapse",
					data: { operationId: op.id, expanded: isExpanded },
				})
			}
		})
	}

	// Apply syntax highlighting to any code blocks
	const contentEl = el.querySelector(".op-content")
	if (contentEl) {
		await highlightCodeBlocks(contentEl as HTMLElement)
	}

	// Add event listeners for tool action buttons
	addToolActionListeners(el, op)

	return el
}

function addToolActionListeners(el: HTMLElement, op: Operation): void {
	if (op.type !== "tool") return

	const toolOp = op as ToolOperation

	// Handle question tool event listeners
	if (toolOp.tool === "question" && toolOp.state === "running") {
		setupQuestionToolEventListeners(el, toolOp)
	}

	// Handle action buttons
	el.querySelectorAll(".tool-action-btn").forEach((btn) => {
		btn.addEventListener("click", (e) => {
			e.stopPropagation()
			const action = (btn as HTMLButtonElement).dataset.action
			const file = (btn as HTMLButtonElement).dataset.file
			const opId = (btn as HTMLButtonElement).dataset.opId
			const sessionId = (btn as HTMLButtonElement).dataset.sessionId

			if (!action || !panelId) return

			if (action === "switchToSubtask" && sessionId) {
				vscode.postMessage({
					panelId,
					type: "switchToSession",
					data: { sessionId, parentSessionId: currentSessionId, parentSessionTitle: document.title },
				})
			} else {
				vscode.postMessage({
					panelId,
					type: "operationAction",
					data: { operationId: opId || op.id, actionId: action, filePath: file },
				})
			}
		})
	})

	// Handle clickable links (filenames, etc.)
	el.querySelectorAll(".tool-action-link").forEach((link) => {
		link.addEventListener("click", (e) => {
			e.stopPropagation()
			const action = (link as HTMLElement).dataset.action
			const file = (link as HTMLElement).dataset.file
			const opId = (link as HTMLElement).dataset.opId

			if (action && panelId) {
				vscode.postMessage({
					panelId,
					type: "operationAction",
					data: { operationId: opId || op.id, actionId: action, filePath: file },
				})
			}
		})
	})
}

// Update existing operation element
async function updateOperationElement(el: HTMLElement, op: Operation, updates: Partial<Operation>): Promise<void> {
	const mergedOp = { ...op, ...updates } as Operation

	if ("content" in updates || "state" in updates || "output" in updates || "error" in updates) {
		const contentEl = el.querySelector(".op-content")
		if (contentEl) {
			contentEl.innerHTML = renderContent(mergedOp)
			await highlightCodeBlocks(contentEl as HTMLElement)
			addToolActionListeners(el, mergedOp)
		}

		// Update title preview if content changed
		if ("content" in updates && mergedOp.content) {
			const firstLine = mergedOp.content.split("\n")[0].trim()
			if (firstLine.length > 0 && firstLine !== mergedOp.title) {
				const previewText = firstLine.length > 100 ? firstLine.substring(0, 97) + "..." : firstLine
				const previewEl = el.querySelector(".op-title-preview")
				if (previewEl) {
					previewEl.textContent = previewText
				}
			}
		}
	}

	if (updates.expanded !== undefined) {
		el.classList.toggle("expanded", updates.expanded)
	}

	if (updates.status !== undefined) {
		el.classList.remove("pending", "complete", "error")
		el.classList.add(updates.status)

		const statusBadge = el.querySelector(".op-status")
		if (statusBadge) {
			statusBadge.className = `op-status ${updates.status}`
			statusBadge.textContent = updates.status
		}
	}

	if (updates.title !== undefined) {
		const titleEl = el.querySelector(".op-title")
		if (titleEl) {
			titleEl.textContent = escapeHtml(updates.title)
		}
	}
}

// Scroll to bottom if following
function scrollToBottom(force = false): void {
	if (isFollowing || force) {
		container.scrollTop = container.scrollHeight
	}
	jumpToBottomBtn.style.display = isFollowing ? "none" : "block"
}

// Format timestamp
function formatTime(timestamp: number): string {
	return new Date(timestamp).toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	})
}

// Submit prompt
function submitPrompt(): void {
	const text = input.value.trim()
	if (!text) return

	if (panelId) {
		vscode.postMessage({
			panelId,
			type: "submitPrompt",
			data: { prompt: text, agent: currentMode },
		})
	}

	input.value = ""
	input.style.height = "auto"
	isFollowing = true
	scrollToBottom(true)
}

// Set mode
function setMode(mode: AgentMode): void {
	currentMode = mode
	modeButtons.forEach((btn) => {
		const button = btn as HTMLButtonElement
		button.classList.toggle("active", button.dataset.mode === mode)
	})
}

// Auto-resize textarea
function autoResize(): void {
	input.style.height = "auto"
	input.style.height = Math.min(input.scrollHeight, 200) + "px"
}

// Event listeners
// Detect user trying to scroll away from bottom
container.addEventListener(
	"wheel",
	(e) => {
		if (e.deltaY < 0 && isFollowing) {
			isFollowing = false
			jumpToBottomBtn.style.display = "block"
		}
	},
	{ passive: true },
)

container.addEventListener("scroll", () => {
	const atBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 1
	if (atBottom) {
		isFollowing = true
		jumpToBottomBtn.style.display = "none"
	}
})

jumpToBottomBtn.addEventListener("click", () => {
	isFollowing = true
	scrollToBottom(true)
})

backToParentBtn.addEventListener("click", () => {
	if (parentSessionId && panelId) {
		vscode.postMessage({
			panelId,
			type: "switchToSession",
			data: { sessionId: parentSessionId },
		})
	}
})

submitBtn.addEventListener("click", submitPrompt)

cancelBtn.addEventListener("click", () => {
	if (panelId) {
		vscode.postMessage({
			panelId,
			type: "cancelSession",
			data: {},
		})
	}
})

input.addEventListener("input", autoResize)

input.addEventListener("keydown", (e: KeyboardEvent) => {
	if (e.key === "Enter" && !e.shiftKey) {
		e.preventDefault()
		submitPrompt()
	}
})

// Mode button listeners
modeButtons.forEach((btn) => {
	btn.addEventListener("click", () => {
		const mode = (btn as HTMLButtonElement).dataset.mode as AgentMode
		if (mode) setMode(mode)
	})
})

// Session selector dropdown handlers
let dropdownOpen = false

function toggleDropdown() {
	dropdownOpen = !dropdownOpen
	sessionDropdownMenu.style.display = dropdownOpen ? "block" : "none"
	sessionDropdownTrigger.classList.toggle("open", dropdownOpen)
}

function closeDropdown() {
	dropdownOpen = false
	sessionDropdownMenu.style.display = "none"
	sessionDropdownTrigger.classList.remove("open")
}

sessionDropdownTrigger.addEventListener("click", (e) => {
	e.stopPropagation()
	toggleDropdown()
})

document.addEventListener("click", (e) => {
	if (dropdownOpen && !sessionDropdownMenu.contains(e.target as Node) && e.target !== sessionDropdownTrigger) {
		closeDropdown()
	}
})

// TODO sidebar toggle
todoToggleBtn?.addEventListener("click", () => {
	if (!panelId) return
	todoSidebarVisible = !todoSidebarVisible
	updateTodoSidebarVisibility()
	vscode.postMessage({
		panelId,
		type: "toggleTodoSidebar",
		data: { visible: todoSidebarVisible },
	})
})

todoToggleFixed?.addEventListener("click", () => {
	if (!panelId) return
	todoSidebarVisible = !todoSidebarVisible
	updateTodoSidebarVisibility()
	vscode.postMessage({
		panelId,
		type: "toggleTodoSidebar",
		data: { visible: todoSidebarVisible },
	})
})

function updateTodoSidebarVisibility(): void {
	if (todoSidebar) {
		todoSidebar.classList.toggle("visible", todoSidebarVisible)
	}
	if (todoToggleBtn) {
		todoToggleBtn.classList.toggle("active", todoSidebarVisible)
	}
	if (todoToggleFixed) {
		todoToggleFixed.classList.toggle("active", todoSidebarVisible)
		todoToggleFixed.style.display = todoSidebarVisible ? "none" : "flex"
	}
}

function renderTodos(): void {
	if (!todoList) return

	if (todos.length === 0) {
		todoList.innerHTML = '<div class="todo-empty">No tasks</div>'
		if (todoActiveCount) todoActiveCount.textContent = "0"
		if (todoBadge) {
			todoBadge.style.display = "none"
			todoBadge.textContent = "0"
		}
		return
	}

	// Sort by status (in_progress first), then priority
	const sorted = [...todos].sort((a, b) => {
		const statusOrder = { in_progress: 0, pending: 1, completed: 2, cancelled: 3 }
		const priorityOrder = { high: 0, medium: 1, low: 2 }
		const statusDiff = statusOrder[a.status] - statusOrder[b.status]
		return statusDiff !== 0 ? statusDiff : priorityOrder[a.priority] - priorityOrder[b.priority]
	})

	todoList.innerHTML = sorted
		.map(
			(todo) => `
		<div class="todo-item ${todo.status} priority-${todo.priority}" data-id="${todo.id}">
			<div class="todo-content${todo.status === "completed" ? " strikethrough" : ""}">
				${escapeHtml(todo.content)}
			</div>
		</div>
	`,
		)
		.join("")

	// Update counts
	const active = todos.filter((t) => t.status === "pending" || t.status === "in_progress").length
	if (todoActiveCount) todoActiveCount.textContent = active.toString()
	if (todoBadge) {
		todoBadge.style.display = active > 0 ? "flex" : "none"
		todoBadge.textContent = active.toString()
	}
}

function createSessionItem(
	session: { id: string; title: string; archived?: number; status?: SessionStatus },
	isArchived: boolean,
): HTMLElement {
	const item = document.createElement("div")
	item.className = `session-item${isArchived ? " archived" : ""}`
	item.dataset.sessionId = session.id

	if (!isArchived && session.status) {
		if (session.status.type === "busy") {
			item.classList.add("status-busy")
		} else if (session.status.type === "retry") {
			item.classList.add("status-retry")
		} else {
			item.classList.add("status-idle")
		}
	} else if (!isArchived) {
		item.classList.add("status-idle")
	}

	const title = document.createElement("span")
	title.className = "session-title"
	title.textContent = session.title || session.id.substring(0, 8)

	const actions = document.createElement("div")
	actions.className = "session-actions"

	if (isArchived) {
		// Unarchive button
		const unarchiveBtn = document.createElement("button")
		unarchiveBtn.className = "session-action-btn"
		unarchiveBtn.textContent = "📥"
		unarchiveBtn.addEventListener("mouseenter", () => showTooltip("Restore", unarchiveBtn, "top"))
		unarchiveBtn.addEventListener("mouseleave", hideTooltip)
		unarchiveBtn.addEventListener("click", (e) => {
			e.stopPropagation()
			hideTooltip()
			if (panelId) {
				vscode.postMessage({
					panelId,
					type: "unarchiveSession",
					data: { sessionId: session.id },
				})
			}
		})
		actions.appendChild(unarchiveBtn)

		// Delete button
		const deleteBtn = document.createElement("button")
		deleteBtn.className = "session-action-btn"
		deleteBtn.textContent = "🗑️"
		deleteBtn.addEventListener("mouseenter", () => showTooltip("Delete permanently", deleteBtn, "top"))
		deleteBtn.addEventListener("mouseleave", hideTooltip)
		deleteBtn.addEventListener("click", (e) => {
			e.stopPropagation()
			hideTooltip()
			if (panelId) {
				vscode.postMessage({
					panelId,
					type: "deleteSession",
					data: { sessionId: session.id },
				})
			}
		})
		actions.appendChild(deleteBtn)
	} else {
		// Archive button
		const archiveBtn = document.createElement("button")
		archiveBtn.className = "session-action-btn"
		archiveBtn.textContent = "📦"
		archiveBtn.addEventListener("mouseenter", () => showTooltip("Archive", archiveBtn, "top"))
		archiveBtn.addEventListener("mouseleave", hideTooltip)
		archiveBtn.addEventListener("click", (e) => {
			e.stopPropagation()
			if (panelId) {
				vscode.postMessage({
					panelId,
					type: "archiveSession",
					data: { sessionId: session.id },
				})
			}
		})
		actions.appendChild(archiveBtn)
	}

	item.appendChild(actions)
	item.appendChild(title)

	item.addEventListener("click", () => {
		closeDropdown()
		if (session.id !== currentSessionId && panelId) {
			vscode.postMessage({
				panelId,
				type: "selectSession",
				data: { sessionId: session.id },
			})
		}
	})

	return item
}

newSessionBtn.addEventListener("click", () => {
	if (panelId) {
		vscode.postMessage({
			panelId,
			type: "createSession",
			data: {},
		})
	}
})

refreshSessionsBtn.addEventListener("click", () => {
	if (panelId) {
		vscode.postMessage({
			panelId,
			type: "refreshSessions",
			data: {},
		})
	}
})

renameSessionBtn.addEventListener("click", () => {
	if (!currentSessionId || !panelId) return
	vscode.postMessage({
		panelId,
		type: "requestRenameSession",
		data: { sessionId: currentSessionId, currentTitle: sessionDropdownLabel.textContent || "" },
	})
})

// Tooltips for session buttons
renameSessionBtn.addEventListener("mouseenter", () => showTooltip("Rename Session", renameSessionBtn, "top"))
renameSessionBtn.addEventListener("mouseleave", hideTooltip)
refreshSessionsBtn.addEventListener("mouseenter", () => showTooltip("Refresh Session", refreshSessionsBtn, "top"))
refreshSessionsBtn.addEventListener("mouseleave", hideTooltip)
newSessionBtn.addEventListener("mouseenter", () => showTooltip("New Session", newSessionBtn, "top"))
newSessionBtn.addEventListener("mouseleave", hideTooltip)
todoToggleBtn.addEventListener("mouseenter", () => showTooltip("TODO List", todoToggleBtn, "top"))
todoToggleBtn.addEventListener("mouseleave", hideTooltip)
todoToggleFixed.addEventListener("mouseenter", () => showTooltip("TODO List", todoToggleFixed, "top"))
todoToggleFixed.addEventListener("mouseleave", hideTooltip)

function showPermissionPrompt(req: PermissionRequest): void {
	const existing = document.querySelector(`.permission-prompt[data-request-id="${req.id}"]`)
	if (existing) return

	const prompt = document.createElement("div")
	prompt.className = "permission-prompt"
	prompt.setAttribute("data-request-id", req.id)

	const title = getPermissionTitle(req)
	const details = getPermissionDetails(req)

	prompt.innerHTML = `
		<div class="permission-header">
			<span class="permission-warning-icon">⚠</span>
			<span class="permission-title">Permission Required</span>
		</div>
		<div class="permission-body">
			<div class="permission-info">
				<span class="permission-action">${escapeHtml(title)}</span>
			</div>
			${details ? `<div class="permission-details">${escapeHtml(details)}</div>` : ""}
		</div>
		<div class="permission-actions">
			<button class="permission-btn permission-reject" data-action="reject">Reject</button>
			<button class="permission-btn permission-once" data-action="once">Allow Once</button>
			<button class="permission-btn permission-always" data-action="always">Allow Always</button>
		</div>
	`

	prompt.querySelectorAll(".permission-btn").forEach((btn) => {
		btn.addEventListener("click", () => {
			const action = (btn as HTMLButtonElement).dataset.action as PermissionReply
			let message: string | undefined
			if (action === "reject") {
				message = undefined
			}
			if (panelId) {
				vscode.postMessage({
					panelId,
					type: "replyPermission",
					data: { requestID: req.id, reply: action, message },
				})
			}
			prompt.remove()
		})
	})

	container.appendChild(prompt)
	scrollToBottom(true)
}

function getPermissionTitle(req: PermissionRequest): string {
	const permission = req.permission
	const metadata = req.metadata

	switch (permission) {
		case "edit":
		case "write":
		case "patch":
		case "multiedit": {
			const filepath = (metadata?.filepath as string) || ""
			return `Edit ${filepath}`
		}
		case "read": {
			return `Read file`
		}
		case "bash": {
			const command = (metadata?.command as string) || ""
			return command ? `Run: ${command}` : "Run shell command"
		}
		case "glob": {
			return `Glob search`
		}
		case "grep": {
			return `Grep search`
		}
		case "list": {
			return `List directory`
		}
		case "task": {
			return "Run subtask"
		}
		case "webfetch": {
			return "Fetch web content"
		}
		case "websearch": {
			return "Web search"
		}
		case "codesearch": {
			return "Code search"
		}
		case "external_directory": {
			const dir = (metadata?.parentDir as string) || (metadata?.filepath as string) || ""
			return `Access external directory: ${dir}`
		}
		case "doom_loop": {
			return "Continue after repeated failures"
		}
		default:
			return `Call ${permission}`
	}
}

function getPermissionDetails(req: PermissionRequest): string | null {
	const permission = req.permission
	const metadata = req.metadata

	switch (permission) {
		case "bash": {
			const command = (metadata?.command as string) || ""
			return command ? `$ ${command}` : null
		}
		case "edit":
		case "write": {
			const filepath = (metadata?.filepath as string) || ""
			return filepath || null
		}
		case "external_directory": {
			const patterns = req.patterns || []
			return patterns.length > 0 ? patterns.join(", ") : null
		}
		default:
			return null
	}
}

// Handle messages from extension
window.addEventListener("message", async (e: MessageEvent<ExtMessage>) => {
	const msg = e.data
	if (!msg || msg.panelId !== panelId) return

	switch (msg.type) {
		case "addOperation": {
			const op = msg.data as Operation
			operations.set(op.id, op)

			// Handle step boundaries
			if (op.type === "step-start") {
				// Create a step container
				currentStepContainer = document.createElement("div")
				currentStepContainer.className = "step-container"
				container.appendChild(currentStepContainer)
			} else if (op.type === "step-finish") {
				// Close the step container
				currentStepContainer = null
			} else {
				// Regular operation - add to container or directly to container
				const el = await createOperationElement(op)
				if (currentStepContainer) {
					currentStepContainer.appendChild(el)
				} else {
					container.appendChild(el)
				}
			}

			scrollToBottom()
			break
		}

		case "updateOperation": {
			const { id, updates } = msg.data as { id: string; updates: Partial<Operation> }
			const existing = operations.get(id)
			if (!existing) break

			Object.assign(existing, updates)
			const el = document.querySelector(`[data-id="${id}"]`) as HTMLElement | null
			if (el) {
				await updateOperationElement(el, existing, updates)
			}
			scrollToBottom()
			break
		}

		case "removeOperation": {
			const opId = msg.data.id as string
			operations.delete(opId)
			const el = document.querySelector(`[data-id="${opId}"]`)
			if (el) {
				el.remove()
			}
			break
		}

		case "setTheme":
			// Theme is automatically applied via CSS variables
			break

		case "setAvailableModels": {
			setProviders(msg.data as { providers: Provider[] })
			break
		}

		case "setSessionModel": {
			setSelectedModel(msg.data as { providerID: string; modelID: string; modelName: string })
			break
		}

		case "promptApiKey": {
			showApiKeyPrompt(msg.data as { providerID: string; providerName: string; error?: string })
			break
		}

		case "providerConnectionError": {
			showConnectionError(msg.data as { providerID: string; error: string })
			break
		}

		case "setCancelButtonVisible": {
			const { visible } = msg.data as { visible: boolean }
			cancelBtn.style.display = visible ? "inline-block" : "none"
			break
		}

		case "setSessions": {
			const { sessions } = msg.data as {
				sessions: { id: string; title: string; time: { archived?: number }; status?: SessionStatus }[]
			}
			sessionListActive.innerHTML = ""
			sessionListTrashed.innerHTML = ""

			const active = sessions.filter((s) => !s.time.archived)
			const trashed = sessions.filter((s) => s.time.archived)

			if (sessions.length === 0) {
				sessionDropdownLabel.textContent = "No sessions"
			} else {
				for (const session of active) {
					sessionListActive.appendChild(createSessionItem(session, false))
				}
				for (const session of trashed) {
					sessionListTrashed.appendChild(createSessionItem(session, true))
				}
				sessionListSeparator.style.display = active.length > 0 && trashed.length > 0 ? "block" : "none"

				const current = sessions.find((s) => s.id === currentSessionId)
				if (current) {
					sessionDropdownLabel.textContent = current.title || current.id.substring(0, 8)
				} else if (active.length > 0) {
					sessionDropdownLabel.textContent = active[0].title || active[0].id.substring(0, 8)
				}
			}
			break
		}

		case "updateSessionStatus": {
			const { sessionId, status } = msg.data as { sessionId: string; status: SessionStatus }
			const item =
				sessionListActive.querySelector(`[data-session-id="${sessionId}"]`) ||
				sessionListTrashed.querySelector(`[data-session-id="${sessionId}"]`)
			if (item) {
				item.classList.remove("status-idle", "status-busy", "status-retry")
				if (status.type === "busy") {
					item.classList.add("status-busy")
				} else if (status.type === "retry") {
					item.classList.add("status-retry")
				} else {
					item.classList.add("status-idle")
				}
			}
			break
		}

		case "setCurrentSession": {
			const { sessionId, title, agent } = msg.data as { sessionId: string; title?: string; agent?: string }
			currentSessionId = sessionId
			sessionDropdownLabel.textContent = title || sessionId.substring(0, 8)
			if (agent && (agent === "build" || agent === "plan" || agent === "docs")) {
				setMode(agent)
			}
			break
		}

		case "setParentSession": {
			const { parentId, parentTitle } = msg.data as { parentId: string | null; parentTitle?: string }
			parentSessionId = parentId
			parentSessionTitle = parentTitle || null
			if (parentId) {
				// Viewing a sub-session: show parent banner, hide session selector
				parentBanner.style.display = "flex"
				sessionSelector.style.display = "none"
				const titleEl = document.getElementById("parent-session-title")
				if (titleEl && parentTitle) {
					titleEl.textContent = parentTitle
				}
			} else {
				// Viewing a root session: hide parent banner, show session selector
				parentBanner.style.display = "none"
				sessionSelector.style.display = "flex"
			}
			break
		}

		case "setOperations": {
			const { operations: ops } = msg.data as { operations: Operation[] }
			container.innerHTML = ""
			operations.clear()
			currentStepContainer = null

			for (const op of ops) {
				operations.set(op.id, op)

				if (op.type === "step-start") {
					currentStepContainer = document.createElement("div")
					currentStepContainer.className = "step-container"
					container.appendChild(currentStepContainer)
				} else if (op.type === "step-finish") {
					currentStepContainer = null
				} else {
					const el = await createOperationElement(op)
					if (currentStepContainer) {
						currentStepContainer.appendChild(el)
					} else {
						container.appendChild(el)
					}
				}
			}
			scrollToBottom(true)
			break
		}

		case "setTodos": {
			const { todos: newTodos } = msg.data as { todos: TodoItem[] }
			todos = newTodos
			renderTodos()
			break
		}

		case "init": {
			const { todoSidebarVisible: visible } = msg.data as { todoSidebarVisible: boolean }
			todoSidebarVisible = visible ?? false
			updateTodoSidebarVisibility()
			break
		}

		case "permissionRequest": {
			const req = msg.data as PermissionRequest
			showPermissionPrompt(req)
			break
		}
	}
})

// Initialize
;(window as any).initPanel = (panelIdValue: string) => {
	panelId = panelIdValue
	startElapsedTimers()
	initModelSelector(panelIdValue, vscode)
	vscode.postMessage({
		panelId,
		type: "init",
		data: {},
	})
}
