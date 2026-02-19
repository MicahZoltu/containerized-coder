import { afterAll, beforeAll } from 'bun:test'

export type MockResponse = {
	role: "assistant" | "tool"
	content?: string
	tool_calls?: Array<{
		id: string
		function: { name: string; arguments: string }
	}>
}

type Route = {
	match: string
	response: MockResponse
}

function getLastUserMessage(messages: unknown[]): string | null {
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i] as { role?: string; content?: string }
		if (msg.role === "user") {
			return typeof msg.content === "string" ? msg.content : null
		}
	}
	return null
}

function createMockLlmServer() {
	const routes: Route[] = []
	let defaultResponse: MockResponse = { role: "assistant", content: "" }

	const server = Bun.serve({
		port: 0,
		async fetch(req) {
			const url = new URL(req.url)

			if (url.pathname === "/v1/chat/completions" && req.method === "POST") {
				const body = (await req.json()) as { stream?: boolean; messages?: unknown[] }

				const userMessage = getLastUserMessage(body.messages ?? [])
				const matches = routes.filter((r) => userMessage?.toLowerCase().includes(r.match.toLowerCase()))

				if (matches.length > 1) {
					return Response.json({ error: { type: "mock_error", message: `Multiple routes matched: ${matches.map((r) => `"${r.match}"`).join(", ")}` } }, { status: 500 })
				}

				const response = matches.length === 1 ? matches[0]!.response : defaultResponse

				if (body.stream) {
					return createStreamingResponse(response)
				}

				return createNonStreamingResponse(response)
			}

			return new Response("Not found", { status: 404 })
		},
	})

	function addRoute(match: string, response: MockResponse) {
		routes.push({ match, response })
	}

	function setDefault(response: MockResponse) {
		defaultResponse = response
	}

	function clear() {
		routes.length = 0
		defaultResponse = { role: "assistant", content: "Hello." }
	}

	async function close() {
		server.stop()
	}

	return { url: `http://127.0.0.1:${server.port}`, addRoute, setDefault, clear, close }
}

function createNonStreamingResponse(mock: MockResponse) {
	const id = `chatcmpl-${Date.now()}`
	const created = Math.floor(Date.now() / 1000)

	const response = {
		id,
		object: "chat.completion",
		created,
		model: "mock-model",
		choices: [{
			index: 0,
			message: { role: mock.role, content: mock.content, tool_calls: mock.tool_calls },
			finish_reason: mock.tool_calls ? "tool_calls" : "stop",
		}],
	}

	return Response.json(response)
}

function createStreamingResponse(mock: MockResponse) {
	const id = `chatcmpl-${Date.now()}`
	const created = Math.floor(Date.now() / 1000)

	const chunks: unknown[] = []

	chunks.push({
		id,
		object: "chat.completion.chunk",
		created,
		model: "mock-model",
		choices: [{ index: 0, delta: { role: mock.role }, finish_reason: null }],
	})

	if (mock.content) {
		chunks.push({
			id,
			object: "chat.completion.chunk",
			created,
			model: "mock-model",
			choices: [{ index: 0, delta: { content: mock.content }, finish_reason: null }],
		})
	}

	if (mock.tool_calls) {
		for (const tc of mock.tool_calls) {
			chunks.push({
				id,
				object: "chat.completion.chunk",
				created,
				model: "mock-model",
				choices: [
					{
						index: 0,
						delta: {
							tool_calls: [
								{
									index: 0,
									id: tc.id,
									function: { name: tc.function.name, arguments: "" },
								},
							],
						},
						finish_reason: null,
					},
				],
			})
			chunks.push({
				id,
				object: "chat.completion.chunk",
				created,
				model: "mock-model",
				choices: [
					{
						index: 0,
						delta: {
							tool_calls: [
								{
									index: 0,
									function: { arguments: tc.function.arguments },
								},
							],
						},
						finish_reason: null,
					},
				],
			})
		}
	}

	chunks.push({
		id,
		object: "chat.completion.chunk",
		created,
		model: "mock-model",
		choices: [{ index: 0, delta: {}, finish_reason: mock.tool_calls ? "tool_calls" : "stop" }],
	})

	const encoder = new TextEncoder()
	const stream = new ReadableStream({
		start(controller) {
			for (const chunk of chunks) {
				controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`))
			}
			controller.enqueue(encoder.encode("data: [DONE]\n\n"))
			controller.close()
		},
	})

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
		},
	})
}

export let mockLlm: ReturnType<typeof createMockLlmServer>

beforeAll(async () => {
	mockLlm = createMockLlmServer()
})

afterAll(async () => {
	mockLlm.close()
})
