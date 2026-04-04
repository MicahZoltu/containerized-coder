import type { ApiError, AssistantMessage, ContextOverflowError, FileDiff, FilePart, MessageAbortedError, MessageOutputLengthError, Part, PatchPart, ProviderAuthError, ReasoningPart, SessionStatus as SdkSessionStatus, Session, SnapshotPart, StepFinishPart, StepStartPart, StructuredOutputError, TextPart, ToolPart, ToolStateCompleted, ToolStateError, ToolStatePending, ToolStateRunning, UnknownError, UserMessage } from "@opencode-ai/sdk/v2"
import { describe, expect, test } from "bun:test"
import { adaptError, adaptFileDiffs, adaptMessages, adaptPart, adaptSessionMetadata, adaptTodos } from "../../../source/state/session-adapter.js"
import { assertNever } from "../../../source/utils/miscellaneous.js"

function createSession(overrides: Partial<Session> = {}): Session {
	return {
		id: "session-1",
		slug: "session-slug",
		projectID: "proj-1",
		directory: "/tmp/test",
		title: "Test Session",
		version: "1",
		time: { created: 1000, updated: 2000 },
		...overrides,
	}
}

function createSdkStatus(type: SdkSessionStatus["type"]): SdkSessionStatus {
	switch (type) {
		case "idle":
			return { type: "idle" }
		case "busy":
			return { type: "busy" }
		case "retry":
			return { type: "retry", attempt: 1, message: "retrying", next: 10 }
		default:
			assertNever(type)
	}
}

function createUserMessage(overrides: Partial<UserMessage> = {}): UserMessage {
	return {
		id: "msg-user",
		sessionID: "session-1",
		role: "user",
		time: { created: 1000 },
		agent: "test-agent",
		model: { providerID: "provider-1", modelID: "model-1" },
		...overrides,
	}
}

function createAssistantMessage(overrides: Partial<AssistantMessage> = {}): AssistantMessage {
	return {
		id: "msg-assistant",
		sessionID: "session-1",
		role: "assistant",
		time: { created: 2000, completed: 3000 },
		parentID: "parent-1",
		modelID: "model-1",
		providerID: "provider-1",
		mode: "mode",
		agent: "agent-1",
		path: { cwd: "/", root: "/" },
		cost: 0,
		tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
		...overrides,
	}
}

describe("adaptSessionMetadata", () => {
	test("maps all required fields correctly", () => {
		const session = createSession()
		const status = createSdkStatus("idle")
		const result = adaptSessionMetadata(session, status)

		expect(result.id).toBe("session-1")
		expect(result.title).toBe("Test Session")
		expect(result.directory).toBe("/tmp/test")
		expect(result.status).toBe("idle")
		expect(result.created).toBe(1000)
		expect(result.updated).toBe(2000)
		expect(result.archived).toBeUndefined()
	})

	test("includes archived timestamp when present", () => {
		const session = createSession({ time: { created: 1000, updated: 2000, archived: 4000 } })
		const status = createSdkStatus("busy")
		const result = adaptSessionMetadata(session, status)

		expect(result.archived).toBe(4000)
	})

	test("maps status correctly for all types", () => {
		expect(adaptSessionMetadata(createSession(), createSdkStatus("idle")).status).toBe("idle")
		expect(adaptSessionMetadata(createSession(), createSdkStatus("busy")).status).toBe("busy")
		expect(adaptSessionMetadata(createSession(), createSdkStatus("retry")).status).toBe("retry")
	})
})

