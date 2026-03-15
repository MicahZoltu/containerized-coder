# OpenCode VSCode Extension - Implementation Plan

## Overview

This document outlines the implementation plan for the new VSCode extension that replaces `packages/vscode-gui-old`. The new extension uses VSCode's native UI system, integrates with `packages/sdk` (via NPM), and prioritizes maintainability, testability, and minimal abstractions.

## Architecture Principles

- **Pure Functions**: All business logic is pure, deterministic, and testable
- **Minimal State**: Extension is a thin presentation layer; server is source of truth
- **No OOP**: Functional approach throughout
- **Native Bun**: Uses Bun's HTTP server, file operations, and process spawning
- **VSCode Native**: Integrates with VSCode's theme, icons, and UI patterns
- **Integration First**: Mock LLM server for real end-to-end testing

## Phase 1: Test Infrastructure (COMPLETED) ✅

## Phase 2: VSCode Extension UI Layer (COMPLETED) ✅

## Phase 3: Session WebView

### 3.0 Session Data Availability



### 3.1 WebView Panel (`source/webview/panel.ts`)

**Key Functions**:

```typescript
export function openSessionPanel(context: ExtensionContext, sessionID: string, sessionTitle: string): WebviewPanel

export function postMessageToPanel(panel: WebviewPanel, message: WebViewMessage): void
```

**Design**:

- Non-singleton (user can open multiple sessions)
- Disposes when closed
- Handles VSCode lifecycle (preserve/revive)

### 3.2 WebView HTML (`source/webview/index.html`)

**Structure**:

- Standard HTML5 document
- VSCode CSS variables for theming (`--vscode-*`)
- Script tag loading compiled `script.js`
- No external CSS frameworks

### 3.3 WebView Script (`source/webview/script.ts`)

**Responsibilities**:

- Receive messages from extension (parts, theme changes)
- Render all part types (17 types):
  - text, thinking, tool, file-attachment, file-change, snapshot
  - agent, subtask, step-start, step-finish, retry, compaction
  - error, start, user-message, question
- Use `marked` for Markdown parsing
- Use `highlight.js` for syntax highlighting
- Send messages back to extension (user input, tool responses)
- Apply VSCode theme colors via CSS variables

### 3.4 Tool Renderers (`source/webview/tools/`)

**Extensible Architecture**:

```typescript
// source/webview/tools/index.ts
export type ToolRenderer = {
  name: string
  render: (tool: ToolPart, container: HTMLElement) => void
  update?: (tool: ToolPart, container: HTMLElement) => void
}

export const toolRenderers: Map<string, ToolRenderer>
export function registerToolRenderer(renderer: ToolRenderer): void
export function renderTool(tool: ToolPart, container: HTMLElement): void
```

**Built-in Tool Renderers**:

- `read.ts` - File read operations with preview
- `edit.ts` - File edit operations with diff view
- `bash.ts` - Bash command execution with output
- `apply_patch.ts` - Patch application with diff
- `webfetch.ts` - Web fetch results
- `question.ts` - Interactive question prompts

**Adding New Tools**: Simply add a new file to `tools/` and register it.

## Phase 4: Build & Package

### 4.1 TypeScript Config (`tsconfig.json`)

**Key Settings**:

- Target: ES2022
- Module: ESNext
- Strict: true
- No implicit any
- Exact optional property types

### 4.2 Build Process

**Simple build**: Just run `tsc` directly:

```bash
tsc
```

This compiles TypeScript from `source/` to `output/`.

No complex build script needed - TypeScript handles everything.

### 4.3 Workspace Integration

Add to root `package.json` workspaces:

```json
"workspaces": {
  "packages": [
    "packages/vscode-extension",
    // ... existing
  ]
}
```

## Testing Strategy

**Integration Tests (test/integration/)**:

- Launch real opencode server + mock LLM
- Test actual SDK interactions
- Comprehensive end-to-end coverage

**Test Command**:

```bash
bun test packages/vscode-extension/test/**/*.test.ts
```

## Design Decisions Summary

### Dependencies

- `marked`: 17.0.2 (Markdown parsing)
- `highlight.js`: 11.11.1 (Syntax highlighting)
- `@types/vscode`: 1.108.0 (VSCode API types)
- `@types/bun`: 1.3.9 (Bun types)
- `typescript`: 5.9.3 (TypeScript compiler)
- `opencode-ai`: 1.2.4 (OpenCode server for testing)

### Build Process

- Just use `tsc` directly - no build script needed
- Minimal tooling, minimal complexity
- Let TypeScript handle compilation

### Mock Server

- Runtime configurable via in-memory response queue
- Tests can push/pop responses without restart
- Implements OpenAI-compatible API

### Part Rendering

- Use SDK Part types directly
- Extensible tool renderer registry

### Types

- Co-locate types with their usage (no separate `types.ts`)
- Extract to shared location only when multiple files need the same types

### Commands

- Separate file for command registration
- Thin wrappers that delegate to SDK and refresh UI
- Registration is separate from usage (triggered by palette, context menus, etc.)

### UI Behavior

- VSCode native theme, icons, styling
- No custom keybindings
- Auto-launch server on activation
- Start fresh on VSCode restart
- Archived sessions: separate section + strikethrough
- Placeholder in TODO/Files trees when no session selected

### Tool Rendering

- Custom renderers for each tool type
- Easy to add new tools (register function)
- Built-in: read, edit, bash, apply_patch, webfetch, question
- Future tools: add file to `tools/` directory

## Implementation Order

**Phase 0 COMPLETED** ✅ - Project scaffold with package.json, tsconfig.json, source/extension.ts, assets/icon.png, and VSIX packaging

**Phase 1 COMPLETED** ✅ - Test infrastructure with mock LLM server, opencode server setup, and integration tests

### Phase 2: VSCode Extension UI Layer

1. `source/tree/sessions.ts` - Sessions tree
2. `source/tree/todos.ts` - TODO tree
3. `source/tree/files.ts` - Files tree
4. `source/statusbar.ts` - Status bar
5. `source/commands.ts` - Commands
6. Update `source/extension.ts` - Extension entry (full implementation)

### Phase 3: Session WebView

7. `source/webview/panel.ts` - WebView panel
8. `source/webview/index.html` - WebView HTML
9. `source/webview/script.ts` - WebView JS
10. `source/webview/tools/` - Tool renderers

### Phase 4: Build & Package

11. Update `package.json` - Extension manifest (full)
12. Verify build and packaging

## Notes

- All code should be functional (not OOP)
- Prefer pure functions over class methods
- Use minimal abstractions
- Test business logic thoroughly
- Keep VSCode layer thin (presentation only)
- Server is source of truth
- No state management beyond VSCode's built-in
- Use VSCode CSS variables for theming
- Target VSCode 1.108+
- Use Bun for everything (no Node.js)
- Version pin all dependencies
- Generate and commit bun.lock
- Use verbose names: `source` not `src`, `output` not `out`, `number` not `num`, etc.
