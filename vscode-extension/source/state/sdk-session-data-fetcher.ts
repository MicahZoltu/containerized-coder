import type { FileDiff, Message, OpencodeClient, Part, Session, SessionStatus, Todo } from "@opencode-ai/sdk/v2"

export interface FullSessionData {
	session: Session
	status: SessionStatus
	messages: Message[]
	parts: Part[]
	todos: Todo[]
	diffs: FileDiff[]
}

export interface MessageWithParts {
	message: Message
	parts: Part[]
}

export interface StatusAndMessages {
	status: SessionStatus | undefined
	messages: Array<{ info: Message; parts: Part[] }>
}

export async function fetchFullSession(client: OpencodeClient, sessionID: string): Promise<FullSessionData> {
	const [sessionRes, messagesRes, todosRes, diffsRes, statusRes] = await Promise.all([
		client.session.get({ sessionID }),
		client.session.messages({ sessionID }),
		client.session.todo({ sessionID }),
		client.session.diff({ sessionID }),
		client.session.status({}),
	])

	const sessionData = sessionRes.data
	const messagesWithParts = messagesRes.data ?? []
	const messagesData = messagesWithParts.map(m => 'info' in m ? m.info : m)
	const allParts = messagesWithParts.flatMap(m => 'parts' in m ? m.parts ?? [] : [])
	const todosData = todosRes.data ?? []
	const diffsData = diffsRes.data ?? []
	const statusData = statusRes.data?.[sessionID]

	if (!sessionData || !statusData) {
		throw new Error(`Session ${sessionID} not found`)
	}

	return {
		session: sessionData,
		status: statusData,
		messages: messagesData,
		parts: allParts,
		todos: todosData,
		diffs: diffsData,
	}
}

export async function fetchMessage(client: OpencodeClient, sessionID: string, messageID: string): Promise<MessageWithParts | null> {
	const messageRes = await client.session.message({ sessionID, messageID })
	const messageData = messageRes.data

	if (!messageData || !('info' in messageData)) {
		return null
	}

	return {
		message: messageData.info,
		parts: messageData.parts ?? [],
	}
}

export async function fetchStatusAndMessages(client: OpencodeClient, sessionID: string): Promise<StatusAndMessages> {
	const [statusRes, messagesRes] = await Promise.all([
		client.session.status({}),
		client.session.messages({ sessionID }),
	])

	const statusData = statusRes.data?.[sessionID]
	const messagesData = messagesRes.data ?? []

	return {
		status: statusData,
		messages: messagesData.map(m => ({
			info: 'info' in m ? m.info : m,
			parts: 'parts' in m ? m.parts ?? [] : [],
		})),
	}
}

