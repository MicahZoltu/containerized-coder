import type { Part, MessageInfo, AssistantError } from "./types/backend"
import type { Operation, ToolOperation } from "./types/operations"
import { log } from "./logger"

/**
 * Extracts tool-specific metadata from backend metadata
 */
function extractToolMetadata(tool: string, metadata: Record<string, unknown> | undefined): ToolOperation["metadata"] {
	if (!metadata) return undefined

	const result: ToolOperation["metadata"] = {}

	switch (tool) {
		case "read":
			result.filePath = metadata.filePath as string
			result.preview = metadata.preview as string
			result.truncated = metadata.truncated as boolean
			result.loaded = metadata.loaded as string[]
			break

		case "edit":
			result.diff = metadata.diff as string
			result.filediff = metadata.filediff as {
				file: string
				before: string
				after: string
				additions: number
				deletions: number
			}
			break

		case "bash":
			result.command = metadata.command as string
			result.exit = metadata.exit as number
			result.description = metadata.description as string
			break

		case "apply_patch":
			result.diff = metadata.diff as string
			result.filediff = metadata.filediff as {
				file: string
				before: string
				after: string
				additions: number
				deletions: number
			}
			break

		case "task":
			result.sessionId = metadata.sessionId as string
			break

		case "question":
			result.requestId = metadata.requestId as string
			result.answers = metadata.answers as string[][]
			break
	}

	return result
}

/**
 * Maps backend Part types to frontend Operation types
 * Uses discriminated unions for type safety
 */

export function partToOperation(part: Part, messageInfo: MessageInfo | null): Operation | null {
	// Determine status based on part type and data
	const getStatus = (): "pending" | "complete" | "error" | "running" => {
		switch (part.type) {
			case "text":
			case "reasoning":
				// If time.end exists, operation is complete
				return part.time?.end ? "complete" : "pending"
			case "tool":
				switch (part.state.status) {
					case "completed":
						return "complete"
					case "error":
						return "error"
					case "pending":
						return "pending"
					case "running":
						return "running"
				}
			case "step-finish":
			case "compaction":
				return "complete"
			default:
				// All other types are complete by default
				return "complete"
		}
	}

	const getTimestamp = (): number | undefined => {
		switch (part.type) {
			case "text":
			case "reasoning":
				return part.time?.end || part.time?.start
			case "tool":
				if (part.state.status === "pending") return undefined
				return "end" in part.state.time ? part.state.time.end : part.state.time.start
			case "retry":
				return part.time.created
			default:
				return undefined
		}
	}

	const base = {
		id: part.id,
		timestamp: getTimestamp(),
		expanded: true,
		status: getStatus(),
		sessionId: part.sessionID,
		messageId: part.messageID,
		partId: part.id,
		agent: messageInfo?.agent,
	}

	switch (part.type) {
		case "text": {
			const model =
				messageInfo && messageInfo.role === "assistant"
					? { providerID: messageInfo.providerID, modelID: messageInfo.modelID }
					: undefined
			return {
				...base,
				type: "text",
				title: "Response",
				content: part.text,
				synthetic: part.synthetic,
				model,
			}
		}

		case "reasoning": {
			const model =
				messageInfo && messageInfo.role === "assistant"
					? { providerID: messageInfo.providerID, modelID: messageInfo.modelID }
					: undefined
			return {
				...base,
				type: "thinking",
				title: "Thinking...",
				content: part.text,
				model,
			}
		}

		case "tool": {
			// Generate descriptive title based on tool type and input
			const input = part.state.input || {}
			let title: string

			if (part.tool === "read" && input.filePath) {
				const fileName = (input.filePath as string).split("/").pop() || (input.filePath as string)
				title = `Read ${fileName}`
			} else if (part.tool === "edit" && input.filePath) {
				const fileName = (input.filePath as string).split("/").pop() || (input.filePath as string)
				title = `Edit ${fileName}`
			} else if (part.tool === "bash" && input.description) {
				title = input.description as string
			} else if (part.tool === "grep" && input.pattern) {
				title = `grep ${input.pattern}`
			} else {
				title = ("title" in part.state ? part.state.title : null) || part.tool
			}

			const toolBase = {
				...base,
				title,
				tool: part.tool,
				callID: part.callID,
			}

			switch (part.state.status) {
				case "pending": {
					return {
						...toolBase,
						type: "tool" as const,
						state: "pending" as const,
						input: part.state.input,
					}
				}

				case "running": {
					const metadata = extractToolMetadata(part.tool, part.state.metadata)
					return {
						...toolBase,
						type: "tool" as const,
						state: "running" as const,
						startTime: part.state.time.start,
						input: part.state.input,
						metadata,
					}
				}

				case "completed": {
					const metadata = extractToolMetadata(part.tool, part.state.metadata)
					return {
						...toolBase,
						type: "tool" as const,
						state: "completed" as const,
						status: "complete" as const,
						expanded: false,
						output: part.state.output,
						attachments: part.state.attachments?.map((att) => ({
							mime: att.mime,
							url: att.url,
							filename: att.filename,
						})),
						startTime: part.state.time.start,
						endTime: part.state.time.end,
						input: part.state.input,
						metadata,
					}
				}

				case "error": {
					const metadata = extractToolMetadata(part.tool, part.state.metadata)
					return {
						...toolBase,
						type: "tool" as const,
						state: "error" as const,
						status: "error" as const,
						expanded: false,
						error: part.state.error,
						startTime: part.state.time.start,
						endTime: part.state.time.end,
						input: part.state.input,
						metadata,
					}
				}

				default:
					return null
			}
		}

		case "file": {
			const source = part.source
				? {
						type: part.source.type,
						path: "path" in part.source ? part.source.path : undefined,
						name: "name" in part.source ? part.source.name : undefined,
						clientName: "clientName" in part.source ? part.source.clientName : undefined,
						uri: "uri" in part.source ? part.source.uri : undefined,
					}
				: undefined

			return {
				...base,
				type: "file-attachment",
				title: part.filename || "File",
				mime: part.mime,
				url: part.url,
				filename: part.filename,
				source,
			}
		}

		case "patch": {
			// Skip file change patches - they clutter the history
			return null
		}

		case "snapshot": {
			return {
				...base,
				type: "snapshot",
				title: "Checkpoint",
				snapshot: part.snapshot,
			}
		}

		case "agent": {
			return {
				...base,
				type: "agent",
				title: `Agent: ${part.name}`,
				agent: part.name,
			}
		}

		case "subtask": {
			return {
				...base,
				type: "subtask",
				title: part.description || "Subtask",
				description: part.description,
				agent: part.agent,
				prompt: part.prompt,
			}
		}

		case "step-start": {
			return {
				...base,
				type: "step-start",
				title: "Step Started",
				snapshot: part.snapshot,
			}
		}

		case "step-finish": {
			return {
				...base,
				type: "step-finish",
				status: "complete",
				title: "Step Completed",
				reason: part.reason,
				cost: part.cost,
				tokens: part.tokens,
				snapshot: part.snapshot,
			}
		}

		case "retry": {
			return {
				...base,
				type: "retry",
				title: "Retrying...",
				attempt: part.attempt,
				message: "data" in part.error && "message" in part.error.data ? part.error.data.message : part.error.name,
				next: part.time.created,
			}
		}

		case "compaction": {
			return {
				...base,
				type: "compaction",
				status: "complete",
				title: "Session Compacted",
				auto: part.auto,
			}
		}

		default:
			// Unknown part type - skip
			return null
	}
}

