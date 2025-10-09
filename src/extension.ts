import * as vscode from 'vscode';
import { DrawingViewProvider } from './drawingViewProvider';

export function activate(context: vscode.ExtensionContext) {
    console.log('Rectangle Drawer extension is now active!');

    // Register the drawing view provider for sidebar
    const drawingProvider = new DrawingViewProvider(context.extensionUri);
    
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'rectangleDrawerView',
            drawingProvider
        )
    );

    // Register command to open drawing view in panel
    const openDrawingCommand = vscode.commands.registerCommand(
        'rectangleDrawer.openDrawingView',
        () => {
            DrawingViewProvider.createOrShow(context.extensionUri);
        }
    );

    // Register command to show in sidebar (focus the sidebar view)
    const openInSidebarCommand = vscode.commands.registerCommand(
        'rectangleDrawer.openInSidebar',
        async () => {
            // Focus the sidebar view
            await vscode.commands.executeCommand('workbench.view.extension.rectangleDrawer');
            // Show a message to indicate we've switched to sidebar
            vscode.window.showInformationMessage('Rectangle Drawer is now active in the sidebar');
        }
    );

    context.subscriptions.push(openDrawingCommand);
    context.subscriptions.push(openInSidebarCommand);
}

export function deactivate() {}