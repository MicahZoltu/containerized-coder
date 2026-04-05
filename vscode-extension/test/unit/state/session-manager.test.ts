import { mock, mockFn } from '@tkoehlerlg/bun-mock-extended'
import { describe, expect, test } from "bun:test"
import type { Session, Message, Todo, FileDiff, Event as SdkEvent, TextPart, SessionStatus as SdkSessionStatus } from "@opencode-ai/sdk/v2"
import type { FullSessionData, MessageWithParts, StatusAndMessages } from "../../../source/state/sdk-session-data-fetcher.js"
import { createSessionStateManager } from "../../../source/state/session-manager.js"
import type { UIState } from "../../../source/state/types.js"

type Disposable = { dispose(): void }
type TimerFactory = (callback: () => void, intervalMs: number) => Disposable

function createMockSessionData(overrides: Partial<FullSessionData> = {}): FullSessionData {
	const baseSession = mock<Session>()
	return {
		session: {
			...baseSession,
			id: "test-session",
			title: "Test Session",
			directory: "/tmp/test",
			time: { created: 1000, updated: 2000 },
			...overrides.session,
		},
		status: { type: "idle" },
		messages: [],
		parts: [],
		todos: [],
		diffs: [],
		...overrides,
	}
}

function createMockFetchers(data: Partial<FullSessionData> = {}) {
	const mockData = createMockSessionData(data)

	const fetchFullSession = mockFn<(sessionID: string) => Promise<FullSessionData>>()
	const fetchMessage = mockFn<(sessionID: string, messageID: string) => Promise<MessageWithParts | null>>()
	const fetchStatusAndMessages = mockFn<(sessionID: string) => Promise<StatusAndMessages>>()

	fetchFullSession.mockResolvedValue(mockData)
	fetchMessage.mockResolvedValue(null)
	fetchStatusAndMessages.mockResolvedValue({ status: mockData.status, messages: [] } as StatusAndMessages)

	return { fetchFullSession, fetchMessage, fetchStatusAndMessages }
}

function createMockTimerFactory() {
	const timers: Array<{ callback: () => void; intervalMs: number; disposed: boolean }> = []
	const factory: TimerFactory = (callback, intervalMs) => {
		const timer = { callback, intervalMs, disposed: false }
		timers.push(timer)
		return { dispose: () => { timer.disposed = true } }
	}
	return { factory, timers }
}

