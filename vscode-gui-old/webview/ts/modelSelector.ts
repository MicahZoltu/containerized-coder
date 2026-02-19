import { showTooltip as showSharedTooltip, hideTooltip as hideSharedTooltip, escapeHtml } from "./tooltip.js"

// Type definitions
interface Provider {
	id: string
	name: string
	source: "env" | "config" | "custom" | "api"
	env: string[]
	key?: string
	options: Record<string, unknown>
	models: Record<string, Model>
	connected: boolean
	auth?: {
		type: "oauth" | "apikey"
		scopes?: string[]
	}
}

interface Model {
	id: string
	name: string
	providerID: string
	description?: string
	cost?: {
		input: number
		output: number
	}
	contextWindow?: number
}

// State
let providers: Provider[] = []
let selectedModel: { providerID: string; modelID: string } | null = null
let searchQuery = ""
let currentProviderForConnection: string | null = null
let isConnecting = false
let panelId: string | null = null
let vscode: { postMessage(message: unknown): void } | null = null

// DOM elements
const modal = document.getElementById("model-selector-modal") as HTMLDivElement
const modelSelectorBtn = document.getElementById("model-selector-btn") as HTMLButtonElement
const currentModelLabel = document.getElementById("current-model-label") as HTMLSpanElement
const closeBtn = document.getElementById("modal-close") as HTMLButtonElement
const searchInput = document.getElementById("model-search") as HTMLInputElement
const modelList = document.getElementById("model-list") as HTMLDivElement
const unconnectedProviders = document.getElementById("unconnected-providers") as HTMLDivElement
const apiKeyForm = document.getElementById("api-key-form") as HTMLDivElement
const apiKeyInput = document.getElementById("api-key-input") as HTMLInputElement
const apiKeySubmit = document.getElementById("api-key-submit") as HTMLButtonElement
const apiKeyCancel = document.getElementById("api-key-cancel") as HTMLButtonElement
const apiKeyError = document.getElementById("api-key-error") as HTMLDivElement
const apiKeyPrompt = document.querySelector(".api-key-prompt") as HTMLParagraphElement

// Initialize
export function initModelSelector(panelIdValue: string, vscodeInstance: { postMessage(message: unknown): void }): void {
	panelId = panelIdValue
	vscode = vscodeInstance

	// Event listeners
	modelSelectorBtn.addEventListener("click", openModal)
	closeBtn.addEventListener("click", closeModal)
	document.querySelector(".modal-backdrop")?.addEventListener("click", closeModal)

	searchInput.addEventListener("input", (e) => {
		searchQuery = (e.target as HTMLInputElement).value.toLowerCase()
		renderModelList()
		renderUnconnectedProviders()
	})

	apiKeySubmit.addEventListener("click", submitApiKey)
	apiKeyCancel.addEventListener("click", cancelApiKey)
	apiKeyInput.addEventListener("keydown", (e) => {
		if (e.key === "Enter") submitApiKey()
		if (e.key === "Escape") cancelApiKey()
	})

	// Keyboard shortcut to close modal
	document.addEventListener("keydown", (e) => {
		if (e.key === "Escape" && modal.style.display !== "none") {
			if (apiKeyForm.style.display !== "none") {
				cancelApiKey()
			} else {
				closeModal()
			}
		}
	})
}

export function setProviders(data: { providers: Provider[] }): void {
	providers = data.providers
	renderModelList()
	renderUnconnectedProviders()

	// If we were connecting a provider, check if it's now connected
	if (currentProviderForConnection && isConnecting) {
		const connectedProvider = providers.find((p) => p.id === currentProviderForConnection && p.connected)
		if (connectedProvider) {
			isConnecting = false
			currentProviderForConnection = null
			apiKeyForm.style.display = "none"
			modelList.style.display = "block"
			unconnectedProviders.style.display = "block"
			apiKeyError.style.display = "none"
			apiKeyInput.value = ""
			searchInput.focus()
		}
	}
}

export function setSelectedModel(data: { providerID: string; modelID: string; modelName: string }): void {
	selectedModel = { providerID: data.providerID, modelID: data.modelID }
	currentModelLabel.textContent = data.modelName
	hideSharedTooltip()
	renderModelList()
	closeModal()
}

