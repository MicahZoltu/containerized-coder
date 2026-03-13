import { type OpencodeClient, type Event as SdkEvent } from "@opencode-ai/sdk/v2"
import type { SessionContext } from "../gui/sessions.js"
import { EventEmitter } from "./emitter.js"

export function isSdkEvent(obj: unknown): obj is SdkEvent {
	if (!isPlainObject(obj)) return false
	if (typeof obj.type !== 'string') return false
	const properties = obj.properties
	if (properties !== undefined && properties !== null) {
		if (!isPlainObject(properties)) return false
	}
	return true
}

function isPlainObject(candidate: unknown): candidate is Record<string, unknown> {
	if (typeof candidate !== 'object') return false
	if (candidate === null) return false
	const prototype = Object.getPrototypeOf(candidate)
	if (prototype === null) return true
	if (prototype === Object.prototype) return true
	return false
}

export function handleSdkEvent(noticeError: (message: string, error: unknown) => void, sessionsEmitter: EventEmitter<void>, sessionContext: SessionContext, todoEmitter: EventEmitter<void>, fileEmitter: EventEmitter<void>, closeSessionPanel: (sessionId: string) => void, event: SdkEvent) {
	const eventType = event.type

	switch (eventType) {
		case "session.created":
		case "session.updated":
		case "session.status":
		case "session.idle":
			sessionsEmitter.fire()
			break

		case "session.deleted":
			const sessionId = event.properties.info.id
			sessionsEmitter.fire()
			closeSessionPanel(sessionId)
			break

		case "todo.updated":
			if (sessionContext.getCurrentSessionId() === event.properties?.sessionID) {
				todoEmitter.fire()
			}
			break

		case "session.diff":
			if (sessionContext.getCurrentSessionId() === event.properties?.sessionID) {
				fileEmitter.fire()
			}
			break

		case "session.error":
			const error = event.properties?.error
			if (error) {
				const message = error?.data?.message || "An unknown error occurred in a session"
				noticeError('Session error', message)
			}
			break
	}
}

export async function startListeningForOpencodeEvents(client: OpencodeClient, noticeError: (message: string, error: unknown) => void, noticeInfo: (message: string) => void, sdkEventHandler: (event: SdkEvent) => void) {
	const disposables: { dispose: () => void }[] = []

	try {
		const eventSubscription = await client.event.subscribe()
		const emitter = new EventEmitter<SdkEvent>(noticeError)
		const listener = emitter.event(sdkEventHandler)
		disposables.push(listener, emitter)

		const backgroundStreamPumper = async () => {
			try {
				for await (const event of eventSubscription.stream) {
					if (isSdkEvent(event)) {
						emitter.fire(event)
					} else {
						noticeError('Invalid event received', event)
					}
				}
			} catch (error) {
				noticeError("SSE stream error", error)
			}
		}
		backgroundStreamPumper()

		disposables.push({ dispose: () => { listener.dispose(), emitter.dispose() } })

		noticeInfo("SSE event subscription established")
	} catch (error) {
		noticeError("Failed to subscribe to events", error)
	}

	return disposables
}
