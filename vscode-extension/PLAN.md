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

## Project Structure

```
packages/vscode-extension/
├── package.json              # Extension manifest with pinned dependencies
├── tsconfig.json             # TypeScript configuration
├── bun.lock                  # Lockfile (auto-generated)
├── source/
│   ├── extension.ts          # Extension entry point + server lifecycle
│   ├── commands.ts           # Command registration
│   ├── tree/
│   │   ├── sessions.ts       # Sessions tree provider
│   │   ├── todos.ts          # TODO tree provider
│   │   └── files.ts          # Files changed tree provider
│   ├── webview/
│   │   ├── panel.ts          # WebView panel management
│   │   ├── index.html        # HTML template
│   │   ├── script.ts         # WebView JavaScript
│   │   └── tools/            # Tool renderers
│   │       ├── index.ts      # Tool registry
│   │       ├── read.ts
│   │       ├── edit.ts
│   │       ├── bash.ts
│   │       ├── apply_patch.ts
│   │       ├── webfetch.ts
│   │       └── question.ts
│   ├── statusbar.ts          # Model selector status bar
│   └── diffProvider.ts       # Diff content provider for VSCode
├── test/
│   └── integration/
│       ├── setup-mock-llm.ts  # Mock LLM server setup
│       ├── setup-opencode.ts  # OpenCode server setup
│       ├── mock-llm.test.ts   # Mock LLM server tests
│       ├── opencode.test.ts   # SDK client tests
│       ├── session.test.ts    # Session integration tests
│       └── event.test.ts      # Event handling tests
└── assets/
    └── icon.png              # Extension icon
```

## Dependencies (Pinned)

```json
{
  "dependencies": {
    "marked": "17.0.2",
    "highlight.js": "11.11.1",
    "opencode-ai": "1.2.4",
    "@opencode-ai/sdk": "1.2.4"
  },
  "devDependencies": {
    "@types/vscode": "1.108.0",
    "@types/bun": "1.3.9",
    "typescript": "5.9.3"
  }
}
```

## Phase 1: Test Infrastructure (COMPLETED) ✅

### 1.1 Mock LLM Server (`test/integration/setup-mock-llm.ts`)

**Purpose**: OpenAI-compatible HTTP server using Bun's native server for integration tests.

**Key Features**:

- Stateless (as OpenAI API is stateless)
- Single endpoint: `POST /v1/chat/completions`
- Supports streaming via SSE
- **Route-based response matching** - configure responses to match specific query substrings
- Case-insensitive matching
- Returns error when multiple routes match (test failure indicator)
- No external dependencies (uses Bun.serve())

**Interface**:

```typescript
export type MockResponse = {
  role: "assistant" | "tool"
  content?: string
  tool_calls?: Array<{
    id: string
    function: { name: string; arguments: string }
  }>
}

// Server instance created via beforeAll hook
export let mockLlm: ReturnType<typeof createMockLlmServer>

// Available methods on mockLlm:
mockLlm.url              // Base URL of the server
mockLlm.addRoute(match: string, response: MockResponse)  // Add route-based response
mockLlm.setDefault(response: MockResponse)               // Set default response
mockLlm.clear()          // Clear all routes and reset default
```

### 1.2 Test Server Setup (`test/integration/setup-opencode.ts`)

**Purpose**: Spawns opencode server configured to use mock LLM for integration tests.

**Key Features**:

- Uses `Bun.spawn()` with `detached: true` for proper process management
- Isolated environment via XDG environment variables (no writes to ~/.local, ~/.config)
- Configured via `OPENCODE_CONFIG_CONTENT` environment variable (no disk files)
- All network features disabled (autoupdate, LSP downloads, model fetch, plugins)
- Fake VCS mode to avoid git dependency

**Interface**:

```typescript
export let server: TestServer

// Server instance created via beforeAll hook, provides:
server.url // Base URL of opencode server
server.client // OpencodeClient instance
server.cleanup() // Kill server and clean up temp directory
```

### 1.3 Integration Tests

**Test Files**:

- `test/integration/mock-llm.test.ts` - Mock LLM server behavior (routing, streaming, tool calls, error handling)
- `test/integration/opencode.test.ts` - SDK client connection and message flow
- `test/integration/session.test.ts` - Session CRUD operations
- `test/integration/event.test.ts` - SSE event subscription

**Test Command**:

```bash
bun run test
# Or directly:
bun test --preload ./test/integration/setup-mock-llm.ts --preload ./test/integration/setup-opencode.ts test/integration/
```

## Phase 2: VSCode Extension UI Layer

