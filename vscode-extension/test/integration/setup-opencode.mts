import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import { afterAll, beforeAll } from "bun:test"
import * as fs from "fs/promises"
import os from "os"
import path from "path"
import { fileURLToPath } from "url"
import { mockLlm } from "./setup-mock-llm.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, "..", "..")

function getBaseDir() {
	return path.join(os.tmpdir(), "opencode-vscode-test")
}

function getOpencodeBin() {
	return path.join(projectRoot, "node_modules", "opencode-linux-x64", "bin", "opencode")
}

async function ensureCleanDir(dir: string) {
	await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
	await fs.mkdir(dir, { recursive: true })
}

type TestServerOptions = {
	mockLlmUrl: string
}

async function createTestServer(options: TestServerOptions) {
	const baseDir = getBaseDir()
	await ensureCleanDir(baseDir)

	const config = {
		$schema: "https://opencode.ai/config.json",
		enabled_providers: ["mock"],
		provider: {
			mock: {
				name: "Mock",
				npm: "@ai-sdk/openai-compatible",
				env: [],
				models: {
					"mock-model": {
						name: "Mock Model",
						tool_call: true,
						limit: { context: 128000, output: 4096 },
					},
				},
				options: {
					apiKey: "test-key",
					baseURL: options.mockLlmUrl + "/v1",
				},
			},
		},
		model: "mock/mock-model",
	}

	const homeDir = path.join(baseDir, "home")
	const shareDir = path.join(baseDir, "share")
	const cacheDir = path.join(baseDir, "cache")
	const configDir = path.join(baseDir, "config")
	const stateDir = path.join(baseDir, "state")

	await Promise.all([
		fs.mkdir(homeDir, { recursive: true }),
		fs.mkdir(shareDir, { recursive: true }),
		fs.mkdir(cacheDir, { recursive: true }),
		fs.mkdir(configDir, { recursive: true }),
		fs.mkdir(stateDir, { recursive: true }),
	])

	const proc = Bun.spawn([getOpencodeBin(), "serve", "--hostname=127.0.0.1", "--port=0"], {
		detached: true,
		env: {
			PATH: "/usr/bin:/bin",
			HOME: homeDir,
			OPENCODE_TEST_HOME: homeDir,
			XDG_DATA_HOME: shareDir,
			XDG_CACHE_HOME: cacheDir,
			XDG_CONFIG_HOME: configDir,
			XDG_STATE_HOME: stateDir,
			OPENCODE_CONFIG_CONTENT: JSON.stringify(config),
			OPENCODE_DISABLE_AUTOUPDATE: "true",
			OPENCODE_DISABLE_LSP_DOWNLOAD: "true",
			OPENCODE_DISABLE_MODELS_FETCH: "true",
			OPENCODE_DISABLE_DEFAULT_PLUGINS: "true",
			OPENCODE_DISABLE_EXTERNAL_SKILLS: "true",
			OPENCODE_DISABLE_PROJECT_CONFIG: "true",
			OPENCODE_FAKE_VCS: "git",
		},
		stdout: "pipe",
		stderr: "pipe",
	})

	const url = await new Promise<string>((resolve, reject) => {
		const timeout = setTimeout(() => {
			reject(new Error("Timeout waiting for opencode server to start"))
		}, 10000)

		let output = ""
		const decoder = new TextDecoder()

		const reader = proc.stdout.getReader()

		async function readLoop() {
			while (true) {
				const { done, value } = await reader.read()
				if (done) break
				output += decoder.decode(value, { stream: true })
				const lines = output.split("\n")
				for (const line of lines) {
					if (line.includes("opencode server listening")) {
						const match = line.match(/on\s+(https?:\/\/[^\s]+)/)
						if (match) {
							clearTimeout(timeout)
							resolve(match[1]!)
							return
						}
					}
				}
			}
			reject(new Error("Server output ended without finding URL"))
		}

		readLoop().catch((err) => {
			clearTimeout(timeout)
			reject(err)
		})
	})

	const client = createOpencodeClient({ baseUrl: url })

	return {
		url,
		client,
		cleanup: async () => {
			const pid = proc.pid

			// Kill the process group to ensure all child processes are terminated
			try {
				process.kill(-pid, "SIGKILL")
			} catch {
				try {
					process.kill(pid, "SIGKILL")
				} catch {}
			}

			await fs.rm(baseDir, { recursive: true, force: true }).catch(() => {})
		},
	}
}

export type TestServer = Awaited<ReturnType<typeof createTestServer>>
export let server: TestServer

beforeAll(async () => {
	server = await createTestServer({ mockLlmUrl: mockLlm.url })
})

afterAll(async () => {
	await server.cleanup()
})
