import { describe, expect, test } from "bun:test"
import { getNonce } from "../../source/utils/miscellaneous.js"

describe("utils", () => {
	test("getNonce returns a string", () => {
		const nonce = getNonce()
		expect(typeof nonce).toBe("string")
		expect(nonce.length).toBeGreaterThan(0)
	})

	test("getNonce returns different values on successive calls", () => {
		const nonce1 = getNonce()
		const nonce2 = getNonce()
		expect(nonce1).not.toBe(nonce2)
	})
})