### 2.1 Extension Manifest (`package.json`)

**Key Contributions**:

- View Container: "OpenCode" in Activity Bar
- Tree Views: Sessions, TODO, Files Changed
- Commands: create, refresh, rename, archive, delete
- Status Bar: Model selector

**Tree View Structure**:

```
OpenCode (View Container)
├── SESSIONS (Tree View)
│   ├── Active Sessions
│   │   ├── Session 1
│   │   └── Session 2
│   └── Archived Sessions
│       ├── ~~Session 3~~ (strikethrough)
│       └── ~~Session 4~~ (strikethrough)
├── TODO (Tree View)
│   └── [Select a session] (when none selected)
│   └── Task 1 (when session selected)
│   └── Task 2
└── FILES CHANGED (Tree View)
    └── [Select a session]
    └── file1.ts
    └── file2.ts
```

### 2.2 Sessions Tree (`source/tree/sessions.ts`)

**Implementation**:

- `TreeDataProvider<SessionTreeItem>`
- Groups sessions: Active first, Archived second
- Archived sessions shown with strikethrough via VSCode API
- Context menus: Rename, Archive/Unarchive, Delete
- Click to open session in WebView

**Session Status**:
- Active sessions display a status icon based on current state:
  - `busy` → spinning sync icon
  - `retry` → error icon
  - `idle` or no status → default icon
- Status is updated in real-time via SSE events (`session.status`, `session.idle`)

### 2.3 TODO Tree (`source/tree/todos.ts`)

**Implementation**:

- `TreeDataProvider<TodoTreeItem>`
- Shows placeholder when no session selected
- Refreshes on session change and SSE `todo.updated` events
- Non-interactive (display only)

### 2.4 Files Tree (`source/tree/files.ts`)

**Implementation**:

- `TreeDataProvider<FileTreeItem>`
- Shows placeholder when no session selected
- Refreshes on session change and SSE file change events
- Non-interactive (display only)

### 2.5 Status Bar (`source/statusbar.ts`)

**Implementation**:

- Contextual status bar item (visible when OpenCode view is active)
- Shows current model/provider
- Click to open model selector (quick pick)
- Updates when model changes

### 2.6 Commands (`source/commands.ts`)

**Purpose**: Command registration - separate from command usage.

Commands are thin wrappers (~5-15 lines each) that:
1. Get context from tree selection or active editor
2. Optionally show confirmation dialogs
3. Call SDK methods
4. Refresh UI as needed

**Design**: Registration and usage are separate concerns. Having all commands in one file makes it easy to:
- See the full set of registered commands
- Match with `package.json` command declarations
- Pass dependencies (client, providers) explicitly

```typescript
export function registerCommands(
  client: OpencodeClient,
  providers: { sessions: SessionsProvider; todos: TodosProvider }
): vscode.Disposable[]
```

**Commands**:

- `opencode.sessions.create` - Create new session
- `opencode.sessions.refresh` - Refresh sessions list
- `opencode.sessions.rename` - Rename selected session
- `opencode.sessions.archive` - Archive/unarchive session
- `opencode.sessions.delete` - Delete session
- `opencode.model.select` - Open model selector

### 2.7 Extension Entry (`source/extension.ts`)

**Implementation**:

- Minimal activation function
- Initialize server connection (auto-launch or use configured URL)
- Register tree providers
- Register commands
- Register status bar item
- Set up SSE event subscription for real-time updates
- Start periodic refresh every 10 seconds as fallback
- Refresh on VSCode window focus
- Display error notifications on `session.error` events
- Start fresh on VSCode restart (no session persistence)

### 2.8 Real-time Updates

**SSE Event Subscription**:

- Subscribes to `client.event.subscribe()` on activation
- Converts SSE stream to VSCode EventEmitter for internal handling
- Event routing:

| Event Type | Action |
|-------------|--------|
| `session.created`, `session.updated`, `session.deleted` | Refresh sessions tree |
| `todo.updated` (with matching `sessionID`) | Refresh todos tree |
| `session.diff` (with matching `sessionID`) | Refresh files tree |
| `session.status` | Update session status icon in sessions tree |
| `session.idle` | Clear status (set to idle) |
| `session.error` | Show user notification with error message |

**Periodic and Focus Refreshes**:

- `setInterval` calls `refreshAll()` every 10 seconds to ensure UI sync
- `vscode.window.onDidChangeWindowState` triggers refresh when VSCode gains focus
- These mechanisms complement SSE events to handle missed updates or network issues

## Phase 3: Session WebView

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