describe("adaptError", () => {
	test("adapts ApiError with all fields", () => {
		const apiError: ApiError = {
			name: "APIError",
			data: {
				message: "API error occurred",
				isRetryable: true,
				statusCode: 500,
				responseHeaders: { "x-header": "value" },
				responseBody: "error body",
				metadata: { key: "value" },
			},
		}
		const result = adaptError(apiError)

		expect(result.name).toBe("APIError")
		expect(result.message).toBe("API error occurred")
		expect(result.isRetryable).toBe(true)
		expect(result.statusCode).toBe(500)
		expect(result.responseHeaders).toEqual({ "x-header": "value" })
		expect(result.responseBody).toBe("error body")
		expect(result.metadata).toEqual({ key: "value" })
	})

	test("adapts ApiError with missing optional fields", () => {
		const apiError: ApiError = {
			name: "APIError",
			data: {
				message: "Error",
				isRetryable: false,
			},
		}
		const result = adaptError(apiError)

		expect(result.name).toBe("APIError")
		expect(result.message).toBe("Error")
		expect(result.isRetryable).toBe(false)
		expect(result.statusCode).toBeUndefined()
		expect(result.responseHeaders).toBeUndefined()
		expect(result.responseBody).toBeUndefined()
		expect(result.metadata).toBeUndefined()
	})

	test("adapts ProviderAuthError", () => {
		const error: ProviderAuthError = {
			name: "ProviderAuthError",
			data: { providerID: "provider-1", message: "Auth failed" },
		}
		const result = adaptError(error)

		expect(result.name).toBe("ProviderAuthError")
		expect(result.message).toBe("Auth failed")
		expect(result.isRetryable).toBe(false)
	})

	test("adapts UnknownError", () => {
		const error: UnknownError = {
			name: "UnknownError",
			data: { message: "Unknown error" },
		}
		const result = adaptError(error)

		expect(result.name).toBe("UnknownError")
		expect(result.message).toBe("Unknown error")
		expect(result.isRetryable).toBe(false)
	})

	test("adapts MessageOutputLengthError with fallback message", () => {
		const error: MessageOutputLengthError = {
			name: "MessageOutputLengthError",
			data: { someOtherKey: 123 },
		}
		const result = adaptError(error)

		expect(result.name).toBe("MessageOutputLengthError")
		expect(result.message).toBe("Message output length error")
		expect(result.isRetryable).toBe(false)
	})

	test("adapts MessageOutputLengthError with string message", () => {
		const error: MessageOutputLengthError = {
			name: "MessageOutputLengthError",
			data: { message: "Output too long" },
		}
		const result = adaptError(error)

		expect(result.message).toBe("Output too long")
	})

	test("adapts MessageAbortedError", () => {
		const error: MessageAbortedError = {
			name: "MessageAbortedError",
			data: { message: "Aborted by user" },
		}
		const result = adaptError(error)

		expect(result.name).toBe("MessageAbortedError")
		expect(result.message).toBe("Aborted by user")
		expect(result.isRetryable).toBe(false)
	})

	test("adapts StructuredOutputError", () => {
		const error: StructuredOutputError = {
			name: "StructuredOutputError",
			data: { message: "Structured output error", retries: 3 },
		}
		const result = adaptError(error)

		expect(result.name).toBe("StructuredOutputError")
		expect(result.message).toBe("Structured output error")
		expect(result.isRetryable).toBe(false)
	})

	test("adapts ContextOverflowError", () => {
		const error: ContextOverflowError = {
			name: "ContextOverflowError",
			data: { message: "Context overflow", responseBody: "overflow body" },
		}
		const result = adaptError(error)

		expect(result.name).toBe("ContextOverflowError")
		expect(result.message).toBe("Context overflow")
		expect(result.isRetryable).toBe(false)
	})
})

