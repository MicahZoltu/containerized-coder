import { afterEach, describe, expect, test } from "bun:test"
import { mockLlm } from "./setup-mock-llm.js"
import { server } from "./setup-opencode.mjs"

describe("opencode integration", () => {
	let sessionId: string

	afterEach(async () => {
		mockLlm.clear()
		if (sessionId) {
			await server.client.session.delete({ sessionID: sessionId }).catch(() => {})
		}
	})

	test("spawns opencode server and connects via SDK", async () => {
		expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)

		const config = await server.client.config.get()
		expect(config.data?.model).toBe("mock/mock-model")
	})

	test("SDK message returns response from mock LLM", async () => {
		const session = await server.client.session.create({})
		sessionId = session.data!.id

		mockLlm.addRoute("greeting", {
			role: "assistant",
			content: "Hello from the mock LLM!",
		})

		const response = await server.client.session.prompt({
			sessionID: sessionId,
			parts: [{ type: "text", text: "Send a greeting" }],
		})

		expect(response.data?.info.id).toBeDefined()

		const textParts = response.data?.parts.filter((p) => p.type === "text") as
			| Array<{ type: "text"; text: string }>
			| undefined
		expect(textParts?.length).toBeGreaterThan(0)
		expect(textParts?.[0]?.text).toBe("Hello from the mock LLM!")
	})
})
