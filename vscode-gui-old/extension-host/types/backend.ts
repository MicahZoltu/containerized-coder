/**
 * Backend type definitions matching OpenCode server schemas
 * These types mirror the Zod schemas in packages/opencode
 * Use discriminated unions instead of optional properties
 */

// ============================================================================
// Message Parts (12 types from MessageV2.Part)
// ============================================================================

export type PartType =
	| "text"
	| "reasoning"
	| "file"
	| "tool"
	| "step-start"
	| "step-finish"
	| "snapshot"
	| "patch"
	| "agent"
	| "subtask"
	| "retry"
	| "compaction"

// Base fields for all parts
interface PartBase {
	id: string
	sessionID: string
	messageID: string
}

// text - AI text response
export interface TextPart extends PartBase {
	type: "text"
	text: string
	synthetic?: boolean
	ignored?: boolean
	time?: {
		start: number
		end?: number
	}
	metadata?: Record<string, unknown>
}

// reasoning - AI reasoning/thinking
export interface ReasoningPart extends PartBase {
	type: "reasoning"
	text: string
	metadata?: Record<string, unknown>
	time: {
		start: number
		end?: number
	}
}

// file - User uploaded files/images
export type FilePartSource =
	| { type: "file"; path: string; text: { value: string; start: number; end: number } }
	| {
			type: "symbol"
			path: string
			range: unknown
			name: string
			kind: number
			text: { value: string; start: number; end: number }
		}
	| { type: "resource"; clientName: string; uri: string; text: { value: string; start: number; end: number } }

export interface FilePart extends PartBase {
	type: "file"
	mime: string
	filename?: string
	url: string
	source?: FilePartSource
}

// tool - Tool execution with state machine
type ToolState =
	| { status: "pending"; input: Record<string, unknown>; raw: string }
	| {
			status: "running"
			input: Record<string, unknown>
			title?: string
			metadata?: Record<string, unknown>
			time: { start: number }
		}
	| {
			status: "completed"
			input: Record<string, unknown>
			output: string
			title: string
			metadata: Record<string, unknown>
			time: { start: number; end: number; compacted?: number }
			attachments?: FilePart[]
		}
	| {
			status: "error"
			input: Record<string, unknown>
			error: string
			metadata?: Record<string, unknown>
			time: { start: number; end: number }
		}

export interface ToolPart extends PartBase {
	type: "tool"
	callID: string
	tool: string
	state: ToolState
	metadata?: Record<string, unknown>
}

// step-start/step-finish - Step markers
export interface StepStartPart extends PartBase {
	type: "step-start"
	snapshot?: string
}

export interface StepFinishPart extends PartBase {
	type: "step-finish"
	reason: string
	snapshot?: string
	cost: number
	tokens: {
		input: number
		output: number
		reasoning: number
		cache: { read: number; write: number }
	}
}

// snapshot - Git checkpoint reference
export interface SnapshotPart extends PartBase {
	type: "snapshot"
	snapshot: string
}

// patch - File changes
export interface PatchPart extends PartBase {
	type: "patch"
	hash: string
	files: string[]
}

// agent - Agent reference
export interface AgentPart extends PartBase {
	type: "agent"
	name: string
	source?: {
		value: string
		start: number
		end: number
	}
}

// subtask - Subtask information
export interface SubtaskPart extends PartBase {
	type: "subtask"
	prompt: string
	description: string
	agent: string
	model?: {
		providerID: string
		modelID: string
	}
	command?: string
}

// retry - Retry attempt
export interface RetryPart extends PartBase {
	type: "retry"
	attempt: number
	error: AssistantError
	time: {
		created: number
	}
}

// compaction - Session compaction marker
export interface CompactionPart extends PartBase {
	type: "compaction"
	auto: boolean
}

// Union of all part types
export type Part =
	| TextPart
	| ReasoningPart
	| FilePart
	| ToolPart
	| StepStartPart
	| StepFinishPart
	| SnapshotPart
	| PatchPart
	| AgentPart
	| SubtaskPart
	| RetryPart
	| CompactionPart