describe("adaptPart", () => {
	test("adapts text part", () => {
		const sdkPart: TextPart = {
			id: "part-1",
			sessionID: "session-1",
			messageID: "msg-1",
			type: "text",
			text: "Hello world",
		}
		const result = adaptPart(sdkPart)

		expect(result).toEqual({ id: "part-1", type: "text", text: "Hello world" })
	})

	test("adapts reasoning part", () => {
		const sdkPart: ReasoningPart = {
			id: "part-2",
			sessionID: "session-1",
			messageID: "msg-1",
			type: "reasoning",
			text: "Thinking...",
			time: { start: 1000 },
		}
		const result = adaptPart(sdkPart)

		expect(result).toEqual({ id: "part-2", type: "reasoning", text: "Thinking..." })
	})

	test("adapts tool part with pending status", () => {
		const state: ToolStatePending = { status: "pending", input: {}, raw: "{}" }
		const sdkPart: ToolPart = {
			id: "part-tool",
			sessionID: "session-1",
			messageID: "msg-1",
			type: "tool",
			callID: "call-1",
			tool: "tool-name",
			state,
		}
		const result = adaptPart(sdkPart)

		expect(result).toEqual({ id: "part-tool", type: "tool", status: "pending" })
	})

	test("adapts tool part with running status and title", () => {
		const state: ToolStateRunning = {
			status: "running",
			input: {},
			title: "Running tool",
			time: { start: 1000 },
		}
		const sdkPart: ToolPart = {
			id: "part-tool",
			sessionID: "session-1",
			messageID: "msg-1",
			type: "tool",
			callID: "call-1",
			tool: "tool-name",
			state,
		}
		const result = adaptPart(sdkPart)

		expect(result).toEqual({ id: "part-tool", type: "tool", status: "running", title: "Running tool" })
	})

	test("adapts tool part with running status without title", () => {
		const state: ToolStateRunning = {
			status: "running",
			input: {},
			time: { start: 1000 },
		}
		const sdkPart: ToolPart = {
			id: "part-tool",
			sessionID: "session-1",
			messageID: "msg-1",
			type: "tool",
			callID: "call-1",
			tool: "tool-name",
			state,
		}
		const result = adaptPart(sdkPart)

		expect(result).toEqual({ id: "part-tool", type: "tool", status: "running" })
	})

	test("adapts tool part with completed status including output and optional fields", () => {
		const state: ToolStateCompleted = {
			status: "completed",
			input: {},
			output: "Tool output",
			title: "Completed tool",
			metadata: {},
			time: { start: 1000, end: 2000 },
		}
		const sdkPart: ToolPart = {
			id: "part-tool",
			sessionID: "session-1",
			messageID: "msg-1",
			type: "tool",
			callID: "call-1",
			tool: "tool-name",
			state,
		}
		const result = adaptPart(sdkPart)

		expect(result).toEqual({
			id: "part-tool",
			type: "tool",
			status: "completed",
			title: "Completed tool",
			output: "Tool output",
		})
	})

	test("adapts tool part with completed status and attachments", () => {
		const attachmentPart: FilePart = {
			id: "att-1",
			sessionID: "session-1",
			messageID: "msg-att",
			type: "file",
			url: "file:///test.txt",
			mime: "text/plain",
			filename: "attachment.txt",
		}
		const state: ToolStateCompleted = {
			status: "completed",
			input: {},
			output: "Output",
			title: "Tool",
			metadata: {},
			time: { start: 1000, end: 2000 },
			attachments: [attachmentPart],
		}
		const sdkPart: ToolPart = {
			id: "part-tool",
			sessionID: "session-1",
			messageID: "msg-1",
			type: "tool",
			callID: "call-1",
			tool: "tool-name",
			state,
		}
		const result = adaptPart(sdkPart)

		expect(result).toEqual({
			id: "part-tool",
			type: "tool",
			status: "completed",
			title: "Tool",
			output: "Output",
			attachments: [{ id: "att-1", type: "file", filename: "attachment.txt", url: "file:///test.txt", mime: "text/plain" }],
		})
	})

	test("adapts tool part with error status", () => {
		const state: ToolStateError = {
			status: "error",
			input: {},
			error: "Tool failed",
			time: { start: 1000, end: 2000 },
		}
		const sdkPart: ToolPart = {
			id: "part-tool",
			sessionID: "session-1",
			messageID: "msg-1",
			type: "tool",
			callID: "call-1",
			tool: "tool-name",
			state,
		}
		const result = adaptPart(sdkPart)

		expect(result).toEqual({ id: "part-tool", type: "tool", status: "error", error: "Tool failed" })
	})

	test("adapts file part with filename", () => {
		const sdkPart: FilePart = {
			id: "part-file",
			sessionID: "session-1",
			messageID: "msg-1",
			type: "file",
			url: "file:///test.txt",
			mime: "text/plain",
			filename: "test.txt",
		}
		const result = adaptPart(sdkPart)

		expect(result).toEqual({ id: "part-file", type: "file", filename: "test.txt", url: "file:///test.txt", mime: "text/plain" })
	})

	test("adapts file part without filename", () => {
		const sdkPart: FilePart = {
			id: "part-file",
			sessionID: "session-1",
			messageID: "msg-1",
			type: "file",
			url: "file:///test.txt",
			mime: "text/plain",
		}
		const result = adaptPart(sdkPart)

		expect(result).toEqual({ id: "part-file", type: "file", url: "file:///test.txt", mime: "text/plain" })
	})

	test("adapts step-start part", () => {
		const sdkPart: StepStartPart = {
			id: "part-step-start",
			sessionID: "session-1",
			messageID: "msg-1",
			type: "step-start",
		}
		const result = adaptPart(sdkPart)

		expect(result).toEqual({ id: "part-step-start", type: "step-start" })
	})

	test("adapts step-finish part", () => {
		const sdkPart: StepFinishPart = {
			id: "part-step-finish",
			sessionID: "session-1",
			messageID: "msg-1",
			type: "step-finish",
			reason: "Done",
			tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
			cost: 123,
		}
		const result = adaptPart(sdkPart)

		expect(result).toEqual({ id: "part-step-finish", type: "step-finish", reason: "Done" })
	})

	test("adapts snapshot part", () => {
		const sdkPart: SnapshotPart = {
			id: "part-snapshot",
			sessionID: "session-1",
			messageID: "msg-1",
			type: "snapshot",
			snapshot: "snapshot content",
		}
		const result = adaptPart(sdkPart)

		expect(result).toEqual({ id: "part-snapshot", type: "snapshot", snapshot: "snapshot content" })
	})

	test("adapts patch part", () => {
		const sdkPart: PatchPart = {
			id: "part-patch",
			sessionID: "session-1",
			messageID: "msg-1",
			type: "patch",
			hash: "def456",
			files: ["a.txt", "b.txt"],
		}
		const result = adaptPart(sdkPart)

		expect(result).toEqual({ id: "part-patch", type: "patch", hash: "def456", files: ["a.txt", "b.txt"] })
	})

	test("adapts agent part", () => {
		const sdkPart = {
			id: "part-agent",
			sessionID: "session-1",
			messageID: "msg-1",
			type: "agent",
			name: "agent-xyz",
		} as const
		const result = adaptPart(sdkPart)

		expect(result).toEqual({ id: "part-agent", type: "agent", name: "agent-xyz" })
	})

	test("adapts retry part", () => {
		const apiError = {
			name: "APIError",
			data: { message: "Retry due to API error", isRetryable: true },
		} as const
		const sdkPart = {
			id: "part-retry",
			sessionID: "session-1",
			messageID: "msg-1",
			type: "retry",
			attempt: 2,
			error: apiError,
			time: { created: 1000 },
		} as const
		const result = adaptPart(sdkPart)

		expect(result).toEqual({
			id: "part-retry",
			type: "retry",
			attempt: 2,
			error: {
				name: "APIError",
				message: "Retry due to API error",
				isRetryable: true,
			},
		})
	})

	test("adapts compaction part", () => {
		const sdkPart = {
			id: "part-compaction",
			sessionID: "session-1",
			messageID: "msg-1",
			type: "compaction",
			auto: false,
		} as const
		const result = adaptPart(sdkPart)

		expect(result).toEqual({ id: "part-compaction", type: "compaction", auto: false })
	})

	test("adapts subtask part", () => {
		const sdkPart = {
			id: "part-subtask",
			sessionID: "session-1",
			messageID: "msg-1",
			type: "subtask",
			prompt: "Do task",
			description: "Task desc",
			agent: "agent-1",
		} as const
		const result = adaptPart(sdkPart)

		expect(result).toEqual({ id: "part-subtask", type: "subtask", prompt: "Do task", description: "Task desc", agent: "agent-1" })
	})
})

