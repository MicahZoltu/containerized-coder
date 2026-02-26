#!/usr/bin/env bun
import { $ } from "bun"
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const currentFilePath = fileURLToPath(import.meta.url)
const extensionRoot = dirname(dirname(currentFilePath))
const temporaryDirectory = "/tmp/opencode-vscode-package"
const extensionDirectory = join(temporaryDirectory, "extension")
const outputFile = join(extensionRoot, "opencode-vscode-0.1.0.vsix")
const outputDirectory = join(extensionRoot, "output")
const assetsDirectory = join(extensionRoot, "assets")

if (!existsSync(outputDirectory)) {
	console.error("Error: output/ directory not found. Run 'bun run build' first.")
	process.exit(1)
}

if (existsSync(outputFile)) {
	rmSync(outputFile)
}

if (existsSync(temporaryDirectory)) {
	rmSync(temporaryDirectory, { recursive: true })
}

mkdirSync(extensionDirectory, { recursive: true })

cpSync(outputDirectory, join(extensionDirectory, "output"), { recursive: true })

if (existsSync(assetsDirectory)) {
	cpSync(assetsDirectory, join(extensionDirectory, "assets"), { recursive: true })
}

const sdkSource = join(extensionRoot, "node_modules", "@opencode-ai", "sdk")
if (existsSync(sdkSource)) {
	const sdkDest = join(extensionDirectory, "node_modules", "@opencode-ai", "sdk")
	cpSync(sdkSource, sdkDest, { recursive: true })
} else {
	console.error("Error: @opencode-ai/sdk not found in node_modules. Run 'bun install' first.")
	process.exit(1)
}

const packageJsonPath = join(extensionRoot, "package.json")
const readmePath = join(extensionRoot, "README.md")

cpSync(packageJsonPath, join(extensionDirectory, "package.json"))

if (existsSync(readmePath)) {
	cpSync(readmePath, join(extensionDirectory, "README.md"))
}

await $`cd ${temporaryDirectory} && zip -r ${outputFile} .`

rmSync(temporaryDirectory, { recursive: true })

console.log(`Created: ${outputFile}`)
