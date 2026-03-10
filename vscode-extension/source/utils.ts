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
