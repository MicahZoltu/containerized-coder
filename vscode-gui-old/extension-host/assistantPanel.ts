import * as vscode from "vscode"
import { Operation, ExtToWebviewMsg, WebviewToExtMsg } from "./types/operations"
import type { PermissionReply } from "./types/backend"
import { OperationStore, InMemoryOperationStore } from "./operationStore"
import { backend } from "./opencodeBackend"
import { log, logError } from "./logger"
import { createStartOperation, createUserMessageOperation, partToOperation, createErrorOperation } from "./operationMapper"
import { DiffContentProvider } from "./diffProvider"

let panelCounter = 0

interface PanelSession {
	panelId: string
	sessionId: string
}

function computeEffectiveLastActivity(
	sessions: { id: string; parentID?: string; time: { updated: number } }[],
): Map<string, number> {
	const childrenByParent = new Map<string, typeof sessions>()
	for (const session of sessions) {
		if (!session.parentID) continue
		const existing = childrenByParent.get(session.parentID)
		if (existing) existing.push(session)
		else childrenByParent.set(session.parentID, [session])
	}

	const sessionMap = new Map(sessions.map((s) => [s.id, s]))
	const maxInTree = (sessionId: string): number => {
		const session = sessionMap.get(sessionId)
		if (!session) return 0
		let max = session.time.updated
		for (const child of childrenByParent.get(sessionId) || []) {
			max = Math.max(max, maxInTree(child.id))
		}
		return max
	}

	const result = new Map<string, number>()
	for (const session of sessions) {
		if (!session.parentID) {
			result.set(session.id, maxInTree(session.id))
		}
	}
	return result
}

export class AssistantPanel {
	public static readonly viewType = "opencodeAssistant"
	public readonly panelId: string
	private readonly panel: vscode.WebviewPanel
	private readonly store: OperationStore
	private disposables: vscode.Disposable[] = []
	private sessionId: string | null = null
	private sessionStatus: import("./types/backend").SessionStatus | null = null
	private isReady = false
	private isDisposed = false
	private unsubscribeFromBackend: (() => void) | null = null
	private unsubscribeFromGlobalStatus: (() => void) | null = null
	private unsubscribeFromStatus: (() => void) | null = null
	private unsubscribeFromTodos: (() => void) | null = null
	private unsubscribeFromPermissions: (() => void) | null = null
	private todoSidebarVisible: boolean

	private cleanupSubscriptions(): void {
		if (this.unsubscribeFromBackend) {
			this.unsubscribeFromBackend()
			this.unsubscribeFromBackend = null
		}
		if (this.unsubscribeFromStatus) {
			this.unsubscribeFromStatus()
			this.unsubscribeFromStatus = null
		}
		if (this.unsubscribeFromTodos) {
			this.unsubscribeFromTodos()
			this.unsubscribeFromTodos = null
		}
		if (this.unsubscribeFromPermissions) {
			this.unsubscribeFromPermissions()
			this.unsubscribeFromPermissions = null
		}
	}