describe("SessionStateManager", () => {
	describe("Initialization", () => {
		test("initializeSession calls fetcher.fetchFullSession and populates state", async () => {
			const mockTimers = createMockTimerFactory()
			const mockData = createMockSessionData({
				session: mock<Session>({ id: "test-session", title: "Test", directory: "/tmp" }),
				status: { type: "idle" },
				messages: [],
				parts: [],
				todos: [],
				diffs: [],
			})
			const { fetchFullSession, fetchMessage, fetchStatusAndMessages } = createMockFetchers(mockData)
			const manager = await createSessionStateManager(fetchFullSession, fetchMessage, fetchStatusAndMessages, mockTimers.factory)

			await manager.initializeSession("test-session")

			const state = manager.getState("test-session")
			expect(state).toBeDefined()
			expect(state?.session.id).toBe("test-session")
			expect(state?.session.title).toBe("Test")
		})

		test("initializeSession starts periodic sync (verify timer was created)", async () => {
			const mockTimers = createMockTimerFactory()
			const { fetchFullSession, fetchMessage, fetchStatusAndMessages } = createMockFetchers()
			const manager = await createSessionStateManager(fetchFullSession, fetchMessage, fetchStatusAndMessages, mockTimers.factory)

			await manager.initializeSession("test-session")

			expect(mockTimers.timers).toHaveLength(1)
			expect(mockTimers.timers[0]?.disposed).toBe(false)
		})

		test("initializeSession when fetch fails sets syncing to false and rethrows", async () => {
			const mockTimers = createMockTimerFactory()
			const error = new Error("Fetch failed")
			
			const fetchFullSession = mockFn<(sessionID: string) => Promise<FullSessionData>>().mockRejectedValue(error)
			const fetchMessage = mockFn<(sessionID: string, messageID: string) => Promise<MessageWithParts | null>>()
			const fetchStatusAndMessages = mockFn<(sessionID: string) => Promise<StatusAndMessages>>()

			const manager = await createSessionStateManager(fetchFullSession, fetchMessage, fetchStatusAndMessages, mockTimers.factory)

			await expect(manager.initializeSession("test-session")).rejects.toThrow("Fetch failed")

			const state = manager.getState("test-session")
			expect(state?.isSyncing).toBe(false)
		})
	})

	describe("Event handling", () => {
		test("part-updated event updates state", async () => {
			const mockTimers = createMockTimerFactory()
			const { fetchFullSession, fetchMessage, fetchStatusAndMessages } = createMockFetchers()
			const mockMessage = mock<Message>()
			mockMessage.id = "msg-1"
			mockMessage.role = "assistant"
			mockMessage.sessionID = "test-session"

			const mockPart = mock<TextPart>()
			mockPart.id = "part-1"
			mockPart.type = "text"
			mockPart.text = "Hello"
			mockPart.sessionID = "test-session"
			mockPart.messageID = "msg-1"

			fetchMessage.mockResolvedValue({ message: mockMessage, parts: [mockPart] })

			const manager = await createSessionStateManager(fetchFullSession, fetchMessage, fetchStatusAndMessages, mockTimers.factory)
			await manager.initializeSession("test-session")

			// Add a message to the state for part tests
			const messageEvent: SdkEvent = {
				type: "message.updated",
				properties: { info: mockMessage },
			}
			manager.handleEvent(messageEvent)
			await new Promise(resolve => setTimeout(resolve, 10))

			const mockPartUpdated = mock<TextPart>()
			mockPartUpdated.id = "part-1"
			mockPartUpdated.type = "text"
			mockPartUpdated.text = "Hello"
			mockPartUpdated.sessionID = "test-session"
			mockPartUpdated.messageID = "msg-1"

			const partEvent: SdkEvent = {
				type: "message.part.updated",
				properties: { part: mockPartUpdated },
			}

			manager.handleEvent(partEvent)

			const state = manager.getState("test-session")
			expect(state?.messages).toHaveLength(1)
			const firstMessage = state?.messages[0]
			expect(firstMessage?.parts).toHaveLength(1)
			expect(firstMessage?.parts[0]?.id).toBe("part-1")
		})

		test("part-delta event appends to text part", async () => {
			const mockTimers = createMockTimerFactory()
			const { fetchFullSession, fetchMessage, fetchStatusAndMessages } = createMockFetchers()
			const mockMessage = mock<Message>()
			mockMessage.id = "msg-1"
			mockMessage.role = "assistant"
			mockMessage.sessionID = "test-session"

			const mockPart = mock<TextPart>()
			mockPart.id = "part-1"
			mockPart.type = "text"
			mockPart.text = "Hello"
			mockPart.sessionID = "test-session"
			mockPart.messageID = "msg-1"

			fetchMessage.mockResolvedValue({ message: mockMessage, parts: [mockPart] })

			const manager = await createSessionStateManager(fetchFullSession, fetchMessage, fetchStatusAndMessages, mockTimers.factory)
			await manager.initializeSession("test-session")

			// Add a message to the state for part tests
			const messageEvent: SdkEvent = {
				type: "message.updated",
				properties: { info: mockMessage },
			}
			manager.handleEvent(messageEvent)
			await new Promise(resolve => setTimeout(resolve, 10))

			const textPart = mock<TextPart>()
			textPart.id = "part-1"
			textPart.type = "text"
			textPart.text = "Hello"
			textPart.sessionID = "test-session"
			textPart.messageID = "msg-1"

			const partEvent: SdkEvent = {
				type: "message.part.updated",
				properties: { part: textPart },
			}

			manager.handleEvent(partEvent)

			const deltaEvent: SdkEvent = {
				type: "message.part.delta",
				properties: {
					sessionID: "test-session",
					messageID: "msg-1",
					partID: "part-1",
					field: "text",
					delta: " World",
				},
			}

			manager.handleEvent(deltaEvent)

			const state = manager.getState("test-session")
			const part = state?.messages[0]?.parts[0]
			if (part?.type === "text") {
				expect(part.text).toBe("Hello World")
			} else {
				expect(part).toBeDefined()
			}
		})

		test("part-removed event removes the part", async () => {
			const mockTimers = createMockTimerFactory()
			const { fetchFullSession, fetchMessage, fetchStatusAndMessages } = createMockFetchers()
			const mockMessage = mock<Message>()
			mockMessage.id = "msg-1"
			mockMessage.role = "assistant"
			mockMessage.sessionID = "test-session"

			const mockPart = mock<TextPart>()
			mockPart.id = "part-1"
			mockPart.type = "text"
			mockPart.text = "Hello"
			mockPart.sessionID = "test-session"
			mockPart.messageID = "msg-1"

			fetchMessage.mockResolvedValue({ message: mockMessage, parts: [mockPart] })

			const manager = await createSessionStateManager(fetchFullSession, fetchMessage, fetchStatusAndMessages, mockTimers.factory)
			await manager.initializeSession("test-session")

			// Add a message to the state for part tests
			const messageEvent: SdkEvent = {
				type: "message.updated",
				properties: { info: mockMessage },
			}
			manager.handleEvent(messageEvent)
			await new Promise(resolve => setTimeout(resolve, 10))

			const part1 = mock<TextPart>()
			part1.id = "part-1"
			part1.type = "text"
			part1.text = "Hello"
			part1.sessionID = "test-session"
			part1.messageID = "msg-1"

			const part2 = mock<TextPart>()
			part2.id = "part-2"
			part2.type = "text"
			part2.text = "World"
			part2.sessionID = "test-session"
			part2.messageID = "msg-1"

			const partEvent1: SdkEvent = { type: "message.part.updated", properties: { part: part1 } }
			const partEvent2: SdkEvent = { type: "message.part.updated", properties: { part: part2 } }

			manager.handleEvent(partEvent1)
			manager.handleEvent(partEvent2)

			const removeEvent: SdkEvent = {
				type: "message.part.removed",
				properties: { sessionID: "test-session", messageID: "msg-1", partID: "part-2" },
			}

			manager.handleEvent(removeEvent)

			const state = manager.getState("test-session")
			const firstMessage = state?.messages[0]
			expect(firstMessage?.parts).toHaveLength(1)
			expect(firstMessage?.parts[0]?.id).toBe("part-1")
		})

		test("status-updated event updates session status", async () => {
			const mockTimers = createMockTimerFactory()
			const { fetchFullSession, fetchMessage, fetchStatusAndMessages } = createMockFetchers()
			const manager = await createSessionStateManager(fetchFullSession, fetchMessage, fetchStatusAndMessages, mockTimers.factory)
			await manager.initializeSession("test-session")

			const event: SdkEvent = {
				type: "session.status",
				properties: { sessionID: "test-session", status: { type: "busy" } },
			}

			manager.handleEvent(event)

			const state = manager.getState("test-session")
			expect(state?.session.status).toBe("busy")
		})

		test("todos-updated event updates todos", async () => {
			const mockTimers = createMockTimerFactory()
			const { fetchFullSession, fetchMessage, fetchStatusAndMessages } = createMockFetchers()
			const manager = await createSessionStateManager(fetchFullSession, fetchMessage, fetchStatusAndMessages, mockTimers.factory)
			await manager.initializeSession("test-session")

			const todos: Todo[] = [
				mock<Todo>({ content: "Task 1", status: "pending", priority: "high" }),
				mock<Todo>({ content: "Task 2", status: "in_progress", priority: "medium" }),
			]

			const event: SdkEvent = {
				type: "todo.updated",
				properties: { sessionID: "test-session", todos },
			}

			manager.handleEvent(event)

			const state = manager.getState("test-session")
			expect(state?.todos).toHaveLength(2)
			expect(state?.todos[0]?.content).toBe("Task 1")
		})

		test("diffs-updated event updates file diffs", async () => {
			const mockTimers = createMockTimerFactory()
			const { fetchFullSession, fetchMessage, fetchStatusAndMessages } = createMockFetchers()
			const manager = await createSessionStateManager(fetchFullSession, fetchMessage, fetchStatusAndMessages, mockTimers.factory)
			await manager.initializeSession("test-session")

			const diffs: FileDiff[] = [ mock<FileDiff>({ file: "test.txt", before: "old", after: "new", additions: 1, deletions: 1, status: "modified" }) ]

			const event: SdkEvent = { type: "session.diff", properties: { sessionID: "test-session", diff: diffs } }

			manager.handleEvent(event)

			const state = manager.getState("test-session")
			expect(state?.fileDiffs).toHaveLength(1)
			expect(state?.fileDiffs[0]?.file).toBe("test.txt")
		})

		test("session-deleted event disposes the session", async () => {
			const mockTimers = createMockTimerFactory()
			const { fetchFullSession, fetchMessage, fetchStatusAndMessages } = createMockFetchers()
			const manager = await createSessionStateManager(fetchFullSession, fetchMessage, fetchStatusAndMessages, mockTimers.factory)
			await manager.initializeSession("test-session")

			const event: SdkEvent = {
				type: "session.deleted",
				properties: { info: mock<Session>({ id: "test-session" }) },
			}

			manager.handleEvent(event)

			const state = manager.getState("test-session")
			expect(state).toBeUndefined()
		})

		test("session-compacted event triggers full refresh", async () => {
			const mockTimers = createMockTimerFactory()
			const mockData = createMockSessionData({
				session: mock<Session>({ id: "test-session", title: "Updated Title", directory: "/tmp" }),
				status: { type: "idle" },
				messages: [],
				parts: [],
				todos: [],
				diffs: [],
			})

			const { fetchFullSession, fetchMessage, fetchStatusAndMessages } = createMockFetchers(mockData)
			const manager = await createSessionStateManager(fetchFullSession, fetchMessage, fetchStatusAndMessages, mockTimers.factory)

			await manager.initializeSession("test-session")

			const compactEvent: SdkEvent = { type: "session.compacted", properties: { sessionID: "test-session" } }

			manager.handleEvent(compactEvent)

			await new Promise(resolve => setTimeout(resolve, 10))

			const state = manager.getState("test-session")
			expect(state?.session.title).toBe("Updated Title")
		})

		test("message-updated event calls fetcher.fetchMessage and updates state", async () => {
			const mockTimers = createMockTimerFactory()
			const mockMessage = mock<Message>()
			mockMessage.id = "msg-1"
			mockMessage.role = "user"
			mockMessage.sessionID = "test-session"

			const mockPart = mock<TextPart>()
			mockPart.id = "part-1"
			mockPart.type = "text"
			mockPart.text = "Hello"
			mockPart.sessionID = "test-session"
			mockPart.messageID = "msg-1"

			const { fetchFullSession, fetchMessage, fetchStatusAndMessages } = createMockFetchers()
			fetchMessage.mockResolvedValue({ message: mockMessage, parts: [mockPart] })

			const manager = await createSessionStateManager(fetchFullSession, fetchMessage, fetchStatusAndMessages, mockTimers.factory)

			await manager.initializeSession("test-session")

			const event: SdkEvent = { type: "message.updated", properties: { info: mockMessage } }

			manager.handleEvent(event)

			await new Promise(resolve => setTimeout(resolve, 10))

			const state = manager.getState("test-session")
			expect(state?.messages).toHaveLength(1)
			const firstMessage = state?.messages[0]
			expect(firstMessage?.id).toBe("msg-1")
			expect(firstMessage?.parts).toHaveLength(1)
		})

		test("Unknown events are ignored (no error, no state change)", async () => {
			const mockTimers = createMockTimerFactory()
			const { fetchFullSession, fetchMessage, fetchStatusAndMessages } = createMockFetchers()
			const manager = await createSessionStateManager(fetchFullSession, fetchMessage, fetchStatusAndMessages, mockTimers.factory)
			await manager.initializeSession("test-session")

			const initialState = manager.getState("test-session")

			const unknownEvent = {
				type: "unknown.event",
				properties: {},
			}

			// cast here is because we are explicitly testing the fallthrough case that shouldn't be reachable if the SDK correctly types everything (it may not)
			expect(() => manager.handleEvent(unknownEvent as SdkEvent)).not.toThrow()
			expect(manager.getState("test-session")).toBe(initialState)
		})
	})

	describe("Subscriber lifecycle", () => {
		test("subscribe immediately calls the callback with current state", async () => {
			const mockTimers = createMockTimerFactory()
			const { fetchFullSession, fetchMessage, fetchStatusAndMessages } = createMockFetchers()
			const manager = await createSessionStateManager(fetchFullSession, fetchMessage, fetchStatusAndMessages, mockTimers.factory)
			await manager.initializeSession("test-session")

			const callback = mockFn<(state: UIState) => void>()
			const unsubscribe = manager.subscribe("test-session", callback)

			expect(callback).toHaveBeenCalled()
			const state = callback.mock.calls[0]?.[0] as UIState
			expect(state?.session.id).toBe("test-session")

			unsubscribe()
		})

		test("State updates notify all subscribers", async () => {
			const mockTimers = createMockTimerFactory()
			const { fetchFullSession, fetchMessage, fetchStatusAndMessages } = createMockFetchers()
			const manager = await createSessionStateManager(fetchFullSession, fetchMessage, fetchStatusAndMessages, mockTimers.factory)
			await manager.initializeSession("test-session")

			const callback1 = mockFn<(state: UIState) => void>()
			const callback2 = mockFn<(state: UIState) => void>()

			manager.subscribe("test-session", callback1)
			manager.subscribe("test-session", callback2)

			const event: SdkEvent = {
				type: "session.status",
				properties: { sessionID: "test-session", status: { type: "busy" } },
			}

			manager.handleEvent(event)

			expect(callback1).toHaveBeenCalledTimes(2)
			expect(callback2).toHaveBeenCalledTimes(2)
		})

		test("Unsubscribe removes the callback", async () => {
			const mockTimers = createMockTimerFactory()
			const { fetchFullSession, fetchMessage, fetchStatusAndMessages } = createMockFetchers()
			const manager = await createSessionStateManager(fetchFullSession, fetchMessage, fetchStatusAndMessages, mockTimers.factory)
			await manager.initializeSession("test-session")

			const callback = mockFn<(state: UIState) => void>()
			const unsubscribe = manager.subscribe("test-session", callback)

			unsubscribe()

			const event: SdkEvent = {
				type: "session.status",
				properties: { sessionID: "test-session", status: { type: "busy" } },
			}

			manager.handleEvent(event)

			expect(callback).toHaveBeenCalledTimes(1)
		})

		test("Last subscriber unsubscribing disposes the session (clears timer, removes from store)", async () => {
			const mockTimers = createMockTimerFactory()
			const { fetchFullSession, fetchMessage, fetchStatusAndMessages } = createMockFetchers()
			const manager = await createSessionStateManager(fetchFullSession, fetchMessage, fetchStatusAndMessages, mockTimers.factory)
			await manager.initializeSession("test-session")

			const callback = mockFn<(state: UIState) => void>()
			const unsubscribe = manager.subscribe("test-session", callback)

			unsubscribe()

			expect(manager.getState("test-session")).toBeUndefined()
			expect(mockTimers.timers[0]?.disposed).toBe(true)
		})
	})

	describe("Periodic sync", () => {
		test("Timer callback calls fetchStatusAndMessages", async () => {
			const mockTimers = createMockTimerFactory()
			const { fetchFullSession, fetchMessage, fetchStatusAndMessages } = createMockFetchers()
			const manager = await createSessionStateManager(fetchFullSession, fetchMessage, fetchStatusAndMessages, mockTimers.factory)

			await manager.initializeSession("test-session")

			const timer = mockTimers.timers[0]
			if (!timer) return
			timer.callback()

			await new Promise(resolve => setTimeout(resolve, 10))

			expect(fetchStatusAndMessages).toHaveBeenCalled()
		})

		test("When status changed, triggers a data reload", async () => {
			const mockTimers = createMockTimerFactory()
			let fetchCount = 0
			let statusCallCount = 0
			const fetchFullSession = mockFn<(sessionID: string) => Promise<FullSessionData>>().mockImplementation(async () => {
				fetchCount++
				return createMockSessionData({
					session: mock<Session>({ id: "test-session", title: "Test", directory: "/tmp" }),
					status: { type: statusCallCount === 1 ? "idle" : "busy" },
					messages: [],
					parts: [],
					todos: [],
					diffs: [],
				})
			})
			const fetchMessage = mockFn<(sessionID: string, messageID: string) => Promise<MessageWithParts | null>>()
			const fetchStatusAndMessages = mockFn<(sessionID: string) => Promise<StatusAndMessages>>().mockImplementation(async () => {
				statusCallCount++
				return { status: { type: statusCallCount === 1 ? "idle" : "busy" } as SdkSessionStatus, messages: [] }
			})

			const manager = await createSessionStateManager(fetchFullSession, fetchMessage, fetchStatusAndMessages, mockTimers.factory)

			await manager.initializeSession("test-session")

			const timer = mockTimers.timers[0]
			if (!timer) return
			timer.callback()

			await new Promise(resolve => setTimeout(resolve, 10))

			expect(fetchCount).toBe(2)
		})

		test("When message count changed, triggers a data reload", async () => {
			const mockTimers = createMockTimerFactory()
			let fetchCount = 0
			let messagesCallCount = 0
			const fetchFullSession = mockFn<(sessionID: string) => Promise<FullSessionData>>().mockImplementation(async () => {
				fetchCount++
				return createMockSessionData({
					session: mock<Session>({ id: "test-session", title: "Test", directory: "/tmp" }),
					status: { type: "idle" },
					messages: messagesCallCount === 1 ? [] : [mock<Message>()],
					parts: [],
					todos: [],
					diffs: [],
				})
			})
			const fetchMessage = mockFn<(sessionID: string, messageID: string) => Promise<MessageWithParts | null>>()
			const fetchStatusAndMessages = mockFn<(sessionID: string) => Promise<StatusAndMessages>>().mockImplementation(async () => {
				messagesCallCount++
				return { status: { type: "idle" } as SdkSessionStatus, messages: messagesCallCount === 1 ? [] : [{ info: mock<Message>(), parts: [] }] }
			})

			const manager = await createSessionStateManager(fetchFullSession, fetchMessage, fetchStatusAndMessages, mockTimers.factory)

			await manager.initializeSession("test-session")

			const timer = mockTimers.timers[0]
			if (!timer) return
			await timer.callback()

			await new Promise(resolve => setTimeout(resolve, 10))

			expect(fetchCount).toBe(2)
		})

		test("When neither changed, no reload", async () => {
			const mockTimers = createMockTimerFactory()
			let fetchCount = 0
			const fetchFullSession = mockFn<(sessionID: string) => Promise<FullSessionData>>().mockImplementation(async () => {
				fetchCount++
				return createMockSessionData({
					session: mock<Session>({ id: "test-session", title: "Test", directory: "/tmp" }),
					status: { type: "idle" },
					messages: [],
					parts: [],
					todos: [],
					diffs: [],
				})
			})
			const fetchMessage = mockFn<(sessionID: string, messageID: string) => Promise<MessageWithParts | null>>()
			const fetchStatusAndMessages = mockFn<(sessionID: string) => Promise<StatusAndMessages>>()

			const manager = await createSessionStateManager(fetchFullSession, fetchMessage, fetchStatusAndMessages, mockTimers.factory)

			await manager.initializeSession("test-session")

			const timer = mockTimers.timers[0]
			if (!timer) return
			await timer.callback()

			await new Promise(resolve => setTimeout(resolve, 10))

			expect(fetchCount).toBe(1)
		})

		test("Timer is cleared on disposeSession", async () => {
			const mockTimers = createMockTimerFactory()
			const { fetchFullSession, fetchMessage, fetchStatusAndMessages } = createMockFetchers()
			const manager = await createSessionStateManager(fetchFullSession, fetchMessage, fetchStatusAndMessages, mockTimers.factory)
			await manager.initializeSession("test-session")

			manager.disposeSession("test-session")

			expect(mockTimers.timers[0]?.disposed).toBe(true)
		})
	})

	describe("Timer stacking bug is fixed", () => {
		test("Calling refresh when status changes does NOT create a second timer", async () => {
			const mockTimers = createMockTimerFactory()
			const { fetchFullSession, fetchMessage, fetchStatusAndMessages } = createMockFetchers()
			const manager = await createSessionStateManager(fetchFullSession, fetchMessage, fetchStatusAndMessages, mockTimers.factory)

			await manager.initializeSession("test-session")

			const initialTimerCount = mockTimers.timers.length

			const event: SdkEvent = {
				type: "session.compacted",
				properties: { sessionID: "test-session" },
			}

			manager.handleEvent(event)

			await new Promise(resolve => setTimeout(resolve, 10))

			expect(mockTimers.timers.length).toBe(initialTimerCount)
		})
	})
})
