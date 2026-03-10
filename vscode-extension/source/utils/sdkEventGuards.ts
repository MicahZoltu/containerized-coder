import type { Event as SdkEvent } from "@opencode-ai/sdk/v2"
import { isPlainObject } from "../utils/typeGuards.js"

export function isSdkEvent(obj: unknown): obj is SdkEvent {
	if (!isPlainObject(obj)) return false
	if (typeof obj.type !== 'string') return false
	const properties = obj.properties
	if (properties !== undefined && properties !== null) {
		if (!isPlainObject(properties)) return false
	}
	return true
}