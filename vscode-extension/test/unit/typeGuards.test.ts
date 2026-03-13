import { describe, expect, test } from "bun:test"
import { isPlainObject } from "../../source/utils/miscellaneous.js"

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
