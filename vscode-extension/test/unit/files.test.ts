import type { FileDiff } from "@opencode-ai/sdk/v2"
import { describe, expect, test } from "bun:test"
import { fileDiffToTreeItem } from "../../source/gui/files.js"

describe("files - pure functions", () => {
	test("fileDiffToTreeItem shows + and - counts", () => {
		const diff: FileDiff = { file: "src/test.ts", additions: 10, deletions: 5, before: "", after: "" }
		const item = fileDiffToTreeItem(diff)
		expect(item.description).toBe("+10 -5")
	})

	test("fileDiffToTreeItem creates item with correct label", () => {
		const diff: FileDiff = { file: "a.ts", additions: 1, deletions: 2, before: "", after: "" }
		const item = fileDiffToTreeItem(diff)
		expect(item.label).toBe("a.ts")
	})
})