/**
 * Updates an existing operation with new part data
 * Returns updated operation or null if types don't match
 */
export function updateOperationFromPart(existing: Operation, part: Part): Operation | null {
	// Verify the operation matches the part type
	const partTypeMap: Record<string, string> = {
		text: "text",
		reasoning: "thinking",
		tool: "tool",
		file: "file-attachment",
		patch: "file-change",
		snapshot: "snapshot",
		agent: "agent",
		subtask: "subtask",
		"step-start": "step-start",
		"step-finish": "step-finish",
		retry: "retry",
		compaction: "compaction",
	}

	const expectedType = partTypeMap[part.type]
	if (existing.type !== expectedType) {
		// Type mismatch - part type changed (unusual but possible)
		// Create new operation instead
		log(`Part type changed from ${existing.type} to ${expectedType}`)
		return partToOperation(part, null)
	}

	// Update based on part type
	switch (part.type) {
		case "text": {
			if (existing.type !== "text") return null
			// Update status to complete if time.end is now set
			const status = part.time?.end ? "complete" : existing.status
			// Text operations stay expanded when complete
			const expanded = status === "complete" ? true : existing.expanded
			return {
				...existing,
				content: part.text,
				synthetic: part.synthetic,
				status,
				expanded,
			}
		}

		case "reasoning": {
			if (existing.type !== "thinking") return null
			// Update status to complete if time.end is now set
			const status = part.time?.end ? "complete" : existing.status
			// Thinking operations collapse when complete
			const expanded = status === "complete" ? false : existing.expanded
			return {
				...existing,
				content: part.text,
				status,
				expanded,
			}
		}

		case "tool": {
			if (existing.type !== "tool") return null
			// Tool operations should collapse when completed, so don't preserve expanded state
			return partToOperation(part, null) || existing
		}

		default:
			// For other types, just recreate
			return partToOperation(part, null) || existing
	}
}

/**
 * Creates an error operation from session error
 */
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
		id: `error-${Date.now()}`,
		type: "error",
		title,
		error: errorMessage,
		errorType: error.name,
		timestamp: Date.now(),
		expanded: true,
		status: "error",
		sessionId,
		messageId: relatedMessageId || sessionId,
		partId: `error-${Date.now()}`,
		...extra,
	}
}

/**
 * Creates a start operation (local only, not from backend)
 */
export function createStartOperation(sessionId: string): Operation {
	return {
		id: `start-${Date.now()}`,
		type: "start",
		title: "Start of history",
		content: "",
		timestamp: Date.now(),
		expanded: false,
		status: "complete",
		sessionId,
		messageId: sessionId,
		partId: `start-${Date.now()}`,
	}
}

/**
 * Creates a user message operation (local only, not from backend)
 */
export function createUserMessageOperation(
	sessionId: string,
	content: string,
	model?: { providerID: string; modelID: string },
	agent?: string,
	timestamp?: number,
): Operation {
	return {
		id: `user-${Date.now()}`,
		type: "user-message",
		title: "You",
		content,
		timestamp,
		expanded: true,
		status: "complete",
		sessionId,
		messageId: sessionId,
		partId: `user-${Date.now()}`,
		model,
		agent,
	}
}
