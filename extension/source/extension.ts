import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
	console.log('Containerized Coder extension is now active');

	// Register Hello World command
	const helloWorldDisposable = vscode.commands.registerCommand(
		'containerizedCoder.helloWorld',
		() => {
			vscode.window.showInformationMessage(
				'Hello from Containerized Coder Extension!'
			);
		}
	);

	// Register Show Info command
	const showInfoDisposable = vscode.commands.registerCommand(
		'containerizedCoder.showInfo',
		() => {
			const info = getContainerInfo();
			vscode.window.showInformationMessage(info);
		}
	);

	// Add to subscriptions
	context.subscriptions.push(helloWorldDisposable);
	context.subscriptions.push(showInfoDisposable);

	// Show welcome message if configured
	const config = vscode.workspace.getConfiguration('containerizedCoder');
	if (config.get('showWelcomeMessage', true)) {
		vscode.window.showInformationMessage(
			'Welcome to Containerized VSCode Web! Your custom extension is active.'
		);
	}

	// Status bar item
	const statusBarItem = vscode.window.createStatusBarItem(
		vscode.StatusBarAlignment.Left,
		100
	);
	statusBarItem.text = "$(cloud) Containerized";
	statusBarItem.tooltip = "Running in containerized VSCode Web";
	statusBarItem.show();
	context.subscriptions.push(statusBarItem);
}

export function deactivate() {
	console.log('Containerized Coder extension is now deactivated');
}

function getContainerInfo(): string {
	const info = [
		'Containerized Coder Info:',
		`Platform: ${process.platform}`,
		`Architecture: ${process.arch}`,
		`Node Version: ${process.version}`,
		`PID: ${process.pid}`,
		`CWD: ${process.cwd()}`,
	];

	return info.join('\n');
}
