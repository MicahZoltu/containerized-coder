export function isPlainObject(candidate: unknown): candidate is Record<string, unknown> {
	return typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate);
}
