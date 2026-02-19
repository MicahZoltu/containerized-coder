# Opencode GUI Extension

A minimal VSCode extension providing a rich GUI interface for the opencode coding assistant with smooth interactions..

**Key Features:**

- Zero runtime dependencies (supply chain security)
- Clean, responsive UI design
- Background opencode CLI integration (no terminal window)
- Multiple independent assistant panels
- 7 operation types with collapsible cards
- Smart auto-scrolling with manual override
- Full VSCode theme integration

## Quick Start

```bash
cd /workspace/packages/vscode-gui
npm install
npm run build
```

Then open VSCode and press `Ctrl/Cmd+Shift+A` to open an assistant panel.

## Architecture

**Zero Dependencies Design:**

- No `markdown-it`, `highlight.js`, or other parsers
- Backend sends pre-formatted HTML
- Extension just escapes and displays

**Simple Backend Integration:**

```
Extension → spawns opencode CLI → captures HTTP port → connects via fetch
```

**Single Command:**

- `Opencode: Open Opencode GUI` (Ctrl/Cmd+Shift+A)
- Always opens new panel (simpler than "create or show")

## Operation Types

1. **thinking** - AI reasoning (auto-collapses when complete)
2. **code** - Code generation (actions: Apply, Copy, Diff)
3. **error** - Error messages (action: Retry)
4. **file-change** - File modifications (actions: View Diff, Apply)
5. **user-message** - User prompts (no actions)
6. **tool-result** - Tool execution results (action: Copy)
7. **start** - Initial marker

## File Structure

```
extension-host/
  extension.ts         # Entry point (1 command)
  assistantPanel.ts    # Webview + messages
  operationStore.ts    # In-memory storage
  operationTypes.ts    # 7 type definitions
  opencodeBackend.ts   # CLI spawning + HTTP
  types/
    operations.ts      # TypeScript interfaces
  operationStore.test.ts  # Unit tests (Node.js built-in)

webview/
  app.js              # ~200 lines vanilla JS
  styles.css          # VSCode CSS variables

package.json         # Zero runtime dependencies
```

## Testing

```bash
npm run test  # Uses Node.js built-in test runner
```

Tests cover:

- Operation store (add, update, remove, clear)
- Operation types (lookup, defaults, callbacks)

## Security

- **Zero runtime dependencies**: No supply chain attack surface
- **HTML escaping**: All content escaped before display
- **No eval**: No dynamic code execution
- **Local resources only**: Webview loads from extension directory only

## Development

```bash
npm run build    # Production build
npm run watch    # Development build (watches files)
npm run test     # Run unit tests
```

## Implementation Notes

**Simplifications made:**

1. No markdown parser (backend sends HTML)
2. No syntax highlighting library (VSCode CSS handles it)
3. No "create or show" logic (always create new)
4. No panel manager (simple counter for titles)
5. No complex message queue (buffer until ready)

**Result:** ~600 lines of TypeScript (including tests), 200 lines of CSS, 200 lines of JS. Minimal, simple, maintainable.
