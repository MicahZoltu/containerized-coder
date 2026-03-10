// Minimal VSCode API mock

export type Disposable = { dispose: () => void };

// Event: callable that registers a listener and returns Disposable
export type Event<T = unknown> = (listener: (arg: T) => void) => Disposable;

export type EventWithDispose<T> = Event<T> & { dispose: () => void };

export class EventEmitter<T> {
	private listeners: Array<(e: T) => void> = [];

	// Register a listener and return Disposable
	event(listener: (e: T) => void): Disposable {
		this.listeners.push(listener);
		return {
			dispose: () => {
				const idx = this.listeners.indexOf(listener);
				if (idx >= 0) this.listeners.splice(idx, 1);
			}
		};
	}

	fire(e: T): void {
		for (const listener of this.listeners) {
			try {
				listener(e);
			} catch (error) {
				console.error("Event listener error:", error);
			}
		}
	}

	dispose(): void {
		this.listeners = [];
	}
}

// Helper to create an Event (callable) with dispose that clears all
function createEvent<T>(): EventWithDispose<T> {
	const emitter = new EventEmitter<T>();
	const event = (listener: (arg: T) => void): Disposable => emitter.event(listener);
	const disposable: Disposable = { dispose: () => emitter.dispose() };
	return Object.assign(event, disposable);
}

// ============ Tree Item ============

export class TreeItem {
	constructor(
		public label: string,
		public collapsibleState: TreeItemCollapsibleState
	) {}

	id?: string;
	description?: string;
	iconPath?: ThemeIcon | { light: string; dark: string };
	command?: { command: string; title: string; arguments?: unknown[] };
	tooltip?: string;
}

// ============ Tree View ============

export class TreeView<T extends TreeItem> {
	// These are Events (callable) with extra dispose for cleanup
	onDidChangeSelection: Event & { dispose: () => void } = createEvent<{ selection: T[] }>();
	onDidChangeTreeData: Event & { dispose: () => void } = createEvent<void | T>();
	showCollapseAll = false;
	private _treeDataProvider: TreeDataProvider<T> | null = null;

	constructor(
		public viewId: string,
		options?: { treeDataProvider?: TreeDataProvider<T>; showCollapseAll?: boolean }
	) {
		if (options?.treeDataProvider) this._treeDataProvider = options.treeDataProvider;
		if (options?.showCollapseAll !== undefined) this.showCollapseAll = options.showCollapseAll;
	}

	get treeDataProvider(): TreeDataProvider<T> | null {
		return this._treeDataProvider;
	}

	set treeDataProvider(provider: TreeDataProvider<T> | null) {
		this._treeDataProvider = provider;
	}

	dispose(): void {
		this.onDidChangeSelection.dispose();
		this.onDidChangeTreeData.dispose();
	}
}

// ============ Theme Icon ============

export class ThemeIcon {
	constructor(public id: string) {}
}

// ============ Status Bar Item ============

export class StatusBarItem {
	private _text: string = "";
	private _tooltip: string = "";
	command: string = "";

	constructor(
		public alignment: StatusBarAlignment,
		public priority: number
	) {}

	get text(): string {
		return this._text;
	}
	set text(value: string) {
		this._text = value;
	}

	get tooltip(): string {
		return this._tooltip;
	}
	set tooltip(value: string) {
		this._tooltip = value;
	}

	show(): void {}
	dispose(): void {}
}

// ============ Webview ============

export class Webview {
	cspSource: string = "mock-csp-source";
	private _html: string = "";

	get html(): string {
		return this._html;
	}
	set html(value: string) {
		this._html = value;
	}

	async postMessage(_message: unknown): Promise<boolean> {
		return true;
	}
}

export class WebviewPanel {
	private _title: string;
	private _disposed = false;
	private _webview: Webview;

	constructor(
		public viewType: string,
		title: string,
		public viewColumn: ViewColumn,
		_options?: { enableScripts?: boolean; retainContextWhenHidden?: boolean; localResourceRoots?: Uri[] }
	) {
		this._title = title;
		this._webview = new Webview();
	}

	get title(): string {
		return this._title;
	}
	set title(value: string) {
		this._title = value;
	}

	get webview(): Webview {
		return this._webview;
	}

	reveal(): void {}
	dispose(): void {
		this._disposed = true;
	}
	onDidDispose(): { dispose: () => void } {
		return { dispose: () => {} };
	}
	get disposed(): boolean {
		return this._disposed;
	}
}

// ============ Window ============

export class MockWindow {
	statusBarItems: StatusBarItem[] = [];
	private _windowStateEmitter: EventEmitter<{ focused: boolean }> | null = null;
	private _windowStateEvent: EventWithDispose<{ focused: boolean }>;
	private _outputChannels: Map<string, OutputChannel> = new Map();