describe("adaptMessages", () => {
	test("adapts messages and groups parts by messageID", () => {
		const messages = [
			createUserMessage({ id: "msg-1" }),
			createAssistantMessage({ id: "msg-2" }),
		]
		const parts: Part[] = [
			{
				id: "part-1",
				sessionID: "session-1",
				messageID: "msg-1",
				type: "text",
				text: "User message text",
			},
			{
				id: "part-2",
				sessionID: "session-1",
				messageID: "msg-2",
				type: "reasoning",
				text: "Assistant reasoning",
				time: { start: 1000 },
			},
			{
				id: "part-3",
				sessionID: "session-1",
				messageID: "msg-2",
				type: "text",
				text: "Assistant answer",
			},
		]

		const result = adaptMessages(messages, parts)

		expect(result).toHaveLength(2)
		const first = result[0]!
		expect(first).toEqual({
			id: "msg-1",
			role: "user",
			parts: [{ id: "part-1", type: "text", text: "User message text" }],
			created: 1000,
		})
		const second = result[1]!
		expect(second).toEqual({
			id: "msg-2",
			role: "assistant",
			parts: [
				{ id: "part-2", type: "reasoning", text: "Assistant reasoning" },
				{ id: "part-3", type: "text", text: "Assistant answer" },
			],
			created: 2000,
			completed: 3000,
		})
	})

	test("handles messages with no parts", () => {
		const messages = [createUserMessage({})]
		const parts: Part[] = []
		const result = adaptMessages(messages, parts)

		const first = result[0]!
		expect(first.parts).toEqual([])
	})

	test("handles empty arrays", () => {
		const result = adaptMessages([], [])
		expect(result).toEqual([])
	})

	test("includes error for assistant messages", () => {
		const apiError = {
			name: "APIError",
			data: { message: "Error", isRetryable: false },
		} as const
		const messages = [
			createAssistantMessage({ error: apiError }),
		]
		const parts: Part[] = []
		const result = adaptMessages(messages, parts)

		const first = result[0]!
		expect(first.error).toBeDefined()
		expect(first.error!.name).toBe("APIError")
		expect(first.error!.message).toBe("Error")
		expect(first.error!.isRetryable).toBe(false)
	})
})

