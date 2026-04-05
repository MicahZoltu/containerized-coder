import type { Event as SdkEvent, SessionStatus as SdkSessionStatus, Part, Todo, FileDiff } from "@opencode-ai/sdk/v2"

export type SessionAction =
	| { type: "message-updated"; sessionID: string; messageID: string }
	| { type: "part-updated"; sessionID: string; messageID: string; partID: string; part: Part }
	| { type: "part-delta"; sessionID: string; messageID: string; partID: string; field: string; delta: string }
	| { type: "part-removed"; sessionID: string; messageID: string; partID: string }
	| { type: "status-updated"; sessionID: string; status: SdkSessionStatus }
	| { type: "todos-updated"; sessionID: string; todos: Todo[] }
	| { type: "diffs-updated"; sessionID: string; diffs: FileDiff[] }
	| { type: "session-deleted"; sessionID: string }
	| { type: "session-compacted"; sessionID: string }

export function mapEventToAction(event: SdkEvent): SessionAction | null {
	switch (event.type) {
		case "message.updated": {
			return {
				type: "message-updated",
				sessionID: event.properties.info.sessionID,
				messageID: event.properties.info.id,
			}
		}

		case "message.part.updated": {
			return {
				type: "part-updated",
				sessionID: event.properties.part.sessionID,
				messageID: event.properties.part.messageID,
				partID: event.properties.part.id,
				part: event.properties.part,
			}
		}

		case "message.part.delta": {
			return {
				type: "part-delta",
				sessionID: event.properties.sessionID,
				messageID: event.properties.messageID,
				partID: event.properties.partID,
				field: event.properties.field,
				delta: event.properties.delta,
			}
		}

		case "message.part.removed": {
			return {
				type: "part-removed",
				sessionID: event.properties.sessionID,
				messageID: event.properties.messageID,
				partID: event.properties.partID,
			}
		}

		case "session.status": {
			return {
				type: "status-updated",
				sessionID: event.properties.sessionID,
				status: event.properties.status,
			}
		}

		case "session.idle": {
			return {
				type: "status-updated",
				sessionID: event.properties.sessionID,
				status: { type: "idle" },
			}
		}

		case "todo.updated": {
			return {
				type: "todos-updated",
				sessionID: event.properties.sessionID,
				todos: event.properties.todos,
			}
		}

		case "session.diff": {
			return {
				type: "diffs-updated",
				sessionID: event.properties.sessionID,
				diffs: event.properties.diff,
			}
		}

		case "session.deleted": {
			return {
				type: "session-deleted",
				sessionID: event.properties.info.id,
			}
		}

		case "session.compacted": {
			return {
				type: "session-compacted",
				sessionID: event.properties.sessionID,
			}
		}

		default:
			return null
	}
}
