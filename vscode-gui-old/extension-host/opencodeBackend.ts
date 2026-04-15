import { spawn, ChildProcess } from "child_process"
import { randomInt } from "crypto"
import { log, logError, getOutputChannel } from "./logger"
import type { Operation } from "./types/operations"
import type {
	ServerEvent,
	Part,
	MessageInfo,
	AssistantError,
	Provider,
	Config,
	QuestionRequest,
	QuestionAnswer,
	SessionStatus,
	TodoItem,
	PermissionRequest,
	PermissionReply,
} from "./types/backend"
import { partToOperation, updateOperationFromPart, createErrorOperation } from "./operationMapper"

interface Session {
	id: string
	title: string
	parentID?: string
	time: {
		created: number
		updated: number
		archived?: number
	}
}

export class OpencodeBackend {
	private process: ChildProcess | null = null
	private port: number | null = null
	private ready = false
	private abortController: AbortController | null = null
	private reconnectDelay = 1000
	private maxReconnectDelay = 5000
	private reconnectTimeout: NodeJS.Timeout | null = null
	private onOperationCallbacks: Map<string, (op: Operation) => void> = new Map()
	private activeOperations: Map<string, Operation> = new Map()
	private messageRoles: Map<string, "user" | "assistant"> = new Map()
	private messageInfo: Map<string, MessageInfo> = new Map()
	private requestQueue: Array<() => Promise<void>> = []
	private isProcessingQueue = false

	private onSessionStatusCallbacks: Map<string, (status: SessionStatus) => void> = new Map()
	private onGlobalSessionStatusCallbacks: Set<(sessionId: string, status: SessionStatus) => void> = new Set()
	private onTodoCallbacks: Map<string, (todos: TodoItem[]) => void> = new Map()

	constructor(private readonly opencodePath: string = "opencode") {}

