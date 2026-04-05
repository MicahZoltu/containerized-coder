import type { AssistantMessage, FileDiff, OpencodeClient, Part, SessionStatus as SdkSessionStatus, Session, TextPart, Todo, UserMessage } from "@opencode-ai/sdk/v2"
import { mock, mockFn } from '@tkoehlerlg/bun-mock-extended'
import { describe, expect, test } from "bun:test"
import { fetchFullSession, fetchMessage, fetchStatusAndMessages } from "../../../source/state/sdk-session-data-fetcher.js"

function createMockSession(overrides: Partial<Session> = {}): Session {
	return {
		id: "test-session",
		slug: "test-slug",
		projectID: "proj-1",
		directory: "/tmp/test",
		title: "Test Session",
		version: "1",
		time: { created: 1000, updated: 2000 },
		...overrides,
	}
}

function createMockStatus(type: SdkSessionStatus["type"]): SdkSessionStatus {
	switch (type) {
		case "idle":
			return { type: "idle" }
		case "busy":
			return { type: "busy" }
		case "retry":
			return { type: "retry", attempt: 1, message: "retrying", next: 10 }
	}
}

function createMockUserMessage(overrides: Partial<UserMessage> = {}): UserMessage {
	return {
		id: "msg-1",
		sessionID: "test-session",
		role: "user",
		time: { created: 1000 },
		agent: "test-agent",
		model: { providerID: "provider-1", modelID: "model-1" },
		...overrides,
	}
}

