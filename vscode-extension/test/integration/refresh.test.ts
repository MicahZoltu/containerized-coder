import { describe, expect, test } from "bun:test"
import { setupPeriodicRefresh } from "../../source/extension.js"

describe("refresh coordination", () => {
	describe("setupPeriodicRefresh", () => {
		test("returns disposable that clears interval", () => {
			let refreshCount = 0
			const refreshFn = async () => { refreshCount++ }

			const disposable = setupPeriodicRefresh(refreshFn, () => {})

			// The interval is set globally in the extension module
			// We can't easily test the interval firing without waiting 10s
			// But we can test the disposable
			expect(disposable).toEqual({ dispose: expect.any(Function) })

			disposable.dispose()
			// After disposal, should not crash
		})
	})
})
