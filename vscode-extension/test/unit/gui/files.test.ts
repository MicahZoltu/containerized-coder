import { mock, mockFn } from '@tkoehlerlg/bun-mock-extended'
import { describe, expect, test } from "bun:test"
import type * as vscode from 'vscode'
import { fileDiffToTreeItem } from "../../../source/gui/files.js"

describe("files - pure functions", () => {
	test("fileDiffToTreeItem shows + and - counts", () => {
		const diff = { file: "src/test.ts", additions: 10, deletions: 5, before: "", after: "" } as const
		const item = fileDiffToTreeItem(() => mock<vscode.TreeItem>(), () => mock<vscode.ThemeIcon>(), diff)
		expect(item.description).toBe("+10 -5")
	})

	test("fileDiffToTreeItem creates item with correct label", () => {
		const diff = { file: "a.ts", additions: 1, deletions: 2, before: "", after: "" } as const
		const mockCreateTreeItem = mockFn<Parameters<typeof fileDiffToTreeItem>[0]>()
		mockCreateTreeItem.mockReturnValue(mock<ReturnType<Parameters<typeof fileDiffToTreeItem>[0]>>())
		fileDiffToTreeItem(mockCreateTreeItem, () => mock<vscode.ThemeIcon>(), diff)
		expect(mockCreateTreeItem).toHaveBeenCalledWith("a.ts", 0)
	})
})
