import type { ApiError, ContextOverflowError, FileDiff, Message, MessageAbortedError, MessageOutputLengthError, Part, ProviderAuthError, SessionStatus as SdkSessionStatus, Session, StructuredOutputError, Todo, ToolState, UnknownError } from "@opencode-ai/sdk/v2"
import { assertNever } from '../utils/miscellaneous.js'
import type { SessionMetadata, UIError, UIFileDiff, UIMessage, UIPart, UITodo } from "./types.js"
import { adaptSessionStatus } from "./types.js"

export function adaptSessionMetadata(sdkSession: Session, sdkStatus: SdkSessionStatus): SessionMetadata {
	const result: SessionMetadata = {
		id: sdkSession.id,
		title: sdkSession.title,
		directory: sdkSession.directory,
		status: adaptSessionStatus(sdkStatus),
		created: sdkSession.time.created,
		updated: sdkSession.time.updated,
	}
	if (sdkSession.time.archived !== undefined) {
		result.archived = sdkSession.time.archived
	}
	return result
}

export function adaptError(sdkError: ApiError | ProviderAuthError | UnknownError | MessageOutputLengthError | MessageAbortedError | StructuredOutputError | ContextOverflowError): UIError {
	switch (sdkError.name) {
		case "APIError": {
			const data = sdkError.data
			return {
				name: sdkError.name,
				message: data.message,
				isRetryable: data.isRetryable,
				...(data.statusCode !== undefined && { statusCode: data.statusCode }),
				...(data.responseHeaders !== undefined && { responseHeaders: data.responseHeaders }),
				...(data.responseBody !== undefined && { responseBody: data.responseBody }),
				...(data.metadata !== undefined && { metadata: data.metadata }),
			}
		}
		case "ProviderAuthError": {
			return {
				name: sdkError.name,
				message: sdkError.data.message,
				isRetryable: false,
			}
		}
		case "UnknownError": {
			return {
				name: sdkError.name,
				message: sdkError.data.message,
				isRetryable: false,
			}
		}
		case "MessageOutputLengthError": {
			const message = typeof sdkError.data.message === 'string' ? sdkError.data.message : "Message output length error"
			return {
				name: sdkError.name,
				message,
				isRetryable: false,
			}
		}
		case "MessageAbortedError": {
			return {
				name: sdkError.name,
				message: sdkError.data.message,
				isRetryable: false,
			}
		}
		case "StructuredOutputError": {
			return {
				name: sdkError.name,
				message: sdkError.data.message,
				isRetryable: false,
			}
		}
		case "ContextOverflowError": {
			const message = sdkError.data.message
			return {
				name: sdkError.name,
				message,
				isRetryable: false,
			}
		}
	}
}

export function adaptMessage(sdkMessage: Message, sdkParts: Part[]): UIMessage {
	const base: UIMessage = {
		id: sdkMessage.id,
		role: sdkMessage.role,
		parts: sdkParts.filter(p => p.messageID === sdkMessage.id).map(adaptPart),
		created: sdkMessage.time.created,
	}

	if (sdkMessage.role === "assistant") {
		if (sdkMessage.time.completed !== undefined) {
			base.completed = sdkMessage.time.completed
		}
		if (sdkMessage.error !== undefined) {
			base.error = adaptError(sdkMessage.error)
		}
	}

	return base
}

export function adaptPart(sdkPart: Part): UIPart {
	const type = sdkPart.type
	switch (type) {
		case "text":
			return { id: sdkPart.id, type: "text", text: sdkPart.text }
		case "reasoning":
			return { id: sdkPart.id, type: "reasoning", text: sdkPart.text }
		case "tool":
			return adaptToolPart(sdkPart.id, sdkPart.state)
		case "file": {
			const filePart: UIPart = { id: sdkPart.id, type: "file", url: sdkPart.url, mime: sdkPart.mime }
			if (sdkPart.filename !== undefined) {
				filePart.filename = sdkPart.filename
			}
			return filePart
		}
		case "step-start":
			return { id: sdkPart.id, type: "step-start" }
		case "step-finish":
			return { id: sdkPart.id, type: "step-finish", reason: sdkPart.reason }
		case "snapshot":
			return { id: sdkPart.id, type: "snapshot", snapshot: sdkPart.snapshot }
		case "patch":
			return { id: sdkPart.id, type: "patch", hash: sdkPart.hash, files: sdkPart.files }
		case "agent":
			return { id: sdkPart.id, type: "agent", name: sdkPart.name }
		case "retry":
			return { id: sdkPart.id, type: "retry", attempt: sdkPart.attempt, error: adaptError(sdkPart.error) }
		case "compaction":
			return { id: sdkPart.id, type: "compaction", auto: sdkPart.auto }
		case "subtask":
			return { id: sdkPart.id, type: "subtask", prompt: sdkPart.prompt, description: sdkPart.description, agent: sdkPart.agent }
		default:
			assertNever(type)
	}
}

function adaptToolPart(partID: string, state: ToolState): Extract<UIPart, { type: "tool" }> {
	const status = state.status
	switch (status) {
		case "pending":
			return { id: partID, type: "tool", status: "pending" }
		case "running": {
			const runningPart: Extract<UIPart, { type: "tool" }> = { id: partID, type: "tool", status: "running" }
			if (state.title !== undefined) {
				runningPart.title = state.title
			}
			return runningPart
		}
		case "completed": {
			const completedPart: Extract<UIPart, { type: "tool" }> = { id: partID, type: "tool", status: "completed", output: state.output }
			if (state.title !== undefined) {
				completedPart.title = state.title
			}
			if (state.attachments !== undefined) {
				completedPart.attachments = state.attachments.map(adaptPart)
			}
			return completedPart
		}
		case "error":
			return { id: partID, type: "tool", status: "error", error: state.error }
		default:
			assertNever(status)
	}
}

export function adaptMessages(sdkMessages: Message[], sdkParts: Part[]): UIMessage[] {
	return sdkMessages.map(msg => adaptMessage(msg, sdkParts))
}

function validateTodoStatus(status: string): UITodo["status"] {
	switch (status) {
		case 'pending':
		case 'in_progress':
		case 'completed':
		case 'cancelled':
			return status
		default:
			return 'pending'
	}
}

function validateTodoPriority(priority: string): UITodo["priority"] {
	switch (priority) {
		case 'high':
		case 'medium':
		case 'low':
			return priority
		default:
			return 'medium'
	}
}

export function adaptTodos(sdkTodos: Todo[]): UITodo[] {
	return sdkTodos.map(todo => ({
		content: todo.content,
		status: validateTodoStatus(todo.status),
		priority: validateTodoPriority(todo.priority),
	}))
}

export function adaptFileDiffs(sdkDiffs: FileDiff[]): UIFileDiff[] {
	return sdkDiffs.map(diff => ({
		file: diff.file,
		before: diff.before,
		after: diff.after,
		additions: diff.additions,
		deletions: diff.deletions,
		status: diff.status ?? "modified",
	}))
}
