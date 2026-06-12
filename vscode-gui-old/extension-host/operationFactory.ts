import type { AssistantError } from "./types/backend"
import type { Operation, UserMessageOperation } from "./types/operations"

export function createErrorOperation(error: AssistantError, sessionId: string, relatedMessageId?: string): Operation {
	let errorMessage: string
	let title: string
	const extra: {
		statusCode?: number
		responseBody?: string
		providerID?: string
		isRetryable?: boolean
		responseHeaders?: Record<string, string>
		metadata?: Record<string, string>
		retries?: number
	} = {}

	switch (error.name) {
		case "MessageOutputLengthError":
			errorMessage = "Output length limit exceeded"
			title = "Output Limit Exceeded"
			break
		case "MessageAbortedError":
			errorMessage = error.data.message
			title = `Aborted: ${errorMessage}`
			break
		case "ProviderAuthError":
			errorMessage = error.data.message
			title = `Auth Error (${error.data.providerID}): ${errorMessage}`
			extra.providerID = error.data.providerID
			break
		case "APIError":
			errorMessage = error.data.message
			title = `API Error${error.data.statusCode ? ` (${error.data.statusCode})` : ""}: ${errorMessage}`
			if (error.data.statusCode) extra.statusCode = error.data.statusCode
			if (error.data.responseBody) extra.responseBody = error.data.responseBody
			if (error.data.isRetryable !== undefined) extra.isRetryable = error.data.isRetryable
			if (error.data.responseHeaders) extra.responseHeaders = error.data.responseHeaders
			if (error.data.metadata) extra.metadata = error.data.metadata
			break
		case "ContextOverflowError":
			errorMessage = error.data.message
			title = `Context Overflow: ${errorMessage}`
			if (error.data.responseBody) extra.responseBody = error.data.responseBody
			break
		case "StructuredOutputError":
			errorMessage = error.data.message
			title = `Structured Output Error: ${errorMessage}`
			extra.retries = error.data.retries
			break
		case "UnknownError":
			errorMessage = error.data.message
			title = `Error: ${errorMessage}`
			break
		default:
			errorMessage = "An unexpected error occurred"
			title = "Error"
	}

	return {
		id: crypto.randomUUID(),
		type: "error",
		title,
		error: errorMessage,
		errorType: error.name,
		timestamp: Date.now(),
		expanded: true,
		status: "error",
		sessionId,
		messageId: relatedMessageId || sessionId,
		partId: crypto.randomUUID(),
		...extra,
	}
}

export function createStartOperation(sessionId: string): Operation {
	return {
		id: crypto.randomUUID(),
		type: "start",
		title: "Start of history",
		content: "",
		timestamp: Date.now(),
		expanded: false,
		status: "complete",
		sessionId,
		messageId: sessionId,
		partId: crypto.randomUUID(),
	}
}

/**
 * Creates a user message operation (local only, not from backend)
 *
 * The caller must supply the backend's message id when known. For a live
 * user message (one typed into the prompt input), no backend message id
 * exists yet, so messageId is left as "". The webview hides the undo/fork
 * buttons in that case.
 */
export function createUserMessageOperation(
	sessionId: string,
	content: string,
	model?: { providerID: string; modelID: string },
	agent?: string,
	timestamp?: number,
	messageId: string = "",
): UserMessageOperation {
	return {
		id: crypto.randomUUID(),
		type: "user-message",
		title: "You",
		content,
		timestamp,
		expanded: true,
		status: "complete",
		sessionId,
		messageId,
		partId: crypto.randomUUID(),
		model,
		agent,
	}
}