// ============================================================================
// Error Types
// ============================================================================

export type AssistantError =
	| { name: "MessageOutputLengthError"; data: {} }
	| { name: "MessageAbortedError"; data: { message: string } }
	| { name: "ProviderAuthError"; data: { providerID: string; message: string } }
	| {
			name: "APIError"
			data: {
				message: string
				statusCode?: number
				isRetryable: boolean
				responseHeaders?: Record<string, string>
				responseBody?: string
				metadata?: Record<string, string>
			}
		}
	| { name: "ContextOverflowError"; data: { message: string; responseBody?: string } }
	| { name: "StructuredOutputError"; data: { message: string; retries: number } }
	| { name: "UnknownError"; data: { message: string } }

// ============================================================================
// Session Status
// ============================================================================

export type SessionStatus =
	| { type: "idle" }
	| { type: "busy" }
	| { type: "retry"; attempt: number; message: string; next: number }

// ============================================================================
// Message Info
// ============================================================================

export type MessageInfo =
	| {
			id: string
			sessionID: string
			role: "user"
			time: { created: number }
			agent: string
			model: { providerID: string; modelID: string }
		}
	| {
			id: string
			sessionID: string
			role: "assistant"
			time: { created: number; completed?: number }
			error?: AssistantError
			parentID: string
			modelID: string
			providerID: string
			agent: string
			path: { cwd: string; root: string }
		}

// ============================================================================
// Question Types
// ============================================================================

export interface QuestionOption {
	label: string
	description: string
}

export interface QuestionInfo {
	question: string
	header: string
	options: QuestionOption[]
	multiple?: boolean
	custom?: boolean
}

export interface QuestionRequest {
	id: string
	sessionID: string
	questions: QuestionInfo[]
	tool?: {
		messageID: string
		callID: string
	}
}

export type QuestionAnswer = string[]

// ============================================================================
// Permission Types
// ============================================================================

export interface PermissionRequest {
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

export type PermissionReply = "once" | "always" | "reject"

// ============================================================================
// Server Events
// ============================================================================

export type ServerEvent =
	| { type: "message.updated"; properties: { info: MessageInfo } }
	| { type: "message.part.updated"; properties: { part: Part; delta?: string } }
	| { type: "message.part.removed"; properties: { sessionID: string; messageID: string; partID: string } }
	| { type: "session.status"; properties: { sessionID: string; status: SessionStatus } }
	| { type: "session.error"; properties: { sessionID?: string; error: AssistantError } }
	| { type: "server.connected"; properties: {} }
	| { type: "server.heartbeat"; properties: {} }
	| { type: "question.asked"; properties: QuestionRequest }
	| { type: "question.replied"; properties: { sessionID: string; requestID: string; answers: QuestionAnswer[] } }
	| { type: "question.rejected"; properties: { sessionID: string; requestID: string } }
	| { type: "permission.asked"; properties: PermissionRequest }
	| { type: "permission.replied"; properties: { sessionID: string; requestID: string; reply: PermissionReply } }
	| { type: "todo.updated"; properties: { sessionID: string; todos: TodoItem[] } }

// ============================================================================
// Session Info
// ============================================================================

export interface Session {
	id: string
	title: string
	parentID?: string
	time: {
		created: number
		updated: number
		archived?: number
	}
	status?: SessionStatus
}

// Provider types for model selection
export interface Provider {
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

export interface Model {
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

export interface Config {
	model?: string
	small_model?: string
	providers?: Record<string, ProviderConfig>
}

export interface ProviderConfig {
	options?: {
		apiKey?: string
		baseURL?: string
	}
}

// ============================================================================
// Todo Types
// ============================================================================

export interface TodoItem {
	id: string
	content: string
	status: "pending" | "in_progress" | "completed" | "cancelled"
	priority: "high" | "medium" | "low"
}
