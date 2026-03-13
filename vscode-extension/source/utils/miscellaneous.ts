export function getNonce(): string {
	let nonceString = ""
	const possibleCharacters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
	for (let i = 0; i < 32; i++) {
		nonceString += possibleCharacters.charAt(Math.floor(Math.random() * possibleCharacters.length))
	}
	return nonceString
}

export function nowAsString(): string {
	return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

export function setupPeriodicRefresh(refreshFn: () => Promise<unknown>, noticeError: (message: string, error: unknown) => void) {
	const refreshIntervalId = setInterval(() => { refreshFn().catch(error => noticeError("Periodic refresh failed", error)) }, 10000)
	const dispose = () => {
		if (!refreshIntervalId) return
		clearInterval(refreshIntervalId)
	}

	return { dispose }
}

export function isPlainObject(candidate: unknown): candidate is Record<string, unknown> {
	if (typeof candidate !== 'object') return false
	if (candidate === null) return false
	const prototype = Object.getPrototypeOf(candidate)
	if (prototype === null) return true
	if (prototype === Object.prototype) return true
	return false
}