describe("adaptTodos", () => {
	test("adapts valid todos", () => {
		const sdkTodos = [
			{ content: "Task 1", status: "pending", priority: "high", id: "1" },
			{ content: "Task 2", status: "in_progress", priority: "medium", id: "2" },
			{ content: "Task 3", status: "completed", priority: "low", id: "3" },
			{ content: "Task 4", status: "cancelled", priority: "medium", id: "4" },
		]
		const result = adaptTodos(sdkTodos)

		const first = result[0]!
		expect(first.status).toBe("pending")
		expect(first.priority).toBe("high")
		const second = result[1]!
		expect(second.status).toBe("in_progress")
		const third = result[2]!
		expect(third.status).toBe("completed")
		const fourth = result[3]!
		expect(fourth.status).toBe("cancelled")
	})

	test("defaults invalid status to 'pending'", () => {
		const sdkTodos = [{ content: "Bad", status: "invalid", priority: "high", id: "1" }]
		const result = adaptTodos(sdkTodos)

		const first = result[0]!
		expect(first.status).toBe("pending")
	})

	test("defaults invalid priority to 'medium'", () => {
		const sdkTodos = [{ content: "Bad", status: "pending", priority: "invalid", id: "1" }]
		const result = adaptTodos(sdkTodos)

		const first = result[0]!
		expect(first.priority).toBe("medium")
	})

	test("handles empty array", () => {
		const result = adaptTodos([])
		expect(result).toEqual([])
	})
})

describe("adaptFileDiffs", () => {
	test("adapts file diffs with all fields including status", () => {
		const sdkDiffs: FileDiff[] = [
			{
				file: "a.txt",
				before: "old",
				after: "new",
				additions: 1,
				deletions: 1,
				status: "modified",
			},
		]
		const result = adaptFileDiffs(sdkDiffs)

		const first = result[0]!
		expect(first.file).toBe("a.txt")
		expect(first.status).toBe("modified")
		expect(first.additions).toBe(1)
		expect(first.deletions).toBe(1)
	})

	test("defaults missing status to 'modified'", () => {
		// Simulate SDK diff without status field (using plain object)
		const sdkDiffs = [
			{ file: "b.txt", before: "", after: "new", additions: 1, deletions: 0 },
		]
		const result = adaptFileDiffs(sdkDiffs)

		const first = result[0]!
		expect(first.status).toBe("modified")
	})

	test("handles added file", () => {
		const sdkDiffs: FileDiff[] = [{ file: "new.txt", before: "", after: "content", additions: 1, deletions: 0, status: "added" }]
		const result = adaptFileDiffs(sdkDiffs)

		const first = result[0]!
		expect(first.status).toBe("added")
	})

	test("handles deleted file", () => {
		const sdkDiffs: FileDiff[] = [{ file: "old.txt", before: "content", after: "", additions: 0, deletions: 1, status: "deleted" }]
		const result = adaptFileDiffs(sdkDiffs)

		const first = result[0]!
		expect(first.status).toBe("deleted")
	})

	test("handles empty array", () => {
		const result = adaptFileDiffs([])
		expect(result).toEqual([])
	})
})
