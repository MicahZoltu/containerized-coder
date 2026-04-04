// See: https://github.com/microsoft/TypeScript/issues/17002
export function isArray(value: unknown): value is unknown[] {
	return Array.isArray(value)
}
export function isReadonlyArray(value: unknown): value is readonly unknown[] {
	return Array.isArray(value)
}
