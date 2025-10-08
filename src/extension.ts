import * as vscode from 'vscode';
import { DrawingViewProvider } from './drawingViewProvider';

export function activate(context: vscode.ExtensionContext) {
    console.log('Rectangle Drawer extension is now active!');

    // Register the drawing view provider
    const drawingProvider = new DrawingViewProvider(context.extensionUri);
    
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'rectangleDrawerView',
            drawingProvider
        )
    );

    // Register command to open drawing view
    const openDrawingCommand = vscode.commands.registerCommand(
        'rectangleDrawer.openDrawingView',
        () => {
            DrawingViewProvider.createOrShow(context.extensionUri);
        }
    );

    context.subscriptions.push(openDrawingCommand);
}

export function deactivate() {}