export function showApiKeyPrompt(data: { providerID: string; providerName: string; error?: string }): void {
	currentProviderForConnection = data.providerID
	isConnecting = false
	apiKeySubmit.disabled = false
	apiKeySubmit.textContent = "Connect"
	apiKeyPrompt.textContent = `Enter API key for ${data.providerName}:`
	apiKeyError.textContent = data.error || ""
	apiKeyError.style.display = data.error ? "block" : "none"
	apiKeyInput.value = ""
	apiKeyForm.style.display = "block"
	modelList.style.display = "none"
	unconnectedProviders.style.display = "none"
	apiKeyInput.focus()
}

export function showConnectionError(data: { providerID: string; error: string }): void {
	if (currentProviderForConnection === data.providerID) {
		isConnecting = false
		apiKeySubmit.disabled = false
		apiKeySubmit.textContent = "Connect"
		apiKeyError.textContent = data.error
		apiKeyError.style.display = "block"
	}
}

function openModal(): void {
	// Clear cached providers to ensure fresh fetch
	providers = []
	renderModelList()
	renderUnconnectedProviders()

	if (panelId && vscode) {
		vscode.postMessage({
			panelId,
			type: "openModelSelector",
			data: {},
		})
	}

	modal.style.display = "flex"
	searchInput.value = ""
	searchQuery = ""
	apiKeyForm.style.display = "none"
	modelList.style.display = "block"
	unconnectedProviders.style.display = "block"
	apiKeyError.style.display = "none"
	searchInput.focus()
}

function closeModal(): void {
	hideSharedTooltip()
	modal.style.display = "none"
	isConnecting = false
	currentProviderForConnection = null
	apiKeySubmit.disabled = false
	apiKeySubmit.textContent = "Connect"
}

function renderModelList(): void {
	// Show all connected providers (including OAuth) with their models
	const connectedProviders = providers.filter((p) => p.connected)

	if (connectedProviders.length === 0 && searchQuery === "") {
		modelList.innerHTML = `<div class="no-models">No providers connected. Connect a provider below to see available models.</div>`
		return
	}

	let html = ""

	for (const provider of connectedProviders) {
		const models = Object.values(provider.models || {})

		// Filter models based on search query
		const filteredModels = searchQuery
			? models.filter((model) => {
					const query = searchQuery.toLowerCase()
					return model.name.toLowerCase().includes(query) || provider.name.toLowerCase().includes(query)
				})
			: models

		// Show provider header even if no models match the search
		// but only if we're not filtering by search or if there are matching models
		const shouldShowProvider = !searchQuery || filteredModels.length > 0

		if (!shouldShowProvider) {
			continue
		}

		html += `<div class="provider-group">`
		html += `<div class="provider-header">${escapeHtml(provider.name)} <span class="connected-badge">Connected</span></div>`

		if (filteredModels.length === 0) {
			html += `<div class="no-models">No models available from this provider</div>`
		} else {
			for (const model of filteredModels) {
				const isSelected = selectedModel?.providerID === provider.id && selectedModel?.modelID === model.id
				html += `
					<div 
						class="model-item ${isSelected ? "selected" : ""}" 
						data-provider="${escapeHtml(provider.id)}" 
						data-model="${escapeHtml(model.id)}"
					>
						<span class="model-name">${escapeHtml(model.name)}</span>
						${isSelected ? "✓" : ""}
					</div>
				`
			}
		}

		html += `</div>`
	}

	if (html === "") {
		if (searchQuery !== "") {
			html = `<div class="no-models">No models found matching "${escapeHtml(searchQuery)}"</div>`
		} else if (connectedProviders.length > 0) {
			html = `<div class="no-models">Connected providers have no available models</div>`
		}
	}

	modelList.innerHTML = html

	// Add click handlers
	modelList.querySelectorAll(".model-item").forEach((item) => {
		item.addEventListener("click", () => {
			const providerID = item.getAttribute("data-provider")!
			const modelID = item.getAttribute("data-model")!
			selectModel(providerID, modelID)
		})

		// Tooltip handlers
		item.addEventListener("mouseenter", (e) => showModelTooltip(e, item))
		item.addEventListener("mouseleave", () => hideSharedTooltip())
	})
}