	private messageQueue: ExtToWebviewMsg[] = []
	private pendingOperations: Operation[] = []
	private isLoadingHistory = false

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly onDispose?: () => void,
	) {
		this.panelId = `panel-${++panelCounter}`
		this.store = new InMemoryOperationStore()
		this.todoSidebarVisible = context.globalState.get<boolean>("opencode-todo-sidebar-visible") ?? false

		this.panel = vscode.window.createWebviewPanel(
			AssistantPanel.viewType,
			"OpenCode Assistant",
			vscode.ViewColumn.Beside,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "webview")],
			},
		)

		this.panel.webview.html = this.getWebviewContent()
		this.setupWebviewMessageHandling()
		this.setupPanelEventHandlers()
		this.setupGlobalStatusSubscription()

		// Initialize with sessions
		this.loadSessionsList()
	}

	private setupPanelEventHandlers(): void {
		this.panel.onDidDispose(() => {
			this.dispose()
			if (this.onDispose) {
				this.onDispose()
			}
		})
	}

	public reveal(): void {
		this.panel.reveal()
	}

	private async loadSessionsList(): Promise<void> {
		try {
			const [sessions, statuses] = await Promise.all([backend.listSessions(), backend.getSessionStatuses()])
			const effectiveTime = computeEffectiveLastActivity(sessions)
			const roots = sessions.filter((s) => !s.parentID)
			roots.sort((a, b) => (effectiveTime.get(b.id) || 0) - (effectiveTime.get(a.id) || 0))
			const sessionsWithStatus = roots.map((s) => ({
				...s,
				status: statuses[s.id],
			}))
			this.sendMessage({
				panelId: this.panelId,
				type: "setSessions",
				data: { sessions: sessionsWithStatus },
			})
		} catch (err) {
			logError("Failed to load sessions list:", err)
		}
	}

	private setupWebviewMessageHandling(): void {
		this.disposables.push(
			this.panel.webview.onDidReceiveMessage(async (message: WebviewToExtMsg) => {
				if (message.panelId !== this.panelId) return

				switch (message.type) {
					case "init":
						this.isReady = true
						this.flushMessageQueue()
						// Send initial state including sidebar visibility
						this.sendMessage({
							panelId: this.panelId,
							type: "init",
							data: { todoSidebarVisible: this.todoSidebarVisible },
						})
						if (this.sessionId) {
							await this.startBackendAndSetupSession(this.sessionId)
						} else {
							await this.initializeSession()
						}
						break

					case "submitPrompt":
						await this.handlePrompt(message.data.prompt, message.data.agent)
						break

					case "operationAction":
						await this.handleAction(message.data.operationId, message.data.actionId, message.data.filePath)
						break

					case "toggleCollapse":
						this.store.update(message.data.operationId, { expanded: message.data.expanded })
						break

					case "openModelSelector":
						await this.openModelSelector()
						break

					case "selectModel":
						await this.handleModelSelection(message.data.providerID, message.data.modelID)
						break

					case "connectProvider":
						await this.handleConnectProvider(message.data.providerID, message.data.apiKey)
						break

					case "cancelConnectProvider":
						// Close any API key input dialog
						break

					case "refreshModels":
						await this.refreshModels()
						break

					case "cancelSession":
						await this.handleCancelSession()
						break

					case "selectSession":
						await this.handleSelectSession(message.data.sessionId)
						break

					case "createSession":
						await this.handleCreateSession()
						break

					case "refreshSessions":
						await this.loadSessionsList()
						break

					case "switchToSession":
						await this.handleSwitchToSession(
							message.data.sessionId,
							message.data.parentSessionId,
							message.data.parentSessionTitle,
						)
						break

					case "archiveSession":
						await this.handleArchiveSession(message.data.sessionId)
						break

					case "unarchiveSession":
						await this.handleUnarchiveSession(message.data.sessionId)
						break

					case "deleteSession":
						await this.handleDeleteSession(message.data.sessionId)
						break

					case "renameSession":
						await this.handleRenameSession(message.data.sessionId, message.data.title)
						break

					case "requestRenameSession":
						await this.handleRequestRenameSession(message.data.sessionId, message.data.currentTitle)
						break

					case "answerQuestion":
						await this.handleAnswerQuestion(message.data.requestId, message.data.answers)
						break

					case "rejectQuestion":
						await this.handleRejectQuestion(message.data.requestId)
						break

					case "getQuestionRequestId": {
						const pendingQuestions = await backend.getPendingQuestions()
						const callToRequestId = new Map(
							pendingQuestions.filter((q) => q.tool?.callID).map((q) => [q.tool!.callID, q.id]),
						)
						const requestId = callToRequestId.get(message.data.callID) ?? null
						this.sendMessage({
							panelId: this.panelId,
							type: "questionRequestId",
							data: { callID: message.data.callID, requestId },
						})
						break
					}

					case "toggleTodoSidebar":
						this.todoSidebarVisible = message.data.visible
						await this.context.globalState.update("opencode-todo-sidebar-visible", this.todoSidebarVisible)
						break

					case "replyPermission":
						await this.handleReplyPermission(message.data.requestID, message.data.reply, message.data.message)
						break
				}
			}),
		)
	}

	private async handleCancelSession(): Promise<void> {
		if (!this.sessionId) {
			log("No session to cancel")
			return
		}

		try {
			await backend.cancelSession(this.sessionId)
			this.sendMessage({
				panelId: this.panelId,
				type: "setCancelButtonVisible",
				data: { visible: false },
			})
		} catch (err) {
			logError("Failed to cancel session:", err)
		}
	}

	private async handleSelectSession(sessionId: string): Promise<void> {
		try {
			this.cleanupSubscriptions()

			this.sessionStatus = null
			this.updateCancelButtonVisibility()

			this.store.clear()
			this.sendMessage({
				panelId: this.panelId,
				type: "setOperations",
				data: { operations: [] },
			})

			this.pendingOperations = []

			await backend.start()
			this.isLoadingHistory = true
			this.setupSession(sessionId)

			const [sessionInfo, statuses] = await Promise.all([backend.getSession(sessionId), backend.getSessionStatuses()])

			this.sessionStatus = statuses[sessionId] ?? { type: "idle" }
			this.updateCancelButtonVisibility()

			this.sessionId = sessionId

			const messages = await backend.loadSessionHistory(sessionId)

			let lastAgent: string | undefined
			for (let i = messages.length - 1; i >= 0; i--) {
				if (messages[i].info.role === "user") {
					lastAgent = messages[i].info.agent
					break
				}
			}

			this.sendMessage({
				panelId: this.panelId,
				type: "setCurrentSession",
				data: { sessionId, title: sessionInfo.title, agent: lastAgent },
			})

			// Fetch TODOs for this session
			try {
				const todos = await backend.getSessionTodos(sessionId)
				this.sendMessage({
					panelId: this.panelId,
					type: "setTodos",
					data: { todos },
				})
			} catch (err) {
				logError("Failed to fetch TODOs:", err)
			}

			// Subscribe to TODO updates
			this.unsubscribeFromTodos = backend.onTodoUpdates(sessionId, (todos) => {
				this.sendMessage({
					panelId: this.panelId,
					type: "setTodos",
					data: { todos },
				})
			})

			// Convert messages to operations
			const operations: Operation[] = []
			for (const msg of messages) {
				// Check if this is a user message
				if (msg.info.role === "user") {
					// Extract text content from text parts
					const textParts = msg.parts.filter((p) => p.type === "text") as { text: string }[]
					const content = textParts.map((p) => p.text).join("")
					if (content) {
						const userOp = createUserMessageOperation(
							sessionId,
							content,
							msg.info.model,
							msg.info.agent,
							msg.info.time.created,
						)
						userOp.expanded = false
						operations.push(userOp)
						this.store.add(userOp)
					}
				} else {
					// Process assistant message parts
					for (const part of msg.parts) {
						const op = partToOperation(part, msg.info)
						if (op) {
							// Collapse historic operations
							op.expanded = false
							operations.push(op)
							this.store.add(op)
						}
					}

					// Check if this assistant message has an error
					if (msg.info.error) {
						const errorOp = createErrorOperation(msg.info.error, sessionId, msg.info.id)
						errorOp.expanded = true
						operations.push(errorOp)
						this.store.add(errorOp)
					}
				}
			}

			// Send operations to webview
			this.sendMessage({
				panelId: this.panelId,
				type: "setOperations",
				data: { operations },
			})

			// Done loading - process any events that arrived during loading
			this.isLoadingHistory = false
			this.processPendingOperations()

			// Fetch pending permissions for this session AFTER setOperations
			// so they don't get cleared when container is emptied
			try {
				const permissions = await backend.getPendingPermissions()
				for (const perm of permissions.filter((p) => p.sessionID === sessionId)) {
					this.sendMessage({
						panelId: this.panelId,
						type: "permissionRequest",
						data: perm,
					})
				}
			} catch (err) {
				logError("Failed to fetch pending permissions:", err)
			}

			// Send current model info
			await this.sendCurrentModelInfo()

			// Check if this session has a parent and send that info
			await this.updateParentSessionInfo(sessionId)
		} catch (err) {
			this.isLoadingHistory = false
			logError("Failed to switch session:", err)
		}
	}

	private async handleSwitchToSession(
		sessionId: string,
		parentSessionId?: string,
		parentSessionTitle?: string,
	): Promise<void> {
		await this.handleSelectSession(sessionId)
	}

	private async updateParentSessionInfo(sessionId: string): Promise<void> {
		try {
			const session = await backend.getSession(sessionId)
			if (session.parentID) {
				const parentSession = await backend.getSession(session.parentID)
				this.sendMessage({
					panelId: this.panelId,
					type: "setParentSession",
					data: {
						parentId: session.parentID,
						parentTitle: parentSession.title,
					},
				})
			} else {
				this.sendMessage({
					panelId: this.panelId,
					type: "setParentSession",
					data: { parentId: null },
				})
			}
		} catch (err) {
			logError("Failed to get parent session info:", err)
			this.sendMessage({
				panelId: this.panelId,
				type: "setParentSession",
				data: { parentId: null },
			})
		}
	}

	private async handleCreateSession(): Promise<void> {
		try {
			this.cleanupSubscriptions()

			this.store.clear()
			this.sendMessage({
				panelId: this.panelId,
				type: "setTodos",
				data: { todos: [] },
			})
			this.sendMessage({
				panelId: this.panelId,
				type: "setOperations",
				data: { operations: [] },
			})

			const session = await backend.createSession()
			this.sessionId = session.id

			const agents = await backend.getAgents()
			const defaultAgent = agents[0]?.name

			const startOp = createStartOperation(session.id)
			this.store.add(startOp)
			this.sendMessage({
				panelId: this.panelId,
				type: "addOperation",
				data: startOp,
			})

			this.sendMessage({
				panelId: this.panelId,
				type: "setCurrentSession",
				data: { sessionId: session.id, title: session.title, agent: defaultAgent },
			})

			this.setupSession(session.id)

			this.sessionStatus = { type: "idle" }
			this.updateCancelButtonVisibility()

			// Reload sessions list
			await this.loadSessionsList()

			// Send current model info
			await this.sendCurrentModelInfo()

			// New sessions don't have parents
			this.sendMessage({
				panelId: this.panelId,
				type: "setParentSession",
				data: { parentId: null },
			})
		} catch (err) {
			logError("Failed to create session:", err)
		}
	}

	private async handleArchiveSession(sessionId: string): Promise<void> {
		try {
			await backend.archiveSession(sessionId)
			// Refresh the sessions list
			await this.loadSessionsList()
			// If we archived the current session, switch to another
			if (this.sessionId === sessionId) {
				const sessions = await backend.listSessions()
				const roots = sessions.filter((s) => !s.parentID && !s.time.archived)
				if (roots.length > 0) {
					const effectiveTime = computeEffectiveLastActivity(sessions)
					roots.sort((a, b) => (effectiveTime.get(b.id) || 0) - (effectiveTime.get(a.id) || 0))
					await this.handleSelectSession(roots[0].id)
				} else {
					// No active sessions, create a new one
					await this.handleCreateSession()
				}
			}
		} catch (err) {
			logError("Failed to archive session:", err)
		}
	}

	private async handleDeleteSession(sessionId: string): Promise<void> {
		try {
			await backend.deleteSession(sessionId)
			// Refresh the sessions list
			await this.loadSessionsList()
		} catch (err) {
			logError("Failed to delete session:", err)
		}
	}

	private async handleRenameSession(sessionId: string, title: string): Promise<void> {
		try {
			const session = await backend.renameSession(sessionId, title)
			// Refresh the sessions list
			await this.loadSessionsList()
			// If we renamed the current session, update the label
			if (this.sessionId === sessionId) {
				this.sendMessage({
					panelId: this.panelId,
					type: "setCurrentSession",
					data: { sessionId, title: session.title },
				})
			}
		} catch (err) {
			logError("Failed to rename session:", err)
		}
	}

	private async handleRequestRenameSession(sessionId: string, currentTitle: string): Promise<void> {
		const newTitle = await vscode.window.showInputBox({
			prompt: "Rename session",
			value: currentTitle,
		})
		if (newTitle && newTitle !== currentTitle) {
			await this.handleRenameSession(sessionId, newTitle)
		}
	}

	private async handleAnswerQuestion(requestId: string, answers: string[][]): Promise<void> {
		try {
			await backend.replyQuestion(requestId, answers)
		} catch (err) {
			logError("Failed to answer question:", err)
		}
	}

	private async handleRejectQuestion(requestId: string): Promise<void> {
		try {
			log(`Rejecting question: ${requestId}`)
			await backend.rejectQuestion(requestId)
		} catch (err) {
			logError("Failed to reject question:", err)
		}
	}

	private async handleReplyPermission(requestID: string, reply: PermissionReply, message?: string): Promise<void> {
		try {
			await backend.replyPermission(requestID, reply, message)
		} catch (err) {
			logError("Failed to reply to permission:", err)
		}
	}

	private async handleUnarchiveSession(sessionId: string): Promise<void> {
		try {
			await backend.unarchiveSession(sessionId)
			// Refresh the sessions list
			await this.loadSessionsList()
		} catch (err) {
			logError("Failed to unarchive session:", err)
		}
	}

	private async startBackendAndSetupSession(sessionId: string): Promise<void> {
		try {
			await backend.start()
			this.setupSession(sessionId)
			await this.sendCurrentModelInfo()
		} catch (err) {
			logError("Failed to start backend for restored session:", err)
			this.sessionId = null
			await this.initializeSession()
		}
	}

	private async initializeSession(): Promise<void> {
		try {
			// Start backend if not already running
			const port = await backend.start()
			log(`Backend running on port ${port}`)

			// Try to get existing sessions first
			const sessions = await backend.listSessions()
			const roots = sessions.filter((s) => !s.parentID)
			if (roots.length > 0) {
				const effectiveTime = computeEffectiveLastActivity(sessions)
				roots.sort((a, b) => (effectiveTime.get(b.id) || 0) - (effectiveTime.get(a.id) || 0))
				const mostRecentSession = roots[0]

				// Load the most recent session
				await this.handleSelectSession(mostRecentSession.id)
				return
			}

			// No existing sessions - create new one
			const session = await backend.createSession()
			this.sessionId = session.id

			// Get default agent for new session
			const agents = await backend.getAgents()
			const defaultAgent = agents[0]?.name

			// Save session
			this.saveSessionToStorage()

			// Setup session
			this.setupSession(session.id)

			// New sessions are always idle
			this.sessionStatus = { type: "idle" }
			this.updateCancelButtonVisibility()

			// Send current session info with default agent
			this.sendMessage({
				panelId: this.panelId,
				type: "setCurrentSession",
				data: { sessionId: session.id, title: session.title, agent: defaultAgent },
			})

			// Send current model info to update the UI
			await this.sendCurrentModelInfo()

			// Check if session has a parent
			await this.updateParentSessionInfo(session.id)

			// Add start marker
			this.addOperation(createStartOperation(session.id))
		} catch (err) {
			logError("Failed to initialize session:", err)
			// Show error in UI
			this.sendMessage({
				panelId: this.panelId,
				type: "addOperation",
				data: {
					id: `error-${Date.now()}`,
					type: "error",
					title: "Error",
					error: err instanceof Error ? err.message : "Failed to initialize",
					errorType: "UnknownError",
					timestamp: Date.now(),
					expanded: true,
					status: "error",
					sessionId: this.sessionId || "unknown",
					messageId: this.sessionId || "unknown",
					partId: `error-${Date.now()}`,
				} as Operation,
			})
		}
	}

	private setupSession(sessionId: string): void {
		this.unsubscribeFromBackend = backend.onSessionOperations(sessionId, (op) => {
			if (this.isDisposed) {
				return
			}

			if (this.isLoadingHistory) {
				this.pendingOperations.push(op)
				return
			}

			const existing = this.store.get(op.id)
			if (existing) {
				this.updateOperation(op.id, { ...op })
			} else {
				this.addOperation(op)
			}
		})

		this.unsubscribeFromStatus = backend.onSessionStatus(sessionId, (status) => {
			if (this.isDisposed) {
				return
			}

			this.sessionStatus = status
			this.updateCancelButtonVisibility()

			if (status.type === "idle") {
				this.markActiveOperationsComplete()
			}
		})

		this.unsubscribeFromPermissions = backend.onPermission(sessionId, (req) => {
			if (this.isDisposed) {
				return
			}

			this.sendMessage({
				panelId: this.panelId,
				type: "permissionRequest",
				data: req,
			})
		})
	}

	private setupGlobalStatusSubscription(): void {
		this.unsubscribeFromGlobalStatus = backend.onGlobalSessionStatus((sessionId, status) => {
			if (this.isDisposed) return
			this.sendMessage({
				panelId: this.panelId,
				type: "updateSessionStatus",
				data: { sessionId, status },
			})
		})
	}

	private processPendingOperations(): void {
		for (const op of this.pendingOperations) {
			// Check if operation already exists (might have been loaded from history)
			const existing = this.store.get(op.id)
			if (existing) {
				// Update with the latest data
				this.updateOperation(op.id, { ...op })
			} else {
				// Add new operation
				this.addOperation(op)
			}
		}

		// Clear the buffer
		this.pendingOperations = []
	}

	private saveSessionToStorage(): void {
		if (!this.sessionId) return

		const sessions = this.getSessionsFromStorage()
		sessions.push({
			panelId: this.panelId,
			sessionId: this.sessionId,
		})

		this.context.globalState.update("opencode-gui-sessions", sessions)
	}

	private getSessionsFromStorage(): PanelSession[] {
		return this.context.globalState.get<PanelSession[]>("opencode-gui-sessions") || []
	}

	private removeSessionFromStorage(): void {
		const sessions = this.getSessionsFromStorage()
		const updated = sessions.filter((s) => s.panelId !== this.panelId)
		this.context.globalState.update("opencode-gui-sessions", updated)
	}

	private restoreSession(): void {
		const sessions = this.getSessionsFromStorage()
		const session = sessions.find((s) => s.panelId === this.panelId)

		if (session) {
			this.sessionId = session.sessionId
			log(`Restored session: ${session.sessionId}`)
		}
	}

	public addOperation(op: Operation): void {
		this.store.add(op)
		this.sendMessage({
			panelId: this.panelId,
			type: "addOperation",
			data: op,
		})
	}

	public updateOperation(id: string, updates: Partial<Operation>): void {
		const existing = this.store.get(id)
		if (!existing) return

		this.store.update(id, updates)

		this.sendMessage({
			panelId: this.panelId,
			type: "updateOperation",
			data: { id, updates },
		})
	}

	private updateCancelButtonVisibility(): void {
		const isBusy = this.sessionStatus?.type === "busy" || this.sessionStatus?.type === "retry"
		this.sendMessage({
			panelId: this.panelId,
			type: "setCancelButtonVisible",
			data: { visible: isBusy ?? false },
		})
	}

	private markActiveOperationsComplete(): void {
		for (const op of this.store.getAll()) {
			if (op.status === "pending" || op.status === "running") {
				this.store.update(op.id, { status: "complete" })
				this.sendMessage({
					panelId: this.panelId,
					type: "updateOperation",
					data: { id: op.id, updates: { status: "complete" } },
				})
			}
		}
	}

	public removeOperation(id: string): void {
		this.store.remove(id)
		this.sendMessage({
			panelId: this.panelId,
			type: "removeOperation",
			data: { id },
		})
	}

	private async getCurrentModel(): Promise<{ providerID: string; modelID: string } | null> {
		try {
			const config = await backend.getConfig()
			if (config.model) {
				const [providerID, ...rest] = config.model.split("/")
				return { providerID, modelID: rest.join("/") }
			}
		} catch (err) {
			logError("Failed to get current model:", err)
		}
		return null
	}

	private async handlePrompt(prompt: string, agent?: string): Promise<void> {
		if (!this.sessionId) {
			logError("No session available")
			this.sendMessage({
				panelId: this.panelId,
				type: "addOperation",
				data: {
					id: `error-${Date.now()}`,
					type: "error",
					title: "Error",
					error: "Session not initialized",
					errorType: "UnknownError",
					timestamp: Date.now(),
					expanded: true,
					status: "error",
					sessionId: "unknown",
					messageId: "unknown",
					partId: `error-${Date.now()}`,
				} as Operation,
			})
			return
		}

		// Add user message operation
		const model = await this.getCurrentModel()
		this.addOperation(createUserMessageOperation(this.sessionId, prompt, model || undefined, agent))

		try {
			await backend.sendMessage(this.sessionId, prompt, agent)
		} catch (err) {
			logError("Failed to send prompt:", err)
			this.sendMessage({
				panelId: this.panelId,
				type: "addOperation",
				data: {
					id: `error-${Date.now()}`,
					type: "error",
					title: "Error",
					error: err instanceof Error ? err.message : "Failed to send message",
					errorType: "UnknownError",
					timestamp: Date.now(),
					expanded: true,
					status: "error",
					sessionId: this.sessionId,
					messageId: this.sessionId,
					partId: `error-${Date.now()}`,
				} as Operation,
			})
		}
	}

	private async handleAction(_operationId: string, _actionId: string, _filePath?: string): Promise<void> {
		log(`Handling action: ${_actionId} on operation: ${_operationId}`)

		const operation = this.store.get(_operationId)
		if (!operation) {
			logError(`Operation not found: ${_operationId}`)
			return
		}

		switch (_actionId) {
			case "openFile":
				if (_filePath) {
					await this.openFileInEditor(_filePath)
				}
				break
			case "viewDiff":
				if (operation.type === "tool" && operation.metadata?.filediff) {
					await this.openDiffViewer(operation)
				}
				break
			default:
				log(`Unknown action: ${_actionId}`)
		}
	}

	private async openFileInEditor(filePath: string): Promise<void> {
		try {
			const doc = await vscode.workspace.openTextDocument(filePath)
			await vscode.window.showTextDocument(doc, { preview: false })
			log(`Opened file: ${filePath}`)
		} catch (err) {
			logError(`Failed to open file: ${filePath}`, err)
			vscode.window.showErrorMessage(`Failed to open file: ${filePath}`)
		}
	}

	private async openDiffViewer(operation: Operation): Promise<void> {
		if (operation.type !== "tool" || !operation.metadata?.filediff) {
			return
		}

		const filediff = operation.metadata.filediff
		const opId = operation.id

		// Register with diff provider
		const diffProvider = DiffContentProvider.getInstance()
		diffProvider.registerDiff(opId, filediff.file, filediff.before, filediff.after)

		// Open the diff view
		await diffProvider.showDiff(opId, filediff.file)
	}

	private sendMessage(message: ExtToWebviewMsg): void {
		if (this.isDisposed) return
		if (this.isReady) {
			this.panel.webview.postMessage(message)
		} else {
			this.messageQueue.push(message)
		}
	}

	private flushMessageQueue(): void {
		while (this.messageQueue.length > 0) {
			const message = this.messageQueue.shift()
			if (message) this.panel.webview.postMessage(message)
		}
	}

	private async sendCurrentModelInfo(): Promise<void> {
		try {
			const model = await this.getCurrentModel()
			if (!model) return

			const providers = await backend.getProviders()
			const provider = providers.find((p) => p.id === model.providerID)
			const modelInfo = provider?.models[model.modelID]
			if (modelInfo) {
				this.sendMessage({
					panelId: this.panelId,
					type: "setSessionModel",
					data: { providerID: model.providerID, modelID: model.modelID, modelName: modelInfo.name },
				})
			}
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : "Failed to retrieve model information"
			logError("Failed to get current model info:", err)
			vscode.window.showErrorMessage(`OpenCode: ${errorMessage}`)
		}
	}

	private async openModelSelector(): Promise<void> {
		try {
			const [providers, config] = await Promise.all([backend.getProviders(), backend.getConfig()])

			this.sendMessage({
				panelId: this.panelId,
				type: "setAvailableModels",
				data: { providers },
			})
		} catch (err) {
			logError("Failed to open model selector:", err)
		}
	}

	private async handleModelSelection(providerID: string, modelID: string): Promise<void> {
		try {
			const modelRef = `${providerID}/${modelID}`
			await backend.updateConfig({ model: modelRef })

			const providers = await backend.getProviders()
			const provider = providers.find((p) => p.id === providerID)
			const model = provider?.models[modelID]

			if (model) {
				this.sendMessage({
					panelId: this.panelId,
					type: "setSessionModel",
					data: { providerID, modelID, modelName: model.name },
				})
			}
		} catch (err) {
			logError("Failed to select model:", err)
		}
	}

	private async handleConnectProvider(providerID: string, apiKey: string): Promise<void> {
		try {
			await backend.connectProvider(providerID, apiKey)

			// CRITICAL: We must dispose the instance after setting auth credentials.
			// The opencode backend caches provider state (including auth data from auth.json).
			// Without disposing the instance, subsequent calls to get providers will return
			// stale cached data that doesn't include the newly connected provider.
			// This matches the TUI's behavior which calls instance.dispose() after auth changes.
			await backend.disposeInstance()

			await this.refreshModels()
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : "Unknown error"
			this.sendMessage({
				panelId: this.panelId,
				type: "providerConnectionError",
				data: { providerID, error: errorMessage },
			})
		}
	}

	private async refreshModels(): Promise<void> {
		try {
			const providers = await backend.getProviders()
			this.sendMessage({
				panelId: this.panelId,
				type: "setAvailableModels",
				data: { providers },
			})
		} catch (err) {
			logError("Failed to refresh models:", err)
		}
	}

	private getWebviewContent(): string {
		const webviewUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "webview"))

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>OpenCode Assistant</title>
	<link rel="stylesheet" href="${webviewUri}/vscode-markdown.css">
	<link rel="stylesheet" href="${webviewUri}/vscode-highlight.css">
	<link rel="stylesheet" href="${webviewUri}/styles.css">
