#!/usr/bin/env bun
/**
 * Sandbox script for testing OpenCode backend connection and event handling
 *
 * This is a scratchpad for debugging. Edit the code directly to test specific scenarios.
 *
 * Usage:
 *   bun run script/sandbox.ts              # Default: 30 second timeout
 *   bun run script/sandbox.ts --timeout=60 # Custom timeout
 *
 * To test specific scenarios, edit the main() function below.
 */

import { spawn, ChildProcess } from "child_process"

// Parse CLI arguments
const args = process.argv.slice(2)
const timeoutArg = args.find((a) => a.startsWith("--timeout="))
const timeoutSeconds = timeoutArg ? parseInt(timeoutArg.split("=")[1] || "30", 10) : 30

// SSE Event types matching backend
interface ServerEvent {
	type: string
	properties: Record<string, unknown>
}

// Backend process manager
class BackendRunner {
	private process: ChildProcess | null = null
	private port: number

	constructor(port: number = 34567) {
		this.port = port
	}

	async start(): Promise<number> {
		return new Promise((resolve, reject) => {
			console.log(`🚀 Starting opencode serve on port ${this.port}...`)

			const timeout = setTimeout(() => {
				reject(new Error("Timeout waiting for backend to start"))
			}, 30000)

			const proc = spawn("opencode", ["serve", "--port", this.port.toString()], {
				stdio: ["ignore", "pipe", "pipe"],
			})

			this.process = proc

			let stderrBuffer = ""

			proc.stderr?.on("data", (data: Buffer) => {
				const str = data.toString()
				stderrBuffer += str
				if (str.includes("error") || str.includes("Error")) {
					console.log(`[opencode] ${str.trim()}`)
				}
			})

			proc.on("error", (err: Error) => {
				clearTimeout(timeout)
				reject(err)
			})

			proc.on("exit", (code: number | null) => {
				if (code !== 0) {
					clearTimeout(timeout)
					reject(new Error(`opencode exited with code ${code}: ${stderrBuffer}`))
				}
			})

			const checkInterval = setInterval(async () => {
				try {
					const res = await fetch(`http://localhost:${this.port}/global/health`)
					if (res.ok) {
						clearInterval(checkInterval)
						clearTimeout(timeout)
						console.log(`✅ Backend ready on port ${this.port}!`)
						resolve(this.port)
					}
				} catch {
					// Still waiting
				}
			}, 500)

			setTimeout(() => clearInterval(checkInterval), 30000)
		})
	}

	stop(): void {
		if (this.process) {
			this.process.kill()
			this.process = null
		}
	}
}

// Event stream inspector
class EventInspector {
	private abortController: AbortController | null = null
	private eventCount = 0

	async connect(port: number, onEvent?: () => void): Promise<void> {
		console.log(`\n📡 Connecting to SSE stream...\n`)

		this.abortController = new AbortController()

		try {
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

			console.log("✅ Connected! Waiting for events...\n")
			console.log("=".repeat(80))

			const reader = res.body.getReader()
			const decoder = new TextDecoder()
			let buffer = ""

			while (true) {
				const { done, value } = await reader.read()

				if (done) {
					console.log("\n⚠️  SSE stream ended")
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
							this.eventCount++
							onEvent?.()
						} catch (err) {
							console.error("❌ Failed to parse event:", err)
						}
						eventData = ""
					}
				}
			}
		} catch (err) {
			if ((err as Error).name === "AbortError") {
				return
			}
			throw err
		}
	}

	getEventCount(): number {
		return this.eventCount
	}

	disconnect(): void {
		if (this.abortController) {
			this.abortController.abort()
			this.abortController = null
		}
	}

	private handleEvent(event: ServerEvent): void {
		const timestamp = new Date().toLocaleTimeString()

		console.log(`\n⏰ ${timestamp} | Event #${this.eventCount + 1}`)
		console.log(`📨 Type: ${event.type}`)
		console.log("-".repeat(80))
		console.log(JSON.stringify(event, null, 2))
		this.analyzeEvent(event)
		console.log("=".repeat(80))
	}

	private analyzeEvent(event: ServerEvent): void {
		const { type, properties } = event

		switch (type) {
			case "message.part.updated": {
				const part = (properties as any).part
				if (part) {
					console.log(`\n🔍 Part: ${part.type}`)
					if (part.type === "text" && part.text) {
						const text = part.text as string
						console.log(`📝 Text length: ${text.length} chars`)
					}
				}
				break
			}
			case "message.updated": {
				const info = (properties as any).info
				if (info) {
					console.log(`\n💬 Message: ${info.role}`)
				}
				break
			}
			case "session.status": {
				const status = (properties as any).status
				if (status) {
					console.log(`\n📊 Status: ${status.type}`)
				}
				break
			}
		}
	}
}

// ============================================================================
// MAIN FUNCTION - EDIT THIS FOR SPECIFIC TESTS
// ============================================================================

async function main() {
	console.log("🧪 OpenCode Event Stream Sandbox\n")
	console.log(`⏱️  Will exit after ${timeoutSeconds} seconds (safety timeout)\n`)

	const backend = new BackendRunner(34567)
	let port: number

	try {
		port = await backend.start()
	} catch (err) {
		console.error("\n❌ Failed to start backend:", err)
		console.log("\n💡 Make sure opencode CLI is installed:")
		console.log("   curl -fsSL https://opencode.ai/install | bash")
		process.exit(1)
	}

	const inspector = new EventInspector()

	// Safety timeout - always exits
	setTimeout(() => {
		console.log(`\n\n⏱️  Safety timeout reached (${timeoutSeconds}s)`)
		inspector.disconnect()
		backend.stop()
		process.exit(0)
	}, timeoutSeconds * 1000)

	try {
		await inspector.connect(port)
	} catch (err) {
		console.error("\n❌ Connection failed:", err)
	} finally {
		backend.stop()
	}
}

// ============================================================================

main().catch((err) => {
	console.error("❌ Fatal error:", err)
	process.exit(1)
})
