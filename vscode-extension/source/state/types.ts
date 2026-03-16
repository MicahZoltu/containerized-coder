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
	message: string
	isRetryable: boolean
}

export type UIPart =
	| { type: 'text'; text: string }
	| { type: 'reasoning'; text: string }
	| { type: 'tool'; status: 'pending' | 'running' | 'completed' | 'error'; title?: string; output?: string; error?: string }
	| { type: 'file'; filename?: string; url: string; mime: string }
	| { type: 'step-start' }
	| { type: 'step-finish'; reason: string }
	| { type: 'snapshot'; snapshot: string }
	| { type: 'patch'; hash: string; files: string[] }
	| { type: 'agent'; name: string }
	| { type: 'retry'; attempt: number; errorMessage: string }
	| { type: 'compaction'; auto: boolean }
	| { type: 'subtask'; prompt: string; description: string; agent: string }

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

export type StateUpdate =
	| { type: 'SESSION_INIT'; sessionID: string; state: UIState }
	| { type: 'MESSAGE_UPDATED'; sessionID: string; messageID: string; message: UIMessage }
	| { type: 'PART_UPDATED'; sessionID: string; messageID: string; partID: string; part: UIPart }
	| { type: 'PART_DELTA'; sessionID: string; messageID: string; partID: string; field: string; delta: string }
	| { type: 'PART_REMOVED'; sessionID: string; messageID: string; partID: string }
	| { type: 'STATUS_UPDATED'; sessionID: string; status: SessionStatus }
	| { type: 'TODOS_UPDATED'; sessionID: string; todos: UITodo[] }
	| { type: 'DIFFS_UPDATED'; sessionID: string; diffs: UIFileDiff[] }

export function adaptSessionStatus(status: SdkSessionStatus): SessionStatus {
	if (status.type === 'idle') return 'idle'
	if (status.type === 'busy') return 'busy'
	return 'retry'
}
