# VSCode GUI Extension - Simplified Implementation Plan

## Design Philosophy

**Minimize dependencies, maximize simplicity.**

- Zero runtime dependencies (supply chain attack protection)
- Use only Node.js built-ins and VSCode APIs
- Simple regex-based markdown instead of heavy parsers
- Direct HTTP communication (no complex protocols)

## Architecture

### Backend Integration

**Opencode Process Spawning** (`extension-host/opencodeBackend.ts`):

```typescript
class OpencodeBackend {
  async start(): Promise<number>
  stop(): void
  async sendPrompt(prompt: string): Promise<void>
  async sendAction(opId: string, actionId: string): Promise<void>
}
```

- Spawns opencode CLI in background (no terminal window)
- Captures stdout to detect "Server running" message
- Uses random port (30000-40000 range)
- Exposes HTTP endpoints for prompts and actions
- Singleton pattern: single backend per VSCode instance

## Security

- **Zero runtime dependencies**: No supply chain attacks
- **HTML escaping**: All user content escaped before display
- **No eval**: No dynamic code execution
- **CSP**: Webview uses VSCode's content security policy
- **Local resources only**: Webview loads only from extension directory

## Future Enhancements

- [ ] Export conversation
- [ ] Enable collapsing of everything between user prompts.
- [ ] Add a bell icon toggle somewhere in the UI. When a session is done working, if the bell is toggled then the user should be alerted with the sound of an egg timer.
- [ ] Add files changed sidebar similar to the TODO sidebar that lists all files touched in the currently selected session.
- [ ] Rollbacks (undo)

## Bugs

## Refactors

- [ ] Instead of having everything in a tab and having to re-invent a lot of thigs, lets move the session selector and the todo list out of the webview and make them native UI elements within VSCode. OpenCode should have a button on the VSCode left (default) bar next to explorer, search, git, debug, extensions and if selected it would show you a side-bar like the explorer, search, git, etc. view but with two sections: Sessions and TODO. The sessions section would show a list of all sessions and some buttons (native VSCode styling) that let you create, rename, archive, and delete them. The TODO section would show you the current sessions TODO list. This should use native VSCode UI system so that the user can drag them around, dock them, undock them, change their location, etc. just like with the other VSCode built-in tools. For now we will retain the main view for the presentation of the selected session's data, and we will leave it as a singleton tab.
