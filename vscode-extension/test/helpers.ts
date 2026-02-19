import type { LanguageModelChat } from 'vscode';
import * as vscode from 'vscode';

export function createMockExtensionContext(): vscode.ExtensionContext {
	const subscriptions: vscode.Disposable[] = [];

	// Minimal memento
	const memento: vscode.Memento = {
		get: <T>(_key: string): T | undefined => undefined,
		update: async (_key: string, _value: unknown) => {},
		keys: () => []
	};

	// Global state with sync support
	const globalState: vscode.Memento & { setKeysForSync(keys: readonly string[]): void } = {
		...memento,
		setKeysForSync: () => {}
	};

	// Secrets storage
	const secrets: vscode.SecretStorage = {
		get: async (): Promise<string | undefined> => undefined,
		store: async () => {},
		delete: async () => {},
		keys: async () => [],
		onDidChange: () => ({ dispose: () => {} })
	};

	// Environment variable collection (no-op)
	const envVarCollection: vscode.GlobalEnvironmentVariableCollection = {
		persistent: true,
		description: undefined,
		replace: () => {},
		append: () => {},
		prepend: () => {},
		get: () => undefined,
		delete: async () => {},
		clear: async () => {},
		forEach: () => {},
		[Symbol.iterator]: (): Iterator<[string, vscode.EnvironmentVariableMutator]> => ({
			next: (): IteratorResult<[string, vscode.EnvironmentVariableMutator]> => ({ done: true, value: ['', { persistent: false, replacement: '' }] })
		}),
		getScoped: () => envVarCollection
	};

	const extensionUri = vscode.Uri.file('/extension');

	const languageModelAccessInformation: vscode.LanguageModelAccessInformation = {
		onDidChange: () => ({ dispose: () => {} }),
		canSendRequest: (_chat: LanguageModelChat) => true
	};

	return {
		subscriptions,
		workspaceState: memento,
		globalState,
		secrets,
		extensionUri,
		extensionPath: extensionUri.fsPath,
		environmentVariableCollection: envVarCollection,
		storageUri: vscode.Uri.file('/storage'),
		storagePath: '/storage',
		globalStorageUri: vscode.Uri.file('/global'),
		globalStoragePath: '/global',
		logUri: vscode.Uri.file('/log'),
		logPath: '/log',
		extensionMode: vscode.ExtensionMode.Test,
		extension: {
			id: 'test',
			extensionUri,
			extensionPath: extensionUri.fsPath,
			packageJSON: { version: '0.0.0', name: 'test' },
			isActive: true,
			extensionKind: vscode.ExtensionKind.UI,
			exports: {},
			activate: () => Promise.resolve()
		} as vscode.Extension<unknown>,
		languageModelAccessInformation,
		asAbsolutePath: (p) => vscode.Uri.joinPath(extensionUri, p).fsPath
	};
}
