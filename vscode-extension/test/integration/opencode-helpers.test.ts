import { describe, expect, test } from "bun:test"
import { getModel, getModelList, setModel } from "../../source/utils/opencode-helpers.js"
import { server } from "./setup-opencode.js"

describe("opencode-helpers integration", () => {
	describe("getModelList", () => {
		test("returns models from providers config", async () => {
			const errors: unknown[] = []
			const noticeError = (_message: string, error: unknown) => { errors.push(error) }

			const result = await getModelList(server.client, noticeError)

			expect(errors.length).toBe(0)
			expect(Array.isArray(result)).toBe(true)
			expect(result).toContainEqual({ label: 'mock/mock-model', description: 'mock', alwaysShow: true })
		})
	})

	describe("getModel", () => {
		test("returns current model from config", async () => {
			const errors: unknown[] = []
			const noticeError = (_message: string, error: unknown) => { errors.push(error) }
			const announced: string[] = []
			const announce = (model: string) => announced.push(model)

			const result = await getModel(server.client, noticeError, announce)

			expect(result).toBe("mock/mock-model")
			expect(announced).toContain("mock/mock-model")
			expect(errors.length).toBe(0)
		})
	})

	describe("setModel", () => {
		test("updates config and refetches model", async () => {
			const errors: unknown[] = []
			const noticeError = (_message: string, error: unknown) => { errors.push(error) }
			const getModel = async () => {
				const config = await server.client.config.get()
				return config.data?.model ?? "Unknown"
			}

			await setModel(server.client, noticeError, getModel, "mock/mock-model")

			expect(errors.length).toBe(0)

			const newModel = await getModel()
			expect(newModel).toBe("mock/mock-model")
		})
	})
})