	async start(): Promise<number> {
		if (this.ready && this.port) {
			return this.port
		}

		if (this.port) {
			log(`Checking if server is still running on port ${this.port}...`)
			try {
				const res = await fetch(`http://localhost:${this.port}/global/health`)
				if (res.ok) {
					log(`Server is still running on port ${this.port}`)
					this.ready = true
					return this.port
				}
			} catch {
				log(`Server not responding on port ${this.port}, starting new server`)
			}
			this.port = null
		}

		this.port = randomInt(30000, 40000)
		const port = this.port

		log(`Starting opencode serve on port ${port}...`)
		getOutputChannel().show()

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				logError("Timeout after 30 seconds waiting for opencode serve")
				this.stop()
				reject(new Error("Timeout waiting for opencode to start"))
			}, 30000)

			log(`Spawning: ${this.opencodePath} serve --port ${port}`)

			const proc = spawn(this.opencodePath, ["serve", "--port", port.toString()], {
				stdio: ["ignore", "pipe", "pipe"],
				detached: false,
			})

			this.process = proc

			let stderrBuffer = ""

			proc.stdout?.on("data", (data: Buffer) => {
				log(`[opencode stdout] ${data.toString().trim()}`)
			})

			proc.stderr?.on("data", (data: Buffer) => {
				const str = data.toString()
				stderrBuffer += str
				log(`[opencode stderr] ${str.trim()}`)
			})

			proc.on("error", (err: Error) => {
				logError("Failed to spawn opencode serve", err)
				clearTimeout(timeout)
				reject(err)
			})

			proc.on("exit", (code: number | null) => {
				log(`opencode serve exited with code ${code}`)
				if (!this.ready) {
					logError(`opencode exited before ready (code: ${code})`, new Error(stderrBuffer || "Unknown error"))
					clearTimeout(timeout)
					reject(new Error(`opencode exited with code ${code}`))
				}
			})

			log("Waiting for HTTP server...")
			this.waitForServer(port, timeout, resolve, reject)
		})
	}

	private async waitForServer(
		port: number,
		timeout: NodeJS.Timeout,
		resolve: (port: number) => void,
		reject: (err: Error) => void,
	): Promise<void> {
		let tries = 50
		let attempt = 0

		const check = async () => {
			attempt++

			if (tries <= 0) {
				logError(`HTTP check failed after ${attempt} attempts`)
				clearTimeout(timeout)
				this.stop()
				reject(new Error("Timeout waiting for opencode HTTP server"))
				return
			}

			tries--

			try {
				log(`Checking http://localhost:${port}/global/health (attempt ${attempt})...`)
				const res = await fetch(`http://localhost:${port}/global/health`)
				if (res.ok) {
					log(`HTTP server ready on port ${port}!`)
					this.ready = true
					await this.connectSSE(port)
					this.processRequestQueue()
					clearTimeout(timeout)
					resolve(port)
					return
				}
			} catch (err) {
				log(`Server not ready yet: ${err}`)
			}

			setTimeout(check, 200)
		}

		setTimeout(check, 500)
	}

	private queueRequest<T>(fn: () => Promise<T>): Promise<T> {
		return new Promise((resolve, reject) => {
			const wrapped = async () => {
				try {
					const result = await fn()
					resolve(result)
				} catch (err) {
					reject(err)
				}
			}
			this.requestQueue.push(wrapped)
		})
	}

	private async processRequestQueue(): Promise<void> {
		if (this.isProcessingQueue) return
		this.isProcessingQueue = true

		log(`Processing ${this.requestQueue.length} queued requests...`)

		while (this.requestQueue.length > 0) {
			const request = this.requestQueue.shift()
			if (request) {
				try {
					await request()
				} catch (err) {
					logError("Queued request failed:", err)
				}
			}
		}

		this.isProcessingQueue = false
	}

	private async connectSSE(port: number): Promise<void> {
		log(`Connecting to SSE endpoint... (reconnect delay: ${this.reconnectDelay}ms)`)

		try {
			this.abortController = new AbortController()

			const res = await fetch(`http://localhost:${port}/event`, {
				signal: this.abortController.signal,
				headers: {
					Accept: "text/event-stream",
				},
			})

			if (!res.ok) {
				throw new Error(`HTTP ${res.status}`)
			}

			if (!res.body) {
				throw new Error("No response body")
			}

			this.reconnectDelay = 1000
			log("SSE connection established")

			this.readSSEStream(port, res.body)
		} catch (err) {
			if ((err as Error).name === "AbortError") {
				log("SSE connection aborted")
				return
			}

			logError("SSE connection error", err)
			this.scheduleReconnect(port)
		}
	}

	private async readSSEStream(port: number, body: ReadableStream<Uint8Array>): Promise<void> {
		const reader = body.getReader()
		const decoder = new TextDecoder()
		let buffer = ""

		while (true) {
			const { done, value } = await reader.read()

			if (done) {
				log("SSE stream ended")
				break
			}

			buffer += decoder.decode(value, { stream: true })

			const lines = buffer.split("\n")
			buffer = lines.pop() || ""

			let eventData = ""
			for (const line of lines) {
				if (line.startsWith("data: ")) {
					eventData = line.slice(6)
				} else if (line === "" && eventData) {
					try {
						const event = JSON.parse(eventData) as ServerEvent
						this.handleEvent(event)
					} catch (err) {
						logError("Failed to parse SSE event", err)
					}
					eventData = ""
				}
			}
		}

		this.scheduleReconnect(port)
	}

	private scheduleReconnect(port: number): void {
		if (this.reconnectTimeout) {
			clearTimeout(this.reconnectTimeout)
		}

		log(`Scheduling SSE reconnect in ${this.reconnectDelay}ms`)

		this.reconnectTimeout = setTimeout(() => {
			if (this.ready) {
				this.connectSSE(port)
			}
		}, this.reconnectDelay)

		this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, this.maxReconnectDelay)
	}

	private handleEvent(event: ServerEvent): void {
		switch (event.type) {
			case "message.updated": {
				const info = event.properties.info
				if (info?.id && info?.role) {
					this.messageRoles.set(info.id, info.role)
					this.messageInfo.set(info.id, info)
				}
				break
			}

			case "message.part.updated": {
				const part = event.properties.part
				const sessionId = part.sessionID
				const messageId = part.messageID

				// Check if this is an assistant message
				const role = this.messageRoles.get(messageId)
				if (role !== "assistant") {
					return
				}

				const callback = this.onOperationCallbacks.get(sessionId)
				if (!callback) {
					return
				}

				const existingOp = this.activeOperations.get(part.id)

				if (!existingOp) {
					// Create new operation from part
					const messageInfo = this.messageInfo.get(messageId) || null
					const newOp = partToOperation(part, messageInfo)
					if (newOp) {
						this.activeOperations.set(part.id, newOp)
						callback(newOp)
					}
				} else {
					// Update existing operation
					const updatedOp = updateOperationFromPart(existingOp, part)
					if (updatedOp) {
						this.activeOperations.set(part.id, updatedOp)
						callback(updatedOp)
					}
				}
				break
			}

			case "message.part.delta": {
				const { sessionID, messageID, partID, field, delta } = event.properties

				// Check if this is an assistant message
				const role = this.messageRoles.get(messageID)
				if (role !== "assistant") {
					return
				}

				const callback = this.onOperationCallbacks.get(sessionID)
				if (!callback) {
					return
				}

				const existingOp = this.activeOperations.get(partID)
				// Only text and thinking operations have content that can be incrementally updated
				if (existingOp && field === "text" && (existingOp.type === "thinking" || existingOp.type === "text")) {
					const updatedOp = {
						...existingOp,
						content: (existingOp.content || "") + delta,
					}
					this.activeOperations.set(partID, updatedOp as Operation)
					callback(updatedOp as Operation)
				}
				break
			}

			case "message.part.removed": {
				const { sessionID, messageID, partID } = event.properties
				const existingOp = this.activeOperations.get(partID)
				if (existingOp) {
					this.activeOperations.delete(partID)
					const callback = this.onOperationCallbacks.get(sessionID)
					if (callback) {
						// Signal removal with a special update
						callback({ ...existingOp, status: "error" })
					}
				}
				break
			}

			case "session.status": {
				const { sessionID, status } = event.properties
				const callback = this.onSessionStatusCallbacks.get(sessionID)
				if (callback) {
					callback(status)
				}
				for (const globalCallback of this.onGlobalSessionStatusCallbacks) {
					globalCallback(sessionID, status)
				}
				if (status.type === "idle" && sessionID) {
					// Mark all active (pending or running) operations for this session as complete
					for (const [partId, op] of this.activeOperations.entries()) {
						if (op.sessionId === sessionID && (op.status === "pending" || op.status === "running")) {
							// Text operations (responses) stay expanded, thinking and tool operations collapse
							const shouldCollapse = op.type === "thinking" || op.type === "tool"
							const updatedOp: Operation = { ...op, status: "complete", expanded: !shouldCollapse }
							this.activeOperations.set(partId, updatedOp)
							const callback = this.onOperationCallbacks.get(sessionID)
							if (callback) {
								callback(updatedOp)
							}
						}
					}
				}
				break
			}

			case "session.error": {
				const { sessionID, error } = event.properties
				if (sessionID) {
					const errorOp = createErrorOperation(error, sessionID)
					const callback = this.onOperationCallbacks.get(sessionID)
					if (callback) {
						this.activeOperations.set(errorOp.id, errorOp)
						callback(errorOp)
					}
				}
				break
			}

			case "question.asked": {
				const question = event.properties
				const callback = this.onQuestionCallbacks.get(question.sessionID)
				if (callback) {
					callback(question)
				}
				break
			}

			case "question.replied":
			case "question.rejected": {
				const { requestID } = event.properties
				this.activeQuestions.delete(requestID)
				break
			}

			case "permission.asked": {
				const request = event.properties
				const callback = this.onPermissionCallbacks.get(request.sessionID)
				if (callback) {
					callback(request)
				}
				break
			}

			case "permission.replied": {
				break
			}

			case "todo.updated": {
				const { sessionID, todos } = event.properties
				const callback = this.onTodoCallbacks.get(sessionID)
				if (callback) {
					callback(todos)
				}
				break
			}

			case "server.connected":
			case "server.heartbeat":
				// Connection events - no action needed
				break
		}
	}

	async createSession(): Promise<Session> {
		if (!this.ready || !this.port) {
			log("Backend not ready, queuing createSession request")
			return this.queueRequest(() => this.createSession())
		}

		const res = await fetch(`http://localhost:${this.port}/session`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({}),
		})

		if (!res.ok) {
			throw new Error(`Failed to create session: ${res.status}`)
		}

		const session = (await res.json()) as Session
		return session
	}

	async listSessions(): Promise<Session[]> {
		if (!this.ready || !this.port) {
			return this.queueRequest(() => this.listSessions())
		}

		const res = await fetch(`http://localhost:${this.port}/session?limit=1000`)
		if (!res.ok) {
			throw new Error(`Failed to list sessions: ${res.status}`)
		}

		const sessions = (await res.json()) as Session[]
		return sessions
	}

	async getSessionStatuses(): Promise<Record<string, SessionStatus>> {
		if (!this.ready || !this.port) {
			return this.queueRequest(() => this.getSessionStatuses())
		}

		const res = await fetch(`http://localhost:${this.port}/session/status`)
		if (!res.ok) {
			throw new Error(`Failed to get session statuses: ${res.status}`)
		}

		return (await res.json()) as Record<string, SessionStatus>
	}

	onSessionStatus(sessionId: string, callback: (status: SessionStatus) => void): () => void {
		this.onSessionStatusCallbacks.set(sessionId, callback)
		return () => {
			this.onSessionStatusCallbacks.delete(sessionId)
		}
	}

	onGlobalSessionStatus(callback: (sessionId: string, status: SessionStatus) => void): () => void {
		this.onGlobalSessionStatusCallbacks.add(callback)
		return () => {
			this.onGlobalSessionStatusCallbacks.delete(callback)
		}
	}

	async loadSessionHistory(sessionId: string): Promise<{ info: MessageInfo; parts: Part[] }[]> {
		if (!this.ready || !this.port) {
			return this.queueRequest(() => this.loadSessionHistory(sessionId))
		}

		const res = await fetch(`http://localhost:${this.port}/session/${sessionId}/message`)
		if (!res.ok) {
			throw new Error(`Failed to load session history: ${res.status}`)
		}

		const messages = (await res.json()) as { info: MessageInfo; parts: Part[] }[]
		return messages
	}

	onSessionOperations(sessionId: string, callback: (op: Operation) => void): () => void {
		this.onOperationCallbacks.set(sessionId, callback)

		return () => {
			this.onOperationCallbacks.delete(sessionId)
		}
	}

	async getPendingQuestions(): Promise<QuestionRequest[]> {
		if (!this.ready || !this.port) {
			return this.queueRequest(() => this.getPendingQuestions())
		}

		const res = await fetch(`http://localhost:${this.port}/question`)
		if (!res.ok) {
			throw new Error(`Failed to get pending questions: ${res.status}`)
		}

		return (await res.json()) as QuestionRequest[]
	}

	private onQuestionCallbacks: Map<string, (question: QuestionRequest) => void> = new Map()
	private activeQuestions: Map<string, QuestionRequest> = new Map()
	private onPermissionCallbacks: Map<string, (req: PermissionRequest) => void> = new Map()

	onQuestion(sessionId: string, callback: (q: QuestionRequest) => void): () => void {
		this.onQuestionCallbacks.set(sessionId, callback)

		return () => {
			this.onQuestionCallbacks.delete(sessionId)
		}
	}

	async replyQuestion(requestId: string, answers: QuestionAnswer[]): Promise<void> {
		if (!this.ready || !this.port) {
			return this.queueRequest(() => this.replyQuestion(requestId, answers))
		}

		const res = await fetch(`http://localhost:${this.port}/question/${requestId}/reply`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ answers }),
		})

		if (!res.ok) {
			const error = await res.text()
			throw new Error(`Failed to reply to question: ${error}`)
		}
	}

	async rejectQuestion(requestId: string): Promise<void> {
		if (!this.ready || !this.port) {
			return this.queueRequest(() => this.rejectQuestion(requestId))
		}

		const res = await fetch(`http://localhost:${this.port}/question/${requestId}/reject`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
		})

		if (!res.ok) {
			const error = await res.text()
			throw new Error(`Failed to reject question: ${error}`)
		}
	}

	async getPendingPermissions(): Promise<PermissionRequest[]> {
		if (!this.ready || !this.port) {
			return this.queueRequest(() => this.getPendingPermissions())
		}

		const res = await fetch(`http://localhost:${this.port}/permission`)
		if (!res.ok) {
			throw new Error(`Failed to get pending permissions: ${res.status}`)
		}

		return (await res.json()) as PermissionRequest[]
	}

	onPermission(sessionId: string, callback: (req: PermissionRequest) => void): () => void {
		this.onPermissionCallbacks.set(sessionId, callback)

		return () => {
			this.onPermissionCallbacks.delete(sessionId)
		}
	}

	async replyPermission(requestID: string, reply: PermissionReply, message?: string): Promise<void> {
		if (!this.ready || !this.port) {
			return this.queueRequest(() => this.replyPermission(requestID, reply, message))
		}

		const res = await fetch(`http://localhost:${this.port}/permission/${requestID}/reply`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ reply, message }),
		})

		if (!res.ok) {
			const error = await res.text()
			throw new Error(`Failed to reply to permission: ${error}`)
		}
	}

	async sendMessage(sessionId: string, text: string, agent?: string): Promise<void> {
		if (!this.ready || !this.port) {
			return this.queueRequest(() => this.sendMessage(sessionId, text, agent))
		}

		const body: any = {
			parts: [{ type: "text", text }],
		}
		if (agent) {
			body.agent = agent
		}

		const res = await fetch(`http://localhost:${this.port}/session/${sessionId}/prompt_async`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		})

		if (!res.ok) {
			const errorBody = await res.text()
			throw new Error(`Failed to send message: ${res.status} - ${errorBody}`)
		}
	}

	stop(): void {
		if (this.reconnectTimeout) {
			clearTimeout(this.reconnectTimeout)
			this.reconnectTimeout = null
		}

		if (this.abortController) {
			this.abortController.abort()
			this.abortController = null
		}

		if (this.process) {
			this.process.kill()
			this.process = null
		}

		this.ready = false
		this.port = null
		this.reconnectDelay = 1000
		this.activeOperations.clear()
		this.onOperationCallbacks.clear()
		this.onSessionStatusCallbacks.clear()
		this.onGlobalSessionStatusCallbacks.clear()
		this.messageRoles.clear()
		this.messageInfo.clear()
	}

	isReady(): boolean {
		return this.ready
	}

	getPort(): number | null {
		return this.port
	}

	async getProviders(): Promise<Provider[]> {
		if (!this.ready || !this.port) {
			throw new Error("Backend not ready")
		}

		const res = await fetch(`http://localhost:${this.port}/provider`)
		if (!res.ok) {
			throw new Error(`Failed to fetch providers: ${res.status}`)
		}

		const data = (await res.json()) as { all: Provider[]; default: Record<string, string>; connected: string[] }

		// Mark providers as connected based on the connected array from backend
		const connectedIds = new Set(data.connected)
		return data.all.map((provider) => ({
			...provider,
			connected: connectedIds.has(provider.id),
		}))
	}

	async getConfig(): Promise<Config> {
		if (!this.ready || !this.port) {
			throw new Error("Backend not ready")
		}

		const res = await fetch(`http://localhost:${this.port}/global/config`)
		if (!res.ok) {
			throw new Error(`Failed to fetch config: ${res.status}`)
		}

		return (await res.json()) as Config
	}

	async updateConfig(config: Partial<Config>): Promise<void> {
		if (!this.ready || !this.port) {
			throw new Error("Backend not ready")
		}

		const res = await fetch(`http://localhost:${this.port}/global/config`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(config),
		})

		if (!res.ok) {
			throw new Error(`Failed to update config: ${res.status}`)
		}
	}

	async connectProvider(providerID: string, apiKey: string): Promise<void> {
		if (!this.ready || !this.port) {
			throw new Error("Backend not ready")
		}

		const res = await fetch(`http://localhost:${this.port}/auth/${providerID}`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				type: "api",
				key: apiKey,
			}),
		})

		if (!res.ok) {
			const error = await res.text()
			throw new Error(`Failed to connect provider: ${error}`)
		}
	}

	async disposeInstance(): Promise<void> {
		if (!this.ready || !this.port) {
			throw new Error("Backend not ready")
		}

		// Disposing the instance clears all cached state in the opencode backend,
		// including the Provider.state cache which holds auth data from auth.json.
		// Without this, changes to auth.json (like setting a new API key) won't be
		// reflected in subsequent API calls because the backend returns cached data.
		// This matches what the TUI does after auth changes.
		const res = await fetch(`http://localhost:${this.port}/instance/dispose`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
		})

		if (!res.ok) {
			const error = await res.text()
			throw new Error(`Failed to dispose instance: ${error}`)
		}
	}

	async cancelSession(sessionID: string): Promise<void> {
		if (!this.ready || !this.port) {
			return this.queueRequest(() => this.cancelSession(sessionID))
		}

		const res = await fetch(`http://localhost:${this.port}/session/${sessionID}/abort`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
		})

		if (!res.ok) {
			const error = await res.text()
			throw new Error(`Failed to cancel session: ${error}`)
		}
	}

	async getSession(sessionID: string): Promise<Session & { parentID?: string }> {
		if (!this.ready || !this.port) {
			return this.queueRequest(() => this.getSession(sessionID))
		}

		const res = await fetch(`http://localhost:${this.port}/session/${sessionID}`)
		if (!res.ok) {
			throw new Error(`Failed to get session: ${res.status}`)
		}

		return (await res.json()) as Session & { parentID?: string }
	}

	async getSessionChildren(sessionID: string): Promise<Session[]> {
		if (!this.ready || !this.port) {
			return this.queueRequest(() => this.getSessionChildren(sessionID))
		}

		const res = await fetch(`http://localhost:${this.port}/session/${sessionID}/children`)
		if (!res.ok) {
			throw new Error(`Failed to get session children: ${res.status}`)
		}

		return (await res.json()) as Session[]
	}

	async archiveSession(sessionID: string): Promise<void> {
		if (!this.ready || !this.port) {
			return this.queueRequest(() => this.archiveSession(sessionID))
		}

		const res = await fetch(`http://localhost:${this.port}/session/${sessionID}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				time: {
					archived: Date.now(),
				},
			}),
		})

		if (!res.ok) {
			throw new Error(`Failed to archive session: ${res.status}`)
		}
	}

	async unarchiveSession(sessionID: string): Promise<void> {
		if (!this.ready || !this.port) {
			return this.queueRequest(() => this.unarchiveSession(sessionID))
		}

		const res = await fetch(`http://localhost:${this.port}/session/${sessionID}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				time: {
					archived: 0,
				},
			}),
		})

		if (!res.ok) {
			throw new Error(`Failed to unarchive session: ${res.status}`)
		}
	}

	async deleteSession(sessionID: string): Promise<void> {
		if (!this.ready || !this.port) {
			return this.queueRequest(() => this.deleteSession(sessionID))
		}

		const res = await fetch(`http://localhost:${this.port}/session/${sessionID}`, {
			method: "DELETE",
		})

		if (!res.ok) {
			throw new Error(`Failed to delete session: ${res.status}`)
		}
	}

	async renameSession(sessionID: string, title: string): Promise<Session> {
		if (!this.ready || !this.port) {
			return this.queueRequest(() => this.renameSession(sessionID, title))
		}

		const res = await fetch(`http://localhost:${this.port}/session/${sessionID}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ title }),
		})

		if (!res.ok) {
			throw new Error(`Failed to rename session: ${res.status}`)
		}

		return (await res.json()) as Session
	}

	async getAgents(): Promise<{ name: string }[]> {
		if (!this.ready || !this.port) {
			return this.queueRequest(() => this.getAgents())
		}

		const res = await fetch(`http://localhost:${this.port}/agent`)
		if (!res.ok) {
			throw new Error(`Failed to get agents: ${res.status}`)
		}

		return (await res.json()) as { name: string }[]
	}

	async getSessionTodos(sessionID: string): Promise<TodoItem[]> {
		if (!this.ready || !this.port) {
			return this.queueRequest(() => this.getSessionTodos(sessionID))
		}

		const res = await fetch(`http://localhost:${this.port}/session/${sessionID}/todo`)
		if (!res.ok) {
			if (res.status === 404) {
				return []
			}
			throw new Error(`Failed to get session todos: ${res.status}`)
		}

		return (await res.json()) as TodoItem[]
	}

	onTodoUpdates(sessionID: string, callback: (todos: TodoItem[]) => void): () => void {
		this.onTodoCallbacks.set(sessionID, callback)
		return () => {
			this.onTodoCallbacks.delete(sessionID)
		}
	}

	unsubscribeFromTodoUpdates(sessionID: string): void {
		this.onTodoCallbacks.delete(sessionID)
	}
}

export const backend = new OpencodeBackend()
