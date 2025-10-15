import * as vscode from 'vscode';
import { DrawingViewProvider } from './drawingViewProvider';

/**
 * Provider for pix.json files as custom text editors.
 * This allows .pix.json files to be opened directly from the explorer
 * and treated as normal documents with proper persistence.
 */
export class PixEditorProvider implements vscode.CustomTextEditorProvider {
    private static statusBarItem: vscode.StatusBarItem;
    private static activeEditors = new Set<string>();

    public static register(context: vscode.ExtensionContext): vscode.Disposable {
        const provider = new PixEditorProvider(context);

        // Create a shared status bar item for all pix editors
        PixEditorProvider.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        PixEditorProvider.statusBarItem.command = 'workbench.action.editor.changeLanguageMode';
        context.subscriptions.push(PixEditorProvider.statusBarItem);

        // Listen for active editor changes to update status bar
        context.subscriptions.push(
            vscode.window.onDidChangeActiveTextEditor(editor => {
                if (editor && PixEditorProvider.activeEditors.has(editor.document.uri.toString())) {
                    PixEditorProvider.updateStatusBar();
                } else {
                    PixEditorProvider.statusBarItem.hide();
                }
            })
        );

        const providerRegistration = vscode.window.registerCustomEditorProvider(
            PixEditorProvider.viewType,
            provider,
            {
                webviewOptions: {
                    retainContextWhenHidden: true,
                },
                supportsMultipleEditorsPerDocument: false,
            }
        );
        return providerRegistration;
    }

    private static readonly viewType = 'pix.pixEditor';

    private static updateStatusBar(): void {
        if (PixEditorProvider.statusBarItem) {
            PixEditorProvider.statusBarItem.text = 'Pix Drawing';
            PixEditorProvider.statusBarItem.tooltip = 'Pix Drawing File (.pix.json) - Click to change language mode';
            PixEditorProvider.statusBarItem.show();
        }
    }

    constructor(
        private readonly context: vscode.ExtensionContext
    ) { }

    /**
     * Called when our custom editor is opened.
     */
    public async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        // Ensure the document language is set to 'pix' for proper status line recognition
        if (document.languageId !== 'pix') {
            await vscode.languages.setTextDocumentLanguage(document, 'pix');
        }

