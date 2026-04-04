import type { SessionStatus as SdkSessionStatus } from "@opencode-ai/sdk/v2"

export type SessionStatus = 'idle' | 'busy' | 'retry'

export type SessionMetadata = {
	id: string
	title: string
	directory: string
	status: SessionStatus
	created: number
	updated: number
	archived?: number
}

export type UIError = {
	name: string
	message: string
	isRetryable: boolean
	statusCode?: number
	responseHeaders?: Record<string, string>
	responseBody?: string
	metadata?: Record<string, string>
}

export type UIPart =
	| { id: string; type: 'text'; text: string }
	| { id: string; type: 'reasoning'; text: string }
	| { id: string; type: 'tool'; status: 'pending' | 'running' | 'completed' | 'error'; title?: string; output?: string; error?: string; attachments?: UIPart[] }
	| { id: string; type: 'file'; filename?: string; url: string; mime: string }
	| { id: string; type: 'step-start' }
	| { id: string; type: 'step-finish'; reason: string }
	| { id: string; type: 'snapshot'; snapshot: string }
	| { id: string; type: 'patch'; hash: string; files: string[] }
	| { id: string; type: 'agent'; name: string }
	| { id: string; type: 'retry'; attempt: number; error: UIError }
	| { id: string; type: 'compaction'; auto: boolean }
	| { id: string; type: 'subtask'; prompt: string; description: string; agent: string }

export type UIMessage = {
	id: string
	role: 'user' | 'assistant'
	parts: UIPart[]
	created: number
	completed?: number
	error?: UIError
}

export type UITodo = {
	content: string
	status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
	priority: 'high' | 'medium' | 'low'
}

export type UIFileDiff = {
	file: string
	before: string
	after: string
	additions: number
	deletions: number
	status: 'added' | 'deleted' | 'modified'
}

export type UIState = {
	session: SessionMetadata
	messages: UIMessage[]
	todos: UITodo[]
	fileDiffs: UIFileDiff[]
	isSyncing: boolean
	lastUpdated: number
}

export function adaptSessionStatus(status: SdkSessionStatus): SessionStatus {
	if (status.type === 'idle') return 'idle'
	if (status.type === 'busy') return 'busy'
	return 'retry'
}
