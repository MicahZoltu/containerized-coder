export class PendingUserMessageQueue {
	private opIds: string[] = []

	enqueue(opId: string): void {
		this.opIds.push(opId)
	}

	dequeue(): string | null {
		return this.opIds.shift() ?? null
	}

	clear(): void {
		this.opIds.length = 0
	}

	get size(): number {
		return this.opIds.length
	}
}
