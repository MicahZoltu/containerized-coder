import type { FileDiff } from "@opencode-ai/sdk/v2"
import { describe, expect, test } from "bun:test"
import { fileDiffToTreeItem, getChangeIcon } from "../../source/gui/files.js"

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

	test("getChangeIcon returns correct icons", () => {
		expect(getChangeIcon({ file: "", additions: 5, deletions: 0, before: "", after: "" }).id).toBe("git-add")
		expect(getChangeIcon({ file: "", additions: 0, deletions: 5, before: "", after: "" }).id).toBe("git-remove")
		expect(getChangeIcon({ file: "", additions: 5, deletions: 3, before: "", after: "" }).id).toBe("git-modified")
		expect(getChangeIcon({ file: "", additions: 0, deletions: 0, before: "", after: "" }).id).toBe("file")
	})
})