function renderUnconnectedProviders(): void {
	// Filter unconnected providers that support API key auth
	let unconnected = providers.filter((p) => !p.connected && p.auth?.type !== "oauth")

	// Apply search filter
	if (searchQuery) {
		unconnected = unconnected.filter((p) => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
	}

	if (unconnected.length === 0) {
		unconnectedProviders.style.display = "none"
		return
	}

	let html = `<div class="unconnected-header">Connect Provider</div>`

	for (const provider of unconnected) {
		html += `
			<div class="provider-connect-item" data-provider="${escapeHtml(provider.id)}">
				<span class="provider-name">${escapeHtml(provider.name)}</span>
				<button class="connect-btn">Connect</button>
			</div>
		`
	}

	unconnectedProviders.innerHTML = html
	unconnectedProviders.style.display = "block"

	// Add click handlers
	unconnectedProviders.querySelectorAll(".connect-btn").forEach((btn) => {
		btn.addEventListener("click", (e) => {
			e.stopPropagation()
			const providerID = (btn.parentElement as HTMLElement).getAttribute("data-provider")!
			const provider = providers.find((p) => p.id === providerID)
			if (provider) {
				promptForApiKey(provider.id, provider.name)
			}
		})
	})
}

function selectModel(providerID: string, modelID: string): void {
	if (panelId && vscode) {
		vscode.postMessage({
			panelId,
			type: "selectModel",
			data: { providerID, modelID },
		})
	}
}

function promptForApiKey(providerID: string, providerName: string): void {
	// Show API key form inline in modal
	currentProviderForConnection = providerID
	isConnecting = false
	apiKeySubmit.disabled = false
	apiKeySubmit.textContent = "Connect"
	apiKeyPrompt.textContent = `Enter API key for ${providerName}:`
	apiKeyError.style.display = "none"
	apiKeyInput.value = ""
	apiKeyForm.style.display = "block"
	modelList.style.display = "none"
	unconnectedProviders.style.display = "none"
	apiKeyInput.focus()
}

function submitApiKey(): void {
	if (!currentProviderForConnection || !panelId || !vscode) return

	const apiKey = apiKeyInput.value.trim()
	if (!apiKey) {
		apiKeyError.textContent = "API key is required"
		apiKeyError.style.display = "block"
		return
	}

	isConnecting = true
	apiKeySubmit.disabled = true
	apiKeySubmit.textContent = "Connecting..."
	apiKeyError.style.display = "none"

	vscode.postMessage({
		panelId,
		type: "connectProvider",
		data: { providerID: currentProviderForConnection, apiKey },
	})
}

function cancelApiKey(): void {
	if (panelId && vscode) {
		vscode.postMessage({
			panelId,
			type: "cancelConnectProvider",
			data: {},
		})
	}

	isConnecting = false
	currentProviderForConnection = null
	apiKeySubmit.disabled = false
	apiKeySubmit.textContent = "Connect"
	apiKeyForm.style.display = "none"
	modelList.style.display = "block"
	unconnectedProviders.style.display = "block"
	apiKeyError.style.display = "none"
	searchInput.focus()
}

function showModelTooltip(e: Event, item: Element): void {
	const providerID = item.getAttribute("data-provider")!
	const modelID = item.getAttribute("data-model")!
	const provider = providers.find((p) => p.id === providerID)
	const model = provider?.models[modelID]

	if (!model) return

	let content = `<strong>${escapeHtml(model.name)}</strong>`
	if (model.description) {
		content += `<br><span class="tooltip-description">${escapeHtml(model.description)}</span>`
	}
	if (model.cost) {
		content += `<br><span class="tooltip-cost">$${model.cost.input}/1K input, $${model.cost.output}/1K output</span>`
	}
	if (model.contextWindow) {
		content += `<br><span class="tooltip-context">Context: ${model.contextWindow.toLocaleString()} tokens</span>`
	}

	showSharedTooltip(content, item as HTMLElement, "right", 8)
}
