import * as vscode from "vscode"
import { log } from "./logger"

interface DiffContent {
	original: string
	modified: string
	filePath: string
}

export class DiffContentProvider implements vscode.TextDocumentContentProvider {
	private static instance: DiffContentProvider | null = null
	private contentMap: Map<string, DiffContent> = new Map()
	private _onDidChange = new vscode.EventEmitter<vscode.Uri>()

	public static getInstance(): DiffContentProvider {
		if (!DiffContentProvider.instance) {
			DiffContentProvider.instance = new DiffContentProvider()
		}
		return DiffContentProvider.instance
	}

	public readonly onDidChange = this._onDidChange.event

	provideTextDocumentContent(uri: vscode.Uri): string {
		const opId = uri.query
		const [side] = uri.path.split("/")

		const content = this.contentMap.get(opId)
		if (!content) {
			log(`DiffContentProvider: No content found for opId ${opId}`)
			return ""
		}

		if (side === "original") {
			return content.original
		} else if (side === "modified") {
			return content.modified
		}

		return ""
	}

	registerDiff(opId: string, filePath: string, original: string, modified: string): void {
		this.contentMap.set(opId, { original, modified, filePath })
		log(`DiffContentProvider: Registered diff for ${filePath} (opId: ${opId})`)
	}

	clearDiff(opId: string): void {
		this.contentMap.delete(opId)
	}

	async showDiff(opId: string, filePath: string): Promise<void> {
		const content = this.contentMap.get(opId)
		if (!content) {
			throw new Error(`No diff content registered for opId: ${opId}`)
		}

		const leftUri = vscode.Uri.parse(`opencode-diff:original/${filePath}?${opId}`)
		const rightUri = vscode.Uri.parse(`opencode-diff:modified/${filePath}?${opId}`)
		const title = `${filePath} (OpenCode Diff)`

		await vscode.commands.executeCommand("vscode.diff", leftUri, rightUri, title)
		log(`DiffContentProvider: Opened diff view for ${filePath}`)
	}
}