        // Setup initial content for the webview
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.context.extensionUri],
            enableCommandUris: true
        };

        // Set the initial title to the filename
        webviewPanel.title = this.getFileName(document.uri);

        // Track this editor and update status bar
        PixEditorProvider.activeEditors.add(document.uri.toString());
        PixEditorProvider.updateStatusBar();

        // Generate and set the HTML content
        webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

        // Helper function to update webview with document content
        function updateWebview() {
            try {
                const text = document.getText();
                let data;

                if (text.trim() === '') {
                    // Empty file - start with empty drawing
                    data = { rectangles: [], connections: [] };
                } else {
                    // Parse existing content
                    const parsed = JSON.parse(text);
                    data = {
                        rectangles: parsed.rectangles || [],
                        connections: parsed.connections || []
                    };
                }

                webviewPanel.webview.postMessage({
                    type: 'loadData',
                    data: data
                });

                // Don't send filename for custom editor - it's shown in the tab
                // (filename display is only needed for sidebar/panel views)
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to load drawing: ${error}`);
            }
        }

        // Track if we're making programmatic changes to avoid reload loops
        let isUpdatingDocument = false;

        // Load initial document content
        updateWebview();

        // Listen for changes to the document (external edits)
        const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.uri.toString() === document.uri.toString() && !isUpdatingDocument) {
                // Only reload if this wasn't a programmatic change from us
                updateWebview();
            }
        });

        // Handle messages from the webview
        webviewPanel.webview.onDidReceiveMessage(async message => {
            switch (message.type) {
                case 'saveDrawing':
                    // For custom editor, save button should trigger document save
                    // First update the document with current data
                    isUpdatingDocument = true;
                    await this.updateTextDocument(document, message.data);
                    isUpdatingDocument = false;
                    // Then save the document
                    await document.save();
                    vscode.window.showInformationMessage('Drawing saved');
                    break;

                case 'dataChanged':
                    // Update the document with the new data (marks as dirty)
                    isUpdatingDocument = true;
                    await this.updateTextDocument(document, message.data);
                    isUpdatingDocument = false;
                    break;

                case 'exportToHTML':
                    await this.exportToHTML(message.data);
                    break;

                case 'exportToSVG':
                    await this.exportToSVG(message.data);
                    break;

                case 'copyToClipboard':
                    vscode.env.clipboard.writeText(message.text);
                    vscode.window.showInformationMessage('Payload copied to clipboard');
                    break;

                case 'openInSidebar':
                    // Store the data and show sidebar view
                    DrawingViewProvider.refreshSidebarWithData(message.data);
                    vscode.commands.executeCommand('workbench.view.extension.pix');
                    break;

                case 'loadDrawing':
                    // For custom editor, we don't need a separate load dialog
                    // Users just open files normally
                    vscode.window.showInformationMessage('To open a file, use File > Open or the Explorer view');
                    break;
            }
        });

        // Handle panel visibility changes to update status bar
        webviewPanel.onDidChangeViewState(() => {
            if (webviewPanel.active) {
                PixEditorProvider.updateStatusBar();
            }
        });

        // Clean up subscriptions when the editor is closed
        webviewPanel.onDidDispose(() => {
            changeDocumentSubscription.dispose();
            // Remove from active editors and hide status bar if no other pix editors are open
            PixEditorProvider.activeEditors.delete(document.uri.toString());
            if (PixEditorProvider.activeEditors.size === 0) {
                PixEditorProvider.statusBarItem.hide();
            }
        });
    }

    /**
     * Update the text document with new drawing data
     */
    private async updateTextDocument(document: vscode.TextDocument, data: any): Promise<void> {
        const edit = new vscode.WorkspaceEdit();

        // Create formatted JSON with metadata
        const saveData = {
            version: "1.0",
            created: new Date().toISOString(),
            rectangles: data.rectangles || [],
            connections: data.connections || []
        };

        const jsonContent = JSON.stringify(saveData, null, 2);

        // Replace the entire document
        const fullRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(document.getText().length)
        );

        edit.replace(document.uri, fullRange, jsonContent);

        await vscode.workspace.applyEdit(edit);
    }

    /**
     * Export drawing to HTML
     */
    private async exportToHTML(data: any): Promise<void> {
        try {
            const saveUri = await vscode.window.showSaveDialog({
                filters: {
                    'HTML Files': ['html'],
                    'All Files': ['*']
                },
                defaultUri: vscode.Uri.file('drawing.html')
            });

            if (saveUri) {
                const htmlContent = this.generateHTMLExport(data);
                await vscode.workspace.fs.writeFile(saveUri, Buffer.from(htmlContent, 'utf8'));
                vscode.window.showInformationMessage(`Drawing exported to ${saveUri.fsPath}`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to export HTML: ${error}`);
        }
    }

    /**
     * Export drawing to SVG
     */
    private async exportToSVG(data: any): Promise<void> {
        try {
            const saveUri = await vscode.window.showSaveDialog({
                filters: {
                    'SVG Files': ['svg'],
                    'All Files': ['*']
                },
                defaultUri: vscode.Uri.file('drawing.svg')
            });

            if (saveUri) {
                const svgContent = this.generateSVGExport(data);
                await vscode.workspace.fs.writeFile(saveUri, Buffer.from(svgContent, 'utf8'));
                vscode.window.showInformationMessage(`Drawing exported to ${saveUri.fsPath}`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to export SVG: ${error}`);
        }
    }

    /**
     * Get the filename from a URI
     */
    private getFileName(uri: vscode.Uri): string {
        const parts = uri.fsPath.split(/[\\/]/);
        return parts[parts.length - 1] || 'Untitled';
    }

    /**
     * Generate HTML for the webview
     */
    private getHtmlForWebview(webview: vscode.Webview): string {
        // Use 'editor' context for custom editors - this won't show filename display
        // since the filename is already in the tab
        return new DrawingViewProvider(this.context.extensionUri)['_getHtmlForWebview'](webview, 'editor');
    }

    /**
     * Generate HTML export content
     */
    private generateHTMLExport(data: any): string {
        // This is a simplified version - you may want to enhance this
        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Pix Drawing Export</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        canvas { border: 1px solid #ccc; }
    </style>
</head>
<body>
    <h1>Pix Drawing</h1>
    <canvas id="canvas" width="800" height="600"></canvas>
    <script>
        const data = ${JSON.stringify(data, null, 2)};
        // Add rendering code here if needed
        console.log('Drawing data:', data);
    </script>
</body>
</html>`;
    }

    /**
     * Generate SVG export content
     */
    private generateSVGExport(data: any): string {
        // This is a simplified version - you may want to enhance this
        let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">\n';

        // Add rectangles
        if (data.rectangles) {
            data.rectangles.forEach((rect: any) => {
                svg += `  <rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" `;
                svg += `fill="${rect.color || '#cccccc'}" stroke="#000" />\n`;
            });
        }

        // Add connections
        if (data.connections) {
            data.connections.forEach((conn: any) => {
                svg += `  <line x1="${conn.x1}" y1="${conn.y1}" x2="${conn.x2}" y2="${conn.y2}" `;
                svg += `stroke="#000" stroke-width="2" />\n`;
            });
        }

        svg += '</svg>';
        return svg;
    }
}