function createMockAssistantMessage(overrides: Partial<AssistantMessage> = {}): AssistantMessage {
	return {
		id: "msg-2",
		sessionID: "test-session",
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

function createMockPart(overrides: Partial<TextPart> = {}): Part {
	return {
		id: "part-1",
		sessionID: "test-session",
		messageID: "msg-1",
		type: "text",
		text: "Hello",
		...overrides,
	}
}

function createMockTodo(overrides: Partial<Todo> = {}): Todo {
	return mock<Todo>({ content: "Test todo", status: "pending", priority: "high", ...overrides })
}

function createMockFileDiff(overrides: Partial<FileDiff> = {}): FileDiff {
	return mock<FileDiff>({ file: "test.txt", before: "old", after: "new", additions: 1, deletions: 1, status: "modified", ...overrides })
}

function createMockClient(): OpencodeClient {
	const mockClient = mock<OpencodeClient>()
	const mockSession = {
		get: mockFn<OpencodeClient['session']['get']>().mockResolvedValue(mock<Awaited<ReturnType<OpencodeClient['session']['get']>>>({ data: undefined })),
		messages: mockFn<OpencodeClient['session']['messages']>().mockResolvedValue(mock<Awaited<ReturnType<OpencodeClient['session']['messages']>>>({ data: [] })),
		message: mockFn<OpencodeClient['session']['message']>().mockResolvedValue(mock<Awaited<ReturnType<OpencodeClient['session']['message']>>>({ data: undefined })),
		todo: mockFn<OpencodeClient['session']['todo']>().mockResolvedValue(mock<Awaited<ReturnType<OpencodeClient['session']['todo']>>>({ data: [] })),
		diff: mockFn<OpencodeClient['session']['diff']>().mockResolvedValue(mock<Awaited<ReturnType<OpencodeClient['session']['diff']>>>({ data: [] })),
		status: mockFn<OpencodeClient['session']['status']>().mockResolvedValue(mock<Awaited<ReturnType<OpencodeClient['session']['status']>>>({ data: {} })),
	}
	;(mockClient as unknown as { session: OpencodeClient['session'] }).session = mockSession as unknown as OpencodeClient['session']
	return mockClient
}

describe("SdkSessionDataFetcher", () => {
	describe("fetchFullSession", () => {
		test("calls the correct 5 SDK methods with the right sessionID", async () => {
			const mockClient = createMockClient()
			mockClient.session.get = mockFn<OpencodeClient['session']['get']>().mockResolvedValue(mock<Awaited<ReturnType<OpencodeClient['session']['get']>>>({ data: createMockSession() }))
			mockClient.session.status = mockFn<OpencodeClient['session']['status']>().mockResolvedValue(mock<Awaited<ReturnType<OpencodeClient['session']['status']>>>({ data: { "test-session": createMockStatus("idle") } }))

			await fetchFullSession(mockClient, "test-session")

			expect(mockClient.session.get).toHaveBeenCalledWith({ sessionID: "test-session" })
			expect(mockClient.session.messages).toHaveBeenCalledWith({ sessionID: "test-session" })
			expect(mockClient.session.todo).toHaveBeenCalledWith({ sessionID: "test-session" })
			expect(mockClient.session.diff).toHaveBeenCalledWith({ sessionID: "test-session" })
			expect(mockClient.session.status).toHaveBeenCalledWith({})
		})

		test("correctly unwraps the response shapes (.data, .info, .parts)", async () => {
			const mockClient = createMockClient()
			const session = createMockSession()
			const message = createMockUserMessage()
			const part = createMockPart()
			const todo = createMockTodo()
			const diff = createMockFileDiff()
			const status = createMockStatus("idle")

			mockClient.session.get = mockFn<OpencodeClient['session']['get']>().mockResolvedValue(mock<Awaited<ReturnType<OpencodeClient['session']['get']>>>({ data: session }))
			mockClient.session.messages = mockFn<OpencodeClient['session']['messages']>().mockResolvedValue(mock<Awaited<ReturnType<OpencodeClient['session']['messages']>>>({ data: [{ info: message, parts: [part] }] }))
			mockClient.session.todo = mockFn<OpencodeClient['session']['todo']>().mockResolvedValue(mock<Awaited<ReturnType<OpencodeClient['session']['todo']>>>({ data: [todo] }))
			mockClient.session.diff = mockFn<OpencodeClient['session']['diff']>().mockResolvedValue(mock<Awaited<ReturnType<OpencodeClient['session']['diff']>>>({ data: [diff] }))
			mockClient.session.status = mockFn<OpencodeClient['session']['status']>().mockResolvedValue(mock<Awaited<ReturnType<OpencodeClient['session']['status']>>>({ data: { "test-session": status } }))

			const result = await fetchFullSession(mockClient, "test-session")

			expect(result.session).toEqual(session)
			expect(result.status).toEqual(status)
			expect(result.messages).toEqual([message])
			expect(result.parts).toEqual([part])
			expect(result.todos).toEqual([todo])
			expect(result.diffs).toEqual([diff])
		})

		test("throws when session is missing", async () => {
			const mockClient = createMockClient()
			mockClient.session.get = mockFn<OpencodeClient['session']['get']>().mockResolvedValue(mock<Awaited<ReturnType<OpencodeClient['session']['get']>>>({ data: undefined }))
			mockClient.session.messages = mockFn<OpencodeClient['session']['messages']>().mockResolvedValue(mock<Awaited<ReturnType<OpencodeClient['session']['messages']>>>({ data: [] }))
			mockClient.session.todo = mockFn<OpencodeClient['session']['todo']>().mockResolvedValue(mock<Awaited<ReturnType<OpencodeClient['session']['todo']>>>({ data: [] }))
			mockClient.session.diff = mockFn<OpencodeClient['session']['diff']>().mockResolvedValue(mock<Awaited<ReturnType<OpencodeClient['session']['diff']>>>({ data: [] }))
			mockClient.session.status = mockFn<OpencodeClient['session']['status']>().mockResolvedValue(mock<Awaited<ReturnType<OpencodeClient['session']['status']>>>({ data: {} }))

			await expect(fetchFullSession(mockClient, "test-session")).rejects.toThrow("Session test-session not found")
		})

		test("throws when status is missing", async () => {
			const mockClient = mock<OpencodeClient>()
			const mockSession = {
				get: mockFn<OpencodeClient['session']['get']>().mockResolvedValue({ data: createMockSession() } as Awaited<ReturnType<OpencodeClient['session']['get']>>),
				messages: mockFn<OpencodeClient['session']['messages']>().mockResolvedValue({ data: [] } as unknown as Awaited<ReturnType<OpencodeClient['session']['messages']>>),
				todo: mockFn<OpencodeClient['session']['todo']>().mockResolvedValue({ data: [] } as unknown as Awaited<ReturnType<OpencodeClient['session']['todo']>>),
				diff: mockFn<OpencodeClient['session']['diff']>().mockResolvedValue({ data: [] } as unknown as Awaited<ReturnType<OpencodeClient['session']['diff']>>),
				status: mockFn<OpencodeClient['session']['status']>().mockResolvedValue({ data: {} } as Awaited<ReturnType<OpencodeClient['session']['status']>>),
			}
			;(mockClient as unknown as { session: OpencodeClient['session'] }).session = mockSession as unknown as OpencodeClient['session']

			await expect(fetchFullSession(mockClient, "test-session")).rejects.toThrow("Session test-session not found")
		})

		test("handles empty arrays for messages, todos, and diffs", async () => {
			const mockClient = createMockClient()
			mockClient.session.get = mockFn<OpencodeClient['session']['get']>().mockResolvedValue(mock<Awaited<ReturnType<OpencodeClient['session']['get']>>>({ data: createMockSession() }))
			mockClient.session.messages = mockFn<OpencodeClient['session']['messages']>().mockResolvedValue(mock<Awaited<ReturnType<OpencodeClient['session']['messages']>>>({ data: undefined }))
			mockClient.session.todo = mockFn<OpencodeClient['session']['todo']>().mockResolvedValue(mock<Awaited<ReturnType<OpencodeClient['session']['todo']>>>({ data: undefined }))
			mockClient.session.diff = mockFn<OpencodeClient['session']['diff']>().mockResolvedValue(mock<Awaited<ReturnType<OpencodeClient['session']['diff']>>>({ data: undefined }))
			mockClient.session.status = mockFn<OpencodeClient['session']['status']>().mockResolvedValue(mock<Awaited<ReturnType<OpencodeClient['session']['status']>>>({ data: { "test-session": createMockStatus("idle") } }))

			const result = await fetchFullSession(mockClient, "test-session")

			expect(result.messages).toEqual([])
			expect(result.parts).toEqual([])
			expect(result.todos).toEqual([])
			expect(result.diffs).toEqual([])
		})
	})

	describe("fetchMessage", () => {
		test("returns null when response has no info field", async () => {
			const mockClient = createMockClient()
			mockClient.session.message = mockFn<OpencodeClient['session']['message']>().mockResolvedValue(mock<Awaited<ReturnType<OpencodeClient['session']['message']>>>({ data: undefined }))

			const result = await fetchMessage(mockClient, "test-session", "msg-1")

			expect(result).toBeNull()
		})

		test("returns null when response data has no info property", async () => {
			const mockClient = createMockClient()
			mockClient.session.message = mockFn<OpencodeClient['session']['message']>().mockResolvedValue(mock<Awaited<ReturnType<OpencodeClient['session']['message']>>>({ data: {} }))

			const result = await fetchMessage(mockClient, "test-session", "msg-1")

			expect(result).toBeNull()
		})

		test("returns message with parts when info field exists", async () => {
			const mockClient = createMockClient()
			const message = createMockUserMessage()
			const part1 = createMockPart({ id: "part-1" })
			const part2 = createMockPart({ id: "part-2" })

			mockClient.session.message = mockFn<OpencodeClient['session']['message']>().mockResolvedValue(mock<Awaited<ReturnType<OpencodeClient['session']['message']>>>({ data: { info: message, parts: [part1, part2] } }))

			const result = await fetchMessage(mockClient, "test-session", "msg-1")

			expect(result).toEqual({
				message: message,
				parts: [part1, part2],
			})
		})

		test("calls SDK with correct sessionID and messageID", async () => {
			const mockClient = createMockClient()

			await fetchMessage(mockClient, "test-session", "msg-123")

			expect(mockClient.session.message).toHaveBeenCalledWith({ sessionID: "test-session", messageID: "msg-123" })
		})

		test("defaults parts to empty array when parts field is missing", async () => {
			const mockClient = createMockClient()
			const message = createMockUserMessage()

			mockClient.session.message = mockFn<OpencodeClient['session']['message']>().mockResolvedValue(mock<Awaited<ReturnType<OpencodeClient['session']['message']>>>({ data: { info: message, parts: [] } }))

			const result = await fetchMessage(mockClient, "test-session", "msg-1")

			expect(result).toEqual({
				message: message,
				parts: [],
			})
		})
	})

	describe("fetchStatusAndMessages", () => {
		test("returns the unwrapped status and messages", async () => {
			const mockClient = createMockClient()
			const status = createMockStatus("busy")
			const message1 = createMockUserMessage({ id: "msg-1" })
			const message2 = createMockAssistantMessage({ id: "msg-2" })
			const part1 = createMockPart({ id: "part-1" })

			mockClient.session.status = mockFn<OpencodeClient['session']['status']>().mockResolvedValue(mock<Awaited<ReturnType<OpencodeClient['session']['status']>>>({ data: { "test-session": status } }))
			mockClient.session.messages = mockFn<OpencodeClient['session']['messages']>().mockResolvedValue(mock<Awaited<ReturnType<OpencodeClient['session']['messages']>>>({ data: [{ info: message1, parts: [part1] }, { info: message2, parts: [] }] }))

			const result = await fetchStatusAndMessages(mockClient, "test-session")

			expect(result.status).toEqual(status)
			expect(result.messages).toEqual([
				{ info: message1, parts: [part1] },
				{ info: message2, parts: [] },
			])
		})

		test("calls SDK methods with correct arguments", async () => {
			const mockClient = createMockClient()

			await fetchStatusAndMessages(mockClient, "test-session")

			expect(mockClient.session.status).toHaveBeenCalledWith({})
			expect(mockClient.session.messages).toHaveBeenCalledWith({ sessionID: "test-session" })
		})

		test("handles undefined status when session not in status data", async () => {
			const mockClient = mock<OpencodeClient>()
			const mockSession = {
				status: mockFn<OpencodeClient['session']['status']>().mockResolvedValue({ data: { "other-session": createMockStatus("idle") } } as unknown as Awaited<ReturnType<OpencodeClient['session']['status']>>),
				messages: mockFn<OpencodeClient['session']['messages']>().mockResolvedValue({ data: [] } as unknown as Awaited<ReturnType<OpencodeClient['session']['messages']>>),
			}
			;(mockClient as unknown as { session: OpencodeClient['session'] }).session = mockSession as unknown as OpencodeClient['session']

			const result = await fetchStatusAndMessages(mockClient, "test-session")

			expect(result.status).toBeUndefined()
			expect(result.messages).toEqual([])
		})

		test("handles null messages response", async () => {
			const mockClient = createMockClient()
			mockClient.session.status = mockFn<OpencodeClient['session']['status']>().mockResolvedValue(mock<Awaited<ReturnType<OpencodeClient['session']['status']>>>({ data: { "test-session": createMockStatus("idle") } }))
			mockClient.session.messages = mockFn<OpencodeClient['session']['messages']>().mockResolvedValue(mock<Awaited<ReturnType<OpencodeClient['session']['messages']>>>({ data: undefined }))

			const result = await fetchStatusAndMessages(mockClient, "test-session")

			expect(result.status).toEqual({ type: "idle" })
			expect(result.messages).toEqual([])
		})

		test("handles messages without parts field", async () => {
			const mockClient = createMockClient()
			const message = createMockUserMessage()

			mockClient.session.status = mockFn<OpencodeClient['session']['status']>().mockResolvedValue(mock<Awaited<ReturnType<OpencodeClient['session']['status']>>>({ data: { "test-session": createMockStatus("idle") } }))
			mockClient.session.messages = mockFn<OpencodeClient['session']['messages']>().mockResolvedValue(mock<Awaited<ReturnType<OpencodeClient['session']['messages']>>>({ data: [{ info: message, parts: [] }] }))

			const result = await fetchStatusAndMessages(mockClient, "test-session")

			expect(result.messages).toEqual([{ info: message, parts: [] }])
		})
	})
})