</head>
<body>
	<div id="top-bar">
		<div id="session-selector">
			<div id="session-dropdown-container">
				<div id="session-dropdown-trigger" class="dropdown-trigger">
					<span id="session-dropdown-label">Loading sessions...</span>
					<span class="dropdown-arrow">▼</span>
				</div>
				<div id="session-dropdown-menu" class="dropdown-menu" style="display: none;">
					<div id="session-list-active" class="session-list-section"></div>
					<div id="session-list-separator" class="session-list-separator" style="display: none;"></div>
					<div id="session-list-trashed" class="session-list-section"></div>
				</div>
			</div>
			<button id="rename-session-btn" class="topbar-icon-btn">✏️</button>
			<button id="refresh-sessions-btn" class="topbar-icon-btn">↻</button>
			<button id="new-session-btn" class="topbar-icon-btn">➕</button>
		</div>
	</div>
	<div id="operations-container"></div>
	<div id="jump-to-bottom" style="display: none;">Jump to bottom</div>
	<div id="input-area">
		<textarea id="prompt-input" placeholder="Ask a question..."></textarea>
		<div id="bottom-button-bar">
			<div id="bottom-left-buttons">
				<div id="mode-toggle">
					<button class="mode-btn active" data-mode="build" title="Build mode">Build</button>
					<button class="mode-btn" data-mode="plan" title="Plan mode">Plan</button>
					<button class="mode-btn" data-mode="docs" title="Docs mode">Docs</button>
				</div>
			</div>
			<div id="bottom-center-buttons">
				<button id="model-selector-btn" class="mode-btn" title="Select AI model">
					<span>🤖</span>
					<span id="current-model-label">Model</span>
				</button>
			</div>
			<div id="bottom-right-buttons">
				<button id="cancel-btn" style="display: none;">⏹ Cancel</button>
				<button id="submit-btn">Submit</button>
			</div>
		</div>
	</div>

	<!-- TODO Sidebar -->
	<div id="todo-sidebar">
		<div class="todo-header">
			<h3>Tasks</h3>
			<span class="todo-count"><span id="todo-active-count">0</span> active</span>
			<button id="todo-toggle-btn" class="topbar-icon-btn">
				<span id="todo-icon">📋</span>
				<span id="todo-badge" class="todo-badge" style="display: none;">0</span>
			</button>
		</div>
		<div id="todo-list" class="todo-list"></div>
	</div>

	<!-- Fixed TODO toggle button (visible when sidebar is closed) -->
	<button id="todo-toggle-fixed" class="topbar-icon-btn">
		<span id="todo-icon-fixed">📋</span>
	</button>

	<!-- Model Selector Modal -->
	<div id="model-selector-modal" class="modal" style="display: none;">
		<div class="modal-backdrop"></div>
		<div class="modal-content">
			<div class="modal-header">
				<h3>Select Model</h3>
				<button id="modal-close" class="modal-close-btn">✕</button>
			</div>
			<div class="modal-body">
				<input type="text" id="model-search" placeholder="Search models..." class="search-input">
				<div id="model-list" class="model-list"></div>
				<div id="unconnected-providers" class="unconnected-providers"></div>
				<div id="api-key-form" class="api-key-form" style="display: none;">
					<p class="api-key-prompt"></p>
					<input type="password" id="api-key-input" placeholder="Enter API key...">
					<div class="api-key-actions">
						<button id="api-key-cancel" class="secondary-btn">Cancel</button>
						<button id="api-key-submit">Connect</button>
					</div>
					<div id="api-key-error" class="error-message"></div>
				</div>
			</div>
		</div>
	</div>

	<script src="${webviewUri}/dependencies/marked.min.js"></script>
	<script src="${webviewUri}/dependencies/highlight.min.js"></script>
	<script type="module" src="${webviewUri}/js/app.js"></script>
	<script>
		// Non-module script to ensure init is called after modules load
		window.addEventListener('load', function() {
			if (window.initPanel) {
				window.initPanel('${this.panelId}')
			} else {
				console.error('[OpenCode GUI] initPanel not found on window')
			}
		})
	</script>
</body>
</html>`
	}

	public dispose(): void {
		if (this.isDisposed) return

		this.isDisposed = true

		if (this.unsubscribeFromBackend) {
			this.unsubscribeFromBackend()
			this.unsubscribeFromBackend = null
		}

		if (this.unsubscribeFromGlobalStatus) {
			this.unsubscribeFromGlobalStatus()
			this.unsubscribeFromGlobalStatus = null
		}

		if (this.unsubscribeFromStatus) {
			this.unsubscribeFromStatus()
			this.unsubscribeFromStatus = null
		}

		this.removeSessionFromStorage()

		for (const item of this.disposables) {
			item.dispose()
		}

		this.store.clear()
	}
}