	constructor() {
		// Initialize the window state event with a fresh emitter
		const emitter = new EventEmitter<{ focused: boolean }>();
		this._windowStateEmitter = emitter;
		const event = (listener: (arg: { focused: boolean }) => void): Disposable => emitter.event(listener);
		this._windowStateEvent = Object.assign(event, { dispose: () => emitter.dispose() });
	}

	createTreeView<T extends TreeItem>(viewId: string, options?: { treeDataProvider?: TreeDataProvider<T>; showCollapseAll?: boolean }): TreeView<T> {
		return new TreeView<T>(viewId, options);
	}

	createStatusBarItem(alignment: StatusBarAlignment, priority: number): StatusBarItem {
		const item = new StatusBarItem(alignment, priority);
		this.statusBarItems.push(item);
		return item;
	}

	createOutputChannel(name: string): OutputChannel {
		if (!this._outputChannels.has(name)) {
			this._outputChannels.set(name, new OutputChannel(name));
		}
		return this._outputChannels.get(name)!;
	}

	createWebviewPanel(viewType: string, title: string, viewColumn: ViewColumn, options?: { enableScripts?: boolean; retainContextWhenHidden?: boolean; localResourceRoots?: Uri[] }): WebviewPanel {
		return new WebviewPanel(viewType, title, viewColumn, options);
	}

	async showInputBox(_options?: InputBoxOptions): Promise<string | undefined> {
		return undefined;
	}

	async showWarningMessage(_message: string, _options?: { modal?: boolean }, ...actions: string[]): Promise<string | undefined> {
		return actions[0] || undefined;
	}

	async showErrorMessage(_message: string, ..._actions: string[]): Promise<string | undefined> {
		return undefined;
	}

	async showInformationMessage(_message: string, ..._actions: string[]): Promise<string | undefined> {
		return undefined;
	}

	async showQuickPick(items: QuickPickItem[], _options?: QuickPickOptions): Promise<QuickPickItem | undefined> {
		return items[0] || undefined;
	}

	get onDidChangeWindowState(): Event<{ focused: boolean }> & { dispose: () => void } {
		return this._windowStateEvent;
	}

	// For tests: trigger a focus event
	triggerFocus(): void {
		this._windowStateEmitter?.fire({ focused: true });
	}

	registerTreeDataProvider<T extends TreeItem>(_viewId: string, _dataProvider: TreeDataProvider<T>): Disposable {
		return { dispose: () => {} };
	}
}

// Keep a singleton window instance
export const window = new MockWindow();

// ============ Commands ============

export const commands = {
	registerCommand: (_command: string, _handler: (...args: unknown[]) => unknown): Disposable => {
		return { dispose: () => {} };
	},
	executeCommand: async (_command: string, ..._args: unknown[]) => {
		return undefined;
	}
};

// ============ Extension Context ============

export class ExtensionContext {
	subscriptions: Disposable[] = [];
	globalState: Record<string, unknown> = {};
	workspaceState: Record<string, unknown> = {};

	asAbsolutePath(relativePath: string): string {
		return `/absolute/${relativePath}`;
	}
}

// ============ Enums ============

export const enum TreeItemCollapsibleState {
	None = 0,
	Collapsed = 1,
	Expanded = 2
}

export const enum StatusBarAlignment {
	Left = 1,
	Right = 2
}

export const enum ViewColumn {
	One = 1,
	Two = 2,
	Three = 3,
	Four = 4,
	Five = 5,
	Six = 6,
	Seven = 7,
	Eight = 8,
	Active = -1,
	Beside = -2
}

// ============ Types ============

export type QuickPickItem = {
	label: string;
	description?: string;
	alwaysShow?: boolean;
};

export type InputBoxOptions = {
	prompt?: string;
	placeHolder?: string;
	value?: string;
};

export type QuickPickOptions = {
	placeHolder?: string;
	matchOnDescription?: boolean;
};

export class Uri {
	constructor(public scheme: string, public path: string, public query: string = '', public fragment: string = '') {}
	static file(path: string): Uri {
		return new Uri('file', path);
	}
	static joinPath(base: Uri, ...segments: string[]): Uri {
		const path = [base.path, ...segments].join('/');
		return new Uri(base.scheme, path);
	}
	get fsPath(): string {
		return this.path;
	}
}

export const enum ExtensionMode {
	Test = 1,
	Development = 2,
	Production = 3
}

export interface TreeDataProvider<T extends TreeItem = TreeItem> {
	readonly onDidChangeTreeData: Event<T | undefined>;
	getChildren(element?: T): T[];
	getTreeItem(element: T): TreeItem;
}

export const enum ExtensionKind {
	UI = 1,
	Workspace = 2
}

// OutputChannel mock
export class OutputChannel {
	private _messages: string[] = [];
	constructor(public name: string) {}
	append(value: string): void {
		this._messages.push(value);
	}
	appendLine(value: string): void {
		this._messages.push(value + '\n');
	}
	clear(): void {
		this._messages = [];
	}
	show?(): void {}
	hide?(): void {}
	dispose(): void {}
	get length(): number {
		return this._messages.join('').length;
	}
}
