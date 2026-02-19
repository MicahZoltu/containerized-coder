import { afterEach, describe, expect, test } from "bun:test"
import { mockLlm } from "./setup-mock-llm.js"

describe("mock-llm server", () => {
	afterEach(() => {
		mockLlm.clear()
	})

	test("responds with default response when no routes match", async () => {
		mockLlm.setDefault({ role: "assistant", content: "Default response" })

		const response = await fetch(`${mockLlm.url}/v1/chat/completions`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model: "mock-model",
				messages: [{ role: "user", content: "Hello" }],
				stream: false,
			}),
		})

		expect(response.ok).toBe(true)
		const body = (await response.json()) as { choices: Array<{ message: { content: string } }> }
		const choice = body.choices[0]
		expect(choice?.message.content).toBe("Default response")
	})

	test("responds with routed response when substring matches", async () => {
		mockLlm.setDefault({ role: "assistant", content: "Default response" })
		mockLlm.addRoute("list files", { role: "assistant", content: "I found 5 files" })

		const response = await fetch(`${mockLlm.url}/v1/chat/completions`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model: "mock-model",
				messages: [{ role: "user", content: "Please list files in the project" }],
				stream: false,
			}),
		})

		expect(response.ok).toBe(true)
		const body = (await response.json()) as { choices: Array<{ message: { content: string } }> }
		const choice = body.choices[0]
		expect(choice?.message.content).toBe("I found 5 files")
	})

	test("responds multiple times to same match", async () => {
		mockLlm.addRoute("apple", { role: "assistant", content: "banana" })

		const response1 = await fetch(`${mockLlm.url}/v1/chat/completions`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model: "mock-model",
				messages: [{ role: "user", content: "What do you think about apple pie?" }],
				stream: false,
			}),
		})
		expect(response1.ok).toBe(true)
		const body1 = (await response1.json()) as { choices: Array<{ message: { content: string } }> }
		const choice1 = body1.choices[0]
		expect(choice1?.message.content).toBe("banana")

		const response2 = await fetch(`${mockLlm.url}/v1/chat/completions`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model: "mock-model",
				messages: [{ role: "user", content: "What do you think about cherry pie?" }],
				stream: false,
			}),
		})
		expect(response2.ok).toBe(true)
		const body2 = (await response2.json()) as { choices: Array<{ message: { content: string } }> }
		const choice2 = body2.choices[0]
		expect(choice2?.message.content).toBe("Hello.")

		const response3 = await fetch(`${mockLlm.url}/v1/chat/completions`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model: "mock-model",
				messages: [{ role: "user", content: "The Big Apple is the best?" }],
				stream: false,
			}),
		})
		expect(response3.ok).toBe(true)
		const body3 = (await response3.json()) as { choices: Array<{ message: { content: string } }> }
		const choice3 = body3.choices[0]
		expect(choice3?.message.content).toBe("banana")
	})

	test("responds with streaming", async () => {
		mockLlm.setDefault({
			role: "assistant",
			content: "Streaming response",
		})

		const response = await fetch(`${mockLlm.url}/v1/chat/completions`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model: "mock-model",
				messages: [{ role: "user", content: "Hello" }],
				stream: true,
			}),
		})

		expect(response.ok).toBe(true)
		expect(response.headers.get("Content-Type")).toBe("text/event-stream")

		const text = await response.text()
		expect(text).toContain("data:")
		expect(text).toContain("[DONE]")
		expect(text).toContain("Streaming response")
	})

	test("responds with tool calls", async () => {
		mockLlm.setDefault({
			role: "assistant",
			tool_calls: [{ id: "call-123", function: { name: "bash", arguments: '{"command": "echo hello"}' } }],
		})

		const response = await fetch(`${mockLlm.url}/v1/chat/completions`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model: "mock-model",
				messages: [{ role: "user", content: "Run a command" }],
				stream: false,
			}),
		})

		expect(response.ok).toBe(true)
		const body = (await response.json()) as {
			choices: Array<{ message: { tool_calls?: Array<{ id: string; function: { name: string } }> } }>
		}
		const choice = body.choices[0]
		const toolCalls = choice?.message.tool_calls
		expect(toolCalls).toBeDefined()
		expect(toolCalls?.[0]?.id).toBe("call-123")
		expect(toolCalls?.[0]?.function.name).toBe("bash")
	})

	test("returns error when multiple routes match", async () => {
		mockLlm.addRoute("read", { role: "assistant", content: "Reading..." })
		mockLlm.addRoute("file", { role: "assistant", content: "File operation..." })

		const response = await fetch(`${mockLlm.url}/v1/chat/completions`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model: "mock-model",
				messages: [{ role: "user", content: "Please read file x.ts" }],
				stream: false,
			}),
		})

		expect(response.status).toBe(500)
		const body = (await response.json()) as { error: { type: string; message: string } }
		expect(body.error.type).toBe("mock_error")
		expect(body.error.message).toContain("Multiple routes matched")
	})

	test("clear resets routes and default", async () => {
		mockLlm.setDefault({ role: "assistant", content: "Default" })
		mockLlm.addRoute("test", { role: "assistant", content: "Test response" })
		mockLlm.clear()

		const response = await fetch(`${mockLlm.url}/v1/chat/completions`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model: "mock-model",
				messages: [{ role: "user", content: "test message" }],
				stream: false,
			}),
		})

		expect(response.ok).toBe(true)
		const body = (await response.json()) as { choices: Array<{ message: { content: string } }> }
		const choice = body.choices[0]
		expect(choice?.message.content).toBe("Hello.")
	})
})
