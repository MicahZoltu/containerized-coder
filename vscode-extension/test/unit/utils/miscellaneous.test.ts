import { afterEach, beforeEach, describe, expect, jest, mock, test } from "bun:test"
import { getNonce, isPlainObject, setupPeriodicRefresh } from "../../../source/utils/miscellaneous.js"
import { assert } from "../../helpers.js"

describe("getNonce", () => {
	test("returns a string", () => {
		const nonce = getNonce()
		expect(typeof nonce).toBe("string")
		expect(nonce.length).toBeGreaterThan(0)
	})

	test("returns different values on successive calls", () => {
		const nonce1 = getNonce()
		const nonce2 = getNonce()
		expect(nonce1).not.toBe(nonce2)
	})
})

describe("isPlainObject", () => {
	test("returns true for plain objects", () => {
		expect(isPlainObject({})).toBe(true)
		expect(isPlainObject({ a: 1, b: "test" })).toBe(true)
		expect(isPlainObject(Object.create(null))).toBe(true)
	})

	test("returns false for null", () => {
		expect(isPlainObject(null)).toBe(false)
	})

	test("returns false for arrays", () => {
		expect(isPlainObject([])).toBe(false)
		expect(isPlainObject([1, 2, 3])).toBe(false)
	})

	test("returns false for functions", () => {
		expect(isPlainObject(() => {})).toBe(false)
		expect(isPlainObject(function() {})).toBe(false)
	})

	test("returns false for primitive values", () => {
		expect(isPlainObject(42)).toBe(false)
		expect(isPlainObject("string")).toBe(false)
		expect(isPlainObject(true)).toBe(false)
		expect(isPlainObject(undefined)).toBe(false)
		expect(isPlainObject(Symbol("test"))).toBe(false)
	})

	test("returns false for Date objects", () => {
		expect(isPlainObject(new Date())).toBe(false)
	})

	test("returns false for class instances", () => {
		class TestClass {}
		expect(isPlainObject(new TestClass())).toBe(false)
	})

	test("returns false for Map and Set", () => {
		expect(isPlainObject(new Map())).toBe(false)
		expect(isPlainObject(new Set())).toBe(false)
	})
})

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
		await Promise.resolve()
		expect(errors.length).toEqual(1)
		const error = errors[0]
		assert(error instanceof Error)
		expect(error.message).toEqual('Refresh failed')
	})

	test("returns disposable that stops interval", () => {
		const refreshFn = mock().mockResolvedValue(undefined)

		const disposable = setupPeriodicRefresh(refreshFn, () => {})

		jest.advanceTimersByTime(5000)
		expect(refreshFn).not.toHaveBeenCalled()

		disposable.dispose()

		jest.advanceTimersByTime(5000)
		expect(refreshFn).not.toHaveBeenCalled()
	})

	test("continues calling refresh on subsequent intervals", () => {
		const refreshFn = mock().mockResolvedValue(undefined)

		setupPeriodicRefresh(refreshFn, () => {})

		jest.advanceTimersByTime(10000)
		expect(refreshFn).toHaveBeenCalledTimes(1)

		jest.advanceTimersByTime(10000)
		expect(refreshFn).toHaveBeenCalledTimes(2)

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
