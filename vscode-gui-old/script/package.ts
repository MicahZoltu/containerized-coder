#!/usr/bin/env bun
import { $ } from "bun"
import { existsSync, mkdirSync, cpSync, rmSync } from "fs"
import { join } from "path"

const temporaryDirectory = "/tmp/vscode-gui-package"
const extensionDirectory = join(temporaryDirectory, "extension")
const outputFile = "opencode-gui-0.1.0.vsix"

// Remove existing .vsix if present
if (existsSync(outputFile)) {
	rmSync(outputFile)
}

// Clean up temp dir
if (existsSync(temporaryDirectory)) {
	rmSync(temporaryDirectory, { recursive: true })
}
mkdirSync(extensionDirectory, { recursive: true })

// Copy output directory
cpSync("output", join(extensionDirectory, "output"), { recursive: true })

// Copy webview directory
cpSync("webview", join(extensionDirectory, "webview"), { recursive: true })

// Copy highlight.js dependencies
const dependenciesDirectory = join(extensionDirectory, "webview", "dependencies")
mkdirSync(dependenciesDirectory, { recursive: true })
const highlightjsDirectory = "./node_modules/@highlightjs/cdn-assets"
cpSync(join(highlightjsDirectory, "highlight.min.js"), join(dependenciesDirectory, "highlight.min.js"))
cpSync(join(highlightjsDirectory, "styles/github-dark.min.css"), join(dependenciesDirectory, "github-dark.min.css"))
cpSync(join(highlightjsDirectory, "styles/github.min.css"), join(dependenciesDirectory, "github.min.css"))
cpSync(join(highlightjsDirectory, "languages"), join(dependenciesDirectory, "languages"), { recursive: true })

// Copy marked.js
const markedDirectory = "./node_modules/marked"
cpSync(join(markedDirectory, "marked.min.js"), join(dependenciesDirectory, "marked.min.js"))

// Copy other files
cpSync("package.json", join(extensionDirectory, "package.json"))
cpSync("README.md", join(extensionDirectory, "README.md"))

// Create .vsix (it's just a zip)
await $`cd ${temporaryDirectory} && zip -r ${join(process.cwd(), outputFile)} .`

// Clean up
rmSync(temporaryDirectory, { recursive: true })
