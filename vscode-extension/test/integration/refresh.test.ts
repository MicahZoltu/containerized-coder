import { afterEach, beforeEach, describe, expect, jest, mock, test } from "bun:test"
import { setupPeriodicRefresh } from "../../source/extension.js"
import { assert } from "../helpers.js"

describe("refresh coordination", () => {
	describe("setupPeriodicRefresh", () => {
		beforeEach(() => {
			jest.useFakeTimers()
		})

		afterEach(() => {
			mock.clearAllMocks()
			jest.useRealTimers()
		})

		test("calls refresh function at specified interval", () => {
			let counter = 0
			setupPeriodicRefresh(async () => counter++, () => {})
			jest.runOnlyPendingTimers()
			expect(counter).toEqual(1)
		})

		test("catches and reports errors from refresh function", async () => {
			const errors: unknown[] = []
			const noticeError = (_msg: string, err: unknown) => errors.push(err)
			setupPeriodicRefresh(async () => { throw new Error('Refresh failed') }, noticeError)
			jest.runOnlyPendingTimers()
			// we need to await next tick after the timer so the catch clause in `setupPeriodicRefresh` will execute.
			await Promise.resolve()
			expect(errors.length).toEqual(1)
			const error = errors[0]
			assert(error instanceof Error)
			expect(error.message).toEqual('Refresh failed')
		})

		test("returns disposable that stops interval", () => {
			const refreshFn = mock().mockResolvedValue(undefined)

			const disposable = setupPeriodicRefresh(refreshFn, () => {})

			// Advance time a bit
			jest.advanceTimersByTime(5000)
			expect(refreshFn).not.toHaveBeenCalled()

			// Dispose
			disposable.dispose()

			// Advance again
			jest.advanceTimersByTime(5000)
			expect(refreshFn).not.toHaveBeenCalled()
		})

		test("continues calling refresh on subsequent intervals", () => {
			const refreshFn = mock().mockResolvedValue(undefined)

			setupPeriodicRefresh(refreshFn, () => {})

			// First interval
			jest.advanceTimersByTime(10000)
			expect(refreshFn).toHaveBeenCalledTimes(1)

			// Second interval
			jest.advanceTimersByTime(10000)
			expect(refreshFn).toHaveBeenCalledTimes(2)

			// Third interval
			jest.advanceTimersByTime(10000)
			expect(refreshFn).toHaveBeenCalledTimes(3)
		})

		test("handles multiple disposals gracefully", () => {
			let count1 = 0
			let count2 = 0
			const disposable1 = setupPeriodicRefresh(async () => count1++, () => {})
			const disposable2 = setupPeriodicRefresh(async () => count2++, () => {})

			jest.advanceTimersByTime(10000)
			disposable1.dispose()
			jest.advanceTimersByTime(10000)
			disposable2.dispose()
			jest.advanceTimersByTime(10000)
			expect(count1).toEqual(1)
			expect(count2).toEqual(2)
		})
	})
})
