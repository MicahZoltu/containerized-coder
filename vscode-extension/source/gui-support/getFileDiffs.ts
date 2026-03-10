import { FileDiff, OpencodeClient } from "@opencode-ai/sdk/v2";
import { SessionContext } from "../gui/sessions.js";

export async function getFileDiffs(client: OpencodeClient, session: SessionContext, root?: FileDiff): Promise<FileDiff[]> {
	if (root !== undefined) return [];

	const sessionId = session.getCurrentSessionId();
	if (sessionId === null) return [];

	const result = await client.session.diff({ sessionID: sessionId });

	return result.data ?? [];
}
