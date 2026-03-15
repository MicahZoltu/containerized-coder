export class EventEmitter<T> {
	private eventListeners: Array<(eventArgument: T) => void> = []

	constructor(private noticeError: (message: string, error: unknown) => void) {}

	onFire = (listener: (eventArgument: T) => void) => {
		this.eventListeners.push(listener)
		return {
			dispose: () => {
				const listenerIndex = this.eventListeners.indexOf(listener)
				if (listenerIndex >= 0) this.eventListeners.splice(listenerIndex, 1)
			}
		}
	}

	fire = (eventArgument: T): void => {
		for (const listener of this.eventListeners) {
			try {
				listener(eventArgument)
			} catch (error) {
				this.noticeError("Event listener error", error)
			}
		}
	}

	dispose = (): void => {
		this.eventListeners = []
	}
}
