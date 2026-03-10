export function isPlainObject(candidate: unknown): candidate is Record<string, unknown> {
  if (typeof candidate !== 'object') return false
  if (candidate === null) return false
  const prototype = Object.getPrototypeOf(candidate)
  if (prototype === null) return true
  if (prototype === Object.prototype) return true
  return false
}
