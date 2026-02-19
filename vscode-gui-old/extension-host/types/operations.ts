/**
 * Operation types using discriminated unions
 * Maps from backend Part types to UI operations
 */

// ============================================================================
// Base Operation (common fields)
// ============================================================================

interface OperationBase {
	id: string
	timestamp: number | undefined
	expanded: boolean
	status: "pending" | "running" | "complete" | "error"
	sessionId: string
	messageId: string
	partId: string
	agent?: string
}

// ============================================================================
// Operation Types (discriminated by type field)
// ============================================================================

// text - From TextPart (AI response)
export interface TextOperation extends OperationBase {
	type: "text"
	title: "Response"
	content: string
	synthetic?: boolean
	model?: { providerID: string; modelID: string }
}

// thinking - From ReasoningPart (AI reasoning)
export interface ThinkingOperation extends OperationBase {
	type: "thinking"
	title: "Thinking..."
	content: string
	model?: { providerID: string; modelID: string }
}

// tool - Tool execution (unified type with state)
export interface ToolOperation extends OperationBase {
	type: "tool"
	title: string
	tool: string
	callID: string
	state: "pending" | "running" | "completed" | "error"
	// Pending/Running fields
	startTime?: number
	// Completed fields
	output?: string
	attachments?: Array<{
		mime: string
		url: string
		filename?: string
	}>
	endTime?: number
	// Error fields
	error?: string
	// Tool input parameters
	input?: Record<string, unknown>
	// Tool-specific metadata
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

// file-attachment - User uploaded file/image
export interface FileAttachmentOperation extends OperationBase {
	type: "file-attachment"
	title: string
	mime: string
	url: string
	filename?: string
	source?: {
		type: "file" | "symbol" | "resource"
		path?: string
		name?: string
		clientName?: string
		uri?: string
	}
}

// file-change - Code changes (from PatchPart)
export interface FileChangeOperation extends OperationBase {
	type: "file-change"
	title: "File Changes"
	hash: string
	files: string[]
}

// snapshot - Git checkpoint
export interface SnapshotOperation extends OperationBase {
	type: "snapshot"
	title: "Checkpoint"
	snapshot: string
}

// agent - Agent reference
export interface AgentOperation extends OperationBase {
	type: "agent"
	title: string
	agent: string
}

// subtask - Subtask information
export interface SubtaskOperation extends OperationBase {
	type: "subtask"
	title: string
	description: string
	agent: string
	prompt: string
}

// step-start - Step marker
export interface StepStartOperation extends OperationBase {
	type: "step-start"
	title: "Step Started"
	snapshot?: string
}

// step-finish - Step completion
export interface StepFinishOperation extends OperationBase {
	type: "step-finish"
	title: "Step Completed"
	reason: string
	cost: number
	tokens: {
		input: number
		output: number
		reasoning: number
		cache: { read: number; write: number }
	}
	snapshot?: string
}

// retry - Retry attempt
export interface RetryOperation extends OperationBase {
	type: "retry"
	title: "Retrying..."
	attempt: number
	message: string
	next: number
}

// compaction - Session compaction
export interface CompactionOperation extends OperationBase {
	type: "compaction"
	title: "Session Compacted"
	auto: boolean
}

// error - Session or operation error
export interface ErrorOperation extends OperationBase {
	type: "error"
	title: string
	error: string
	errorType: string
	statusCode?: number
	responseBody?: string
	providerID?: string
	isRetryable?: boolean
	responseHeaders?: Record<string, string>
	metadata?: Record<string, string>
	retries?: number
}

// start - Initial marker (not from backend, created locally)
export interface StartOperation extends OperationBase {
	type: "start"
	title: "Start of history"
	content: ""
}

// user-message - User input (not from backend, created locally)
export interface UserMessageOperation extends OperationBase {
	type: "user-message"
	title: "You"
	content: string
	model?: { providerID: string; modelID: string }
}

// question - AI asking user a question (from question.asked event)
export interface QuestionOperation extends OperationBase {
	type: "question"
	title: string
	requestId: string
	questions: Array<{
		question: string
		header: string
		options: Array<{ label: string; description: string }>
		multiple?: boolean
		custom?: boolean
	}>
}

// ============================================================================
// Operation Union Type
// ============================================================================

export type Operation =
	| TextOperation
	| ThinkingOperation
	| ToolOperation
	| FileAttachmentOperation
	| FileChangeOperation
	| SnapshotOperation
	| AgentOperation
	| SubtaskOperation
	| StepStartOperation
	| StepFinishOperation
	| RetryOperation
	| CompactionOperation
	| ErrorOperation
	| StartOperation
	| UserMessageOperation
	| QuestionOperation

// ============================================================================
// Action Types
// ============================================================================

export interface Action {
	id: string
	label: string
	icon?: string
	disabled?: boolean
}

// ============================================================================
// Operation Type Configuration (for UI rendering)
// ============================================================================

export interface OperationTypeConfig<T extends Operation = Operation> {
	type: T["type"]
	icon: string
	defaultExpanded: boolean
	cssClass: string
	renderContent: (op: T) => string
	getActions: (op: T) => Action[]
	onComplete?: (op: T) => Partial<T>
}

// ============================================================================
// Message Types (for WebView communication)
// ============================================================================

import type { Provider, Session, QuestionAnswer, TodoItem, PermissionRequest, PermissionReply } from "./backend"

export type ExtToWebviewMsg =
	| { panelId: string; type: "init"; data: { todoSidebarVisible: boolean } }
	| { panelId: string; type: "addOperation"; data: Operation }
	| { panelId: string; type: "updateOperation"; data: { id: string; updates: Partial<Operation> } }
	| { panelId: string; type: "removeOperation"; data: { id: string } }
	| { panelId: string; type: "setTheme"; data: { theme: string } }
	| { panelId: string; type: "setAvailableModels"; data: { providers: Provider[] } }
	| { panelId: string; type: "setSessionModel"; data: { providerID: string; modelID: string; modelName: string } }
	| { panelId: string; type: "promptApiKey"; data: { providerID: string; providerName: string; error?: string } }
	| { panelId: string; type: "providerConnectionError"; data: { providerID: string; error: string } }
	| { panelId: string; type: "setCancelButtonVisible"; data: { visible: boolean } }
	| { panelId: string; type: "setSessions"; data: { sessions: Session[] } }
	| { panelId: string; type: "updateSessionStatus"; data: { sessionId: string; status: Session["status"] } }
	| { panelId: string; type: "setCurrentSession"; data: { sessionId: string; title?: string; agent?: string } }
	| { panelId: string; type: "setOperations"; data: { operations: Operation[] } }
	| { panelId: string; type: "setParentSession"; data: { parentId: string | null; parentTitle?: string } }
	| { panelId: string; type: "setTodos"; data: { todos: TodoItem[] } }
	| { panelId: string; type: "setTodoSidebarVisible"; data: { visible: boolean } }
	| { panelId: string; type: "questionRequestId"; data: { callID: string; requestId: string | null } }
	| { panelId: string; type: "permissionRequest"; data: PermissionRequest }

export type WebviewToExtMsg =
	| { panelId: string; type: "init"; data: {} }
	| { panelId: string; type: "submitPrompt"; data: { prompt: string; agent?: string } }
	| { panelId: string; type: "operationAction"; data: { operationId: string; actionId: string; filePath?: string } }
	| { panelId: string; type: "toggleCollapse"; data: { operationId: string; expanded: boolean } }
	| { panelId: string; type: "openModelSelector"; data: {} }
	| { panelId: string; type: "selectModel"; data: { providerID: string; modelID: string } }
	| { panelId: string; type: "connectProvider"; data: { providerID: string; apiKey: string } }
	| { panelId: string; type: "cancelConnectProvider"; data: {} }
	| { panelId: string; type: "refreshModels"; data: {} }
	| { panelId: string; type: "cancelSession"; data: {} }
	| { panelId: string; type: "selectSession"; data: { sessionId: string } }
	| { panelId: string; type: "createSession"; data: {} }
	| { panelId: string; type: "refreshSessions"; data: {} }
	| {
			panelId: string
			type: "switchToSession"
			data: { sessionId: string; parentSessionId?: string; parentSessionTitle?: string }
		}
	| { panelId: string; type: "archiveSession"; data: { sessionId: string } }
	| { panelId: string; type: "unarchiveSession"; data: { sessionId: string } }
	| { panelId: string; type: "deleteSession"; data: { sessionId: string } }
	| { panelId: string; type: "renameSession"; data: { sessionId: string; title: string } }
	| { panelId: string; type: "requestRenameSession"; data: { sessionId: string; currentTitle: string } }
	| { panelId: string; type: "answerQuestion"; data: { requestId: string; answers: QuestionAnswer[] } }
	| { panelId: string; type: "rejectQuestion"; data: { requestId: string } }
	| { panelId: string; type: "getQuestionRequestId"; data: { callID: string } }
	| { panelId: string; type: "toggleTodoSidebar"; data: { visible: boolean } }
	| { panelId: string; type: "replyPermission"; data: { requestID: string; reply: PermissionReply; message?: string } }
