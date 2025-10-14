import * as vscode from 'vscode';

export class DrawingViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'rectangleDrawerView';
    private static currentPanel: vscode.WebviewPanel | undefined;
    private static currentData: any = { rectangles: [], connections: [] }; // Shared data store
    private static sidebarInstance: vscode.WebviewView | undefined;
    private static currentFilePath: string | undefined;
    private static lastSaveLocation: vscode.Uri | undefined;
    private static lastLoadLocation: vscode.Uri | undefined;

    constructor(private readonly _extensionUri: vscode.Uri) { }

    // Method to refresh sidebar with current data
    public static refreshSidebarWithData(data: any) {
        console.log('refreshSidebarWithData called with:', data);
        console.log('Sidebar instance exists:', !!DrawingViewProvider.sidebarInstance);
        if (DrawingViewProvider.sidebarInstance) {
            console.log('Refreshing sidebar with data:', data);
            DrawingViewProvider.sidebarInstance.webview.postMessage({
                type: 'loadData',
                data: data
            });

            // Also update filename display if there's a current file
            if (DrawingViewProvider.currentFilePath) {
                DrawingViewProvider.sidebarInstance.webview.postMessage({
                    type: 'updateFileName',
                    filePath: DrawingViewProvider.currentFilePath
                });
            }
        } else {
            console.log('No sidebar instance available');
        }
    }

    // Method to update sidebar view title
    public static updateSidebarTitle(filePath?: string) {
        if (filePath) {
            const fileName = vscode.Uri.parse(filePath).fsPath.split(/[\\/]/).pop() || 'Untitled';
            DrawingViewProvider.currentFilePath = filePath;
            // Update view title with PIX and filename
            vscode.commands.executeCommand('setContext', 'pixView.title', `PIX ${fileName}`);
        } else {
            DrawingViewProvider.currentFilePath = undefined;
            // Reset to default title
            vscode.commands.executeCommand('setContext', 'pixView.title', 'PIX');
        }
    }

    // Method to update panel title
    public static updatePanelTitle(filePath?: string) {
        if (DrawingViewProvider.currentPanel && filePath) {
            const fileName = vscode.Uri.parse(filePath).fsPath.split(/[\\/]/).pop() || 'Untitled';
            DrawingViewProvider.currentPanel.title = `Pix - ${fileName}`;
        } else if (DrawingViewProvider.currentPanel) {
            DrawingViewProvider.currentPanel.title = 'Pix';
        }
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        // Store reference to sidebar instance
        DrawingViewProvider.sidebarInstance = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
            enableCommandUris: true
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview, 'sidebar');

        // Load current data if available
        if (DrawingViewProvider.currentData) {
            console.log('Sidebar resolving with data:', DrawingViewProvider.currentData);
            // Send data after webview is ready
            setTimeout(() => {
                webviewView.webview.postMessage({
                    type: 'loadData',
                    data: DrawingViewProvider.currentData
                });
                console.log('Sidebar loaded with data:', DrawingViewProvider.currentData);
            }, 500);
        } else {
            console.log('No current data available for sidebar');
        }

        webviewView.webview.onDidReceiveMessage(
            message => {
                switch (message.type) {
                    case 'saveDrawing':
                        this._saveDrawing(message.data);
                        break;
                    case 'loadDrawing':
                        this._loadDrawing(webviewView.webview);
                        break;
                    case 'exportToHTML':
                        this._exportToHTML(message.data);
                        break;
                    case 'exportToSVG':
                        this._exportToSVG(message.data);
                        break;
                    case 'copyToClipboard':
                        vscode.env.clipboard.writeText(message.text);
                        vscode.window.showInformationMessage('Payload copied to clipboard');
                        break;
                    case 'dataChanged':
                        // Update shared data store
                        DrawingViewProvider.currentData = message.data;
                        break;
                    case 'openInPanel':
                        this._openInPanelWithData(message.data);
                        break;
                    case 'openInSidebar':
                        // Store the data and show sidebar view
                        if (message.data) {
                            DrawingViewProvider.currentData = message.data;
                        }
                        // Focus the sidebar activity bar and view
                        vscode.commands.executeCommand('workbench.view.extension.pix').then(() => {
                            // After sidebar is shown, refresh with data
                            setTimeout(() => {
                                DrawingViewProvider.refreshSidebarWithData(DrawingViewProvider.currentData);
                            }, 200);
                        });
                        break;
                    case 'clearTitles':
                        DrawingViewProvider.currentFilePath = undefined;
                        DrawingViewProvider.updateSidebarTitle();
                        DrawingViewProvider.updatePanelTitle();

                        // Clear filename display in webviews
                        if (DrawingViewProvider.currentPanel) {
                            DrawingViewProvider.currentPanel.webview.postMessage({
                                type: 'updateFileName',
                                filePath: null
                            });
                        }
                        if (DrawingViewProvider.sidebarInstance) {
                            DrawingViewProvider.sidebarInstance.webview.postMessage({
                                type: 'updateFileName',
                                filePath: null
                            });
                        }
                        break;
                }
            }
        );
    }

    public static createOrShow(extensionUri: vscode.Uri, initialData?: any) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (DrawingViewProvider.currentPanel) {
            DrawingViewProvider.currentPanel.reveal(column);
            // Update with new data if provided
            if (initialData) {
                DrawingViewProvider.currentData = initialData;
                DrawingViewProvider.currentPanel.webview.postMessage({
                    type: 'loadData',
                    data: initialData
                });
            }

            // Update filename if available
            if (DrawingViewProvider.currentFilePath) {
                DrawingViewProvider.currentPanel.webview.postMessage({
                    type: 'updateFileName',
                    filePath: DrawingViewProvider.currentFilePath
                });
            }
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            DrawingViewProvider.viewType,
            'Rectangle Drawer',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [extensionUri],
                retainContextWhenHidden: true,
                enableCommandUris: true
            }
        );

        DrawingViewProvider.currentPanel = panel;

        panel.webview.html = new DrawingViewProvider(extensionUri)._getHtmlForWebview(panel.webview, 'panel');

        // Load initial data if provided, otherwise use shared data
        const dataToLoad = initialData || DrawingViewProvider.currentData;
        setTimeout(() => {
            panel.webview.postMessage({ type: 'loadData', data: dataToLoad });

            // Send filename if we have one
            if (DrawingViewProvider.currentFilePath) {
                panel.webview.postMessage({
                    type: 'updateFileName',
                    filePath: DrawingViewProvider.currentFilePath
                });
            }
        }, 500);

        panel.onDidDispose(() => {
            DrawingViewProvider.currentPanel = undefined;
        });

        panel.webview.onDidReceiveMessage(
            message => {
                const provider = new DrawingViewProvider(extensionUri);
                switch (message.type) {
                    case 'saveDrawing':
                        provider._saveDrawing(message.data);
                        break;
                    case 'loadDrawing':
                        provider._loadDrawing(panel.webview);
                        break;
                    case 'exportToHTML':
                        provider._exportToHTML(message.data);
                        break;
                    case 'exportToSVG':
                        provider._exportToSVG(message.data);
                        break;
                    case 'copyToClipboard':
                        vscode.env.clipboard.writeText(message.text);
                        vscode.window.showInformationMessage('Payload copied to clipboard');
                        break;
                    case 'dataChanged':
                        DrawingViewProvider.currentData = message.data;
                        break;
                    case 'openInSidebar':
                        // Store the data and show sidebar view
                        if (message.data) {
                            DrawingViewProvider.currentData = message.data;
                        }
                        // Focus the sidebar activity bar and view
                        vscode.commands.executeCommand('workbench.view.extension.pix').then(() => {
                            // After sidebar is shown, refresh with data
                            setTimeout(() => {
                                DrawingViewProvider.refreshSidebarWithData(DrawingViewProvider.currentData);
                            }, 200);
                        });
                        // Close panel after a brief delay
                        setTimeout(() => panel.dispose(), 400);
                        break;
                    case 'clearTitles':
                        DrawingViewProvider.currentFilePath = undefined;
                        DrawingViewProvider.updateSidebarTitle();
                        DrawingViewProvider.updatePanelTitle();

                        // Clear filename display in webviews
                        if (DrawingViewProvider.currentPanel) {
                            DrawingViewProvider.currentPanel.webview.postMessage({
                                type: 'updateFileName',
                                filePath: null
                            });
                        }
                        if (DrawingViewProvider.sidebarInstance) {
                            DrawingViewProvider.sidebarInstance.webview.postMessage({
                                type: 'updateFileName',
                                filePath: null
                            });
                        }
                        break;
                }
            }
        );
    }

    private _openInPanelWithData(data: any) {
        // Store the current data
        DrawingViewProvider.currentData = data;
        // Create or show panel with data
        DrawingViewProvider.createOrShow(this._extensionUri, data);

        // Update filename in panel if there's a current file
        if (DrawingViewProvider.currentFilePath && DrawingViewProvider.currentPanel) {
            setTimeout(() => {
                if (DrawingViewProvider.currentPanel) {
                    DrawingViewProvider.currentPanel.webview.postMessage({
                        type: 'updateFileName',
                        filePath: DrawingViewProvider.currentFilePath
                    });
                }
            }, 200);
        }

        // Close sidebar view by focusing on the panel
        vscode.commands.executeCommand('workbench.action.closeSidebar');
    }

    private async _saveDrawing(data: any) {
        try {
            // Update shared data
            DrawingViewProvider.currentData = data;

            // Determine default URI based on last save location
            let defaultUri: vscode.Uri;
            if (DrawingViewProvider.lastSaveLocation) {
                // Use same directory as last save
                const lastDir = vscode.Uri.joinPath(DrawingViewProvider.lastSaveLocation, '..');
                defaultUri = vscode.Uri.joinPath(lastDir, 'drawing.pix.json');
            } else if (DrawingViewProvider.lastLoadLocation) {
                // Use same directory as last load if no save location
                const lastDir = vscode.Uri.joinPath(DrawingViewProvider.lastLoadLocation, '..');
                defaultUri = vscode.Uri.joinPath(lastDir, 'drawing.pix.json');
            } else {
                defaultUri = vscode.Uri.file('drawing.pix.json');
            }

            // Show save dialog
            const saveUri = await vscode.window.showSaveDialog({
                defaultUri: defaultUri,
                filters: {
                    'Pix Files': ['pix.json'],
                    'JSON Files': ['json'],
                    'All Files': ['*']
                }
            });

            if (saveUri) {
                // Remember this location for next time
                DrawingViewProvider.lastSaveLocation = saveUri;

                // Create formatted JSON with metadata
                const saveData = {
                    version: "1.0",
                    created: new Date().toISOString(),
                    rectangles: data.rectangles,
                    connections: data.connections
                };

                const jsonContent = JSON.stringify(saveData, null, 2);
                await vscode.workspace.fs.writeFile(saveUri, Buffer.from(jsonContent, 'utf8'));

                // Update last save location and titles
                DrawingViewProvider.lastSaveLocation = saveUri;
                DrawingViewProvider.currentFilePath = saveUri.fsPath;
                DrawingViewProvider.updateSidebarTitle(saveUri.fsPath);
                DrawingViewProvider.updatePanelTitle(saveUri.fsPath);

                // Update filename display in webviews
                if (DrawingViewProvider.currentPanel) {
                    DrawingViewProvider.currentPanel.webview.postMessage({
                        type: 'updateFileName',
                        filePath: saveUri.fsPath
                    });
                }
                if (DrawingViewProvider.sidebarInstance) {
                    DrawingViewProvider.sidebarInstance.webview.postMessage({
                        type: 'updateFileName',
                        filePath: saveUri.fsPath
                    });
                }

                vscode.window.showInformationMessage(`Drawing saved to ${saveUri.fsPath}`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to save drawing: ${error}`);
        }
    }

    private async _loadDrawing(webview: vscode.Webview) {
        try {
            // Determine default URI based on last load or save location
            let defaultUri: vscode.Uri | undefined;
            if (DrawingViewProvider.lastLoadLocation) {
                // Use same directory as last load
                defaultUri = vscode.Uri.joinPath(DrawingViewProvider.lastLoadLocation, '..');
            } else if (DrawingViewProvider.lastSaveLocation) {
                // Use same directory as last save if no load location
                defaultUri = vscode.Uri.joinPath(DrawingViewProvider.lastSaveLocation, '..');
            }

            // Show open dialog
            const openUri = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                defaultUri: defaultUri,
                filters: {
                    'Pix Files': ['pix.json'],
                    'JSON Files': ['json'],
                    'All Files': ['*']
                }
            });

            if (openUri && openUri[0]) {
                // Remember this location for next time
                DrawingViewProvider.lastLoadLocation = openUri[0];

                const fileContent = await vscode.workspace.fs.readFile(openUri[0]);
                const jsonContent = Buffer.from(fileContent).toString('utf8');
                const loadedData = JSON.parse(jsonContent);

                // Extract rectangles and connections, handling different formats
                const data = {
                    rectangles: loadedData.rectangles || [],
                    connections: loadedData.connections || []
                };

                // Update shared data
                DrawingViewProvider.currentData = data;

                // Update last load location and titles
                DrawingViewProvider.lastLoadLocation = openUri[0];
                DrawingViewProvider.currentFilePath = openUri[0].fsPath;
                DrawingViewProvider.updateSidebarTitle(openUri[0].fsPath);
                DrawingViewProvider.updatePanelTitle(openUri[0].fsPath);

                // Send to webview
                webview.postMessage({ type: 'loadData', data: data });

                // Update filename display in webviews
                if (DrawingViewProvider.currentPanel) {
                    DrawingViewProvider.currentPanel.webview.postMessage({
                        type: 'updateFileName',
                        filePath: openUri[0].fsPath
                    });
                }
                if (DrawingViewProvider.sidebarInstance) {
                    DrawingViewProvider.sidebarInstance.webview.postMessage({
                        type: 'updateFileName',
                        filePath: openUri[0].fsPath
                    });
                }

                vscode.window.showInformationMessage(`Drawing loaded from ${openUri[0].fsPath}`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load drawing: ${error}`);
        }
    }

    private async _exportToHTML(data: any) {
        try {
            // Determine default URI for HTML export
            let defaultUri: vscode.Uri;
            if (DrawingViewProvider.lastSaveLocation) {
                const lastDir = vscode.Uri.joinPath(DrawingViewProvider.lastSaveLocation, '..');
                defaultUri = vscode.Uri.joinPath(lastDir, 'rectangle-drawing.html');
            } else if (DrawingViewProvider.lastLoadLocation) {
                const lastDir = vscode.Uri.joinPath(DrawingViewProvider.lastLoadLocation, '..');
                defaultUri = vscode.Uri.joinPath(lastDir, 'rectangle-drawing.html');
            } else {
                defaultUri = vscode.Uri.file('rectangle-drawing.html');
            }

            // Show save dialog
            const saveUri = await vscode.window.showSaveDialog({
                defaultUri: defaultUri,
                filters: {
                    'HTML Files': ['html'],
                    'All Files': ['*']
                }
            });

            if (saveUri) {
                // Generate standalone HTML content
                const htmlContent = this._generateStandaloneHTML(data);
                await vscode.workspace.fs.writeFile(saveUri, Buffer.from(htmlContent, 'utf8'));

                vscode.window.showInformationMessage(`Drawing exported to ${saveUri.fsPath}`);

                // Open in default browser
                await vscode.env.openExternal(saveUri);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to export drawing: ${error}`);
        }
    }

    private async _exportToSVG(data: any) {
        try {
            // Determine default URI for SVG export
            let defaultUri: vscode.Uri;
            if (DrawingViewProvider.lastSaveLocation) {
                const lastDir = vscode.Uri.joinPath(DrawingViewProvider.lastSaveLocation, '..');
                defaultUri = vscode.Uri.joinPath(lastDir, 'rectangle-drawing.svg');
            } else if (DrawingViewProvider.lastLoadLocation) {
                const lastDir = vscode.Uri.joinPath(DrawingViewProvider.lastLoadLocation, '..');
                defaultUri = vscode.Uri.joinPath(lastDir, 'rectangle-drawing.svg');
            } else {
                defaultUri = vscode.Uri.file('rectangle-drawing.svg');
            }

            // Show save dialog
            const saveUri = await vscode.window.showSaveDialog({
                defaultUri: defaultUri,
                filters: {
                    'SVG Files': ['svg'],
                    'All Files': ['*']
                }
            });

            if (saveUri) {
                // Generate SVG content
                const svgContent = this._generateSVG(data);
                await vscode.workspace.fs.writeFile(saveUri, Buffer.from(svgContent, 'utf8'));

                vscode.window.showInformationMessage(`Drawing exported to ${saveUri.fsPath}`);

                // Open in default application
                await vscode.env.openExternal(saveUri);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to export SVG: ${error}`);
        }
    }

    private _generateStandaloneHTML(data: any): string {
        const backgroundColor = data.darkBackground ? '#1e1e1e' : '#ffffff';
        const textColor = data.darkBackground ? '#ffffff' : '#000000';
        const tooltipBg = data.darkBackground ? '#252526' : '#f8f8f8';
        const tooltipBorder = data.darkBackground ? '#454545' : '#d1d1d1';
        const tooltipText = data.darkBackground ? '#cccccc' : '#333333';

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Rectangle Drawing Export</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background-color: ${backgroundColor};
            color: ${textColor};
            overflow: hidden;
            width: 100vw;
            height: 100vh;
        }
        
        #canvas {
            border: none;
            cursor: crosshair;
            background-color: ${backgroundColor};
            display: block;
            width: 100%;
            height: 100%;
        }
        
        .tooltip {
            position: absolute;
            background: ${tooltipBg};
            border: 1px solid ${tooltipBorder};
            border-radius: 3px;
            padding: 8px 12px;
            color: ${tooltipText};
            font-size: 12px;
            z-index: 1500;
            max-width: 300px;
            white-space: pre-wrap;
            word-wrap: break-word;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
            pointer-events: none;
            display: none;
        }
    </style>
</head>
<body>
    <canvas id="canvas"></canvas>
    <div id="tooltip" class="tooltip"></div>
    
    <script>
        const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d');
        
        // Set canvas size to full window
        function resizeCanvas() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            draw();
        }
        
        window.addEventListener('resize', resizeCanvas);
        
        // Grid and zoom settings
        let zoom = 1;
        let panX = 0;
        let panY = 0;
        const gridSize = 10;
        let darkBackground = ${data.darkBackground || false}; // Background mode for adaptive colors
        
        // Data
        let rectangles = [];
        let connections = [];
        
        // Classes
        class Rectangle {
            constructor(x, y, width, height, name = '', description = '', payload = '', color = '#ffffff', type = 'regular') {
                this.x = x;
                this.y = y;
                this.width = width;
                this.height = height;
                this.selected = false;
                this.id = Math.random().toString(36).substr(2, 9);
                this.name = name;
                this.description = description;
                this.payload = payload;
                this.color = color;
                this.type = type; // 'regular' or 'collection'
            }
            
            contains(x, y) {
                // Check main rectangle area
                const inMainArea = x >= this.x && x <= this.x + this.width &&
                                   y >= this.y && y <= this.y + this.height;
                
                // For collection boxes, also check name box area (positioned hard against upper left)
                if (this.type === 'collection' && this.name) {
                    const nameBoxWidth = Math.max(this.name.length * 8, 40);
                    const nameBoxHeight = 20;
                    const nameBoxX = this.x; // Hard against the collection box
                    const nameBoxY = this.y; // Hard against the collection box
                    
                    const inNameBox = x >= nameBoxX && x <= nameBoxX + nameBoxWidth &&
                                      y >= nameBoxY && y <= nameBoxY + nameBoxHeight;
                    
                    return inMainArea || inNameBox;
                }
                
                return inMainArea;
            }

            isHoveringNameBox(x, y) {
                // For collection boxes, check if hovering over the name box
                if (this.type === 'collection' && this.name) {
                    const nameBoxWidth = Math.max(this.name.length * 8, 40);
                    const nameBoxHeight = 20;
                    const nameBoxX = this.x;
                    const nameBoxY = this.y;

                    return x >= nameBoxX && x <= nameBoxX + nameBoxWidth &&
                           y >= nameBoxY && y <= nameBoxY + nameBoxHeight;
                }
                // For regular rectangles, any hover counts
                return this.contains(x, y);
            }
        }

        class Connection {
            constructor(fromRect, fromPoint, toRect, toPoint, label = '', description = '', payload = '', color = '#4ecdc4', lineStyle = 'solid') {
                this.fromRect = fromRect;
                this.fromPoint = fromPoint;
                this.toRect = toRect;
                this.toPoint = toPoint;
                this.id = Math.random().toString(36).substr(2, 9);
                this.selected = false;
                this.label = label;
                this.description = description;
                this.payload = payload;
                this.color = color;
                this.lineStyle = lineStyle;
                this.labelPosition = null;
            }
            
            getConnectionPoints() {
                const fromEdge = { x: this.fromRect.x + this.fromRect.width, y: this.fromRect.y + this.fromRect.height / 2 };
                const toEdge = { x: this.toRect.x, y: this.toRect.y + this.toRect.height / 2 };
                return { from: fromEdge, to: toEdge };
            }
            
            isNearConnection(x, y, tolerance = 8) {
                const points = this.getConnectionPoints();
                for (let t = 0; t <= 1; t += 0.05) {
                    const curvePoint = getBezierPoint(points.from.x, points.from.y, points.to.x, points.to.y, t);
                    const distance = Math.sqrt((x - curvePoint.x) ** 2 + (y - curvePoint.y) ** 2);
                    if (distance <= tolerance / zoom) {
                        return true;
                    }
                }
                return false;
            }

            isLabelClicked(x, y) {
                if (!this.label || this.label.trim() === '') return false;

                const points = this.getConnectionPoints();
                let labelPos;

                if (this.labelPosition) {
                    labelPos = this.labelPosition;
                } else {
                    labelPos = getBezierPoint(points.from.x, points.from.y, points.to.x, points.to.y, 0.5);
                }

                // Calculate label dimensions accurately
                const fontSize = Math.max(10 / zoom, 6);
                ctx.font = fontSize + 'px Arial';
                const textMetrics = ctx.measureText(this.label);
                const textWidth = textMetrics.width;
                const labelWidth = textWidth + 8 / zoom;
                const labelHeight = fontSize + 4 / zoom;

                return x >= labelPos.x - labelWidth/2 &&
                       x <= labelPos.x + labelWidth/2 &&
                       y >= labelPos.y - labelHeight/2 &&
                       y <= labelPos.y + labelHeight/2;
            }
        }

        function getBezierPoint(fromX, fromY, toX, toY, t) {
            const distance = Math.abs(toX - fromX);
            const curveOffset = Math.min(distance * 0.5, 80);
            const cp1X = fromX + curveOffset;
            const cp1Y = fromY;
            const cp2X = toX - curveOffset;
            const cp2Y = toY;
            
            const t1 = 1 - t;
            const t12 = t1 * t1;
            const t13 = t12 * t1;
            const t2 = t * t;
            const t3 = t2 * t;
            
            return {
                x: t13 * fromX + 3 * t12 * t * cp1X + 3 * t1 * t2 * cp2X + t3 * toX,
                y: t13 * fromY + 3 * t12 * t * cp1Y + 3 * t1 * t2 * cp2Y + t3 * toY
            };
        }
        
        function drawGrid() {
            ctx.save();
            ctx.setTransform(zoom, 0, 0, zoom, panX, panY);
            
            // Calculate visible area in world coordinates
            const startX = Math.floor((-panX) / zoom / gridSize) * gridSize;
            const startY = Math.floor((-panY) / zoom / gridSize) * gridSize;
            const endX = Math.ceil((canvas.width - panX) / zoom / gridSize) * gridSize;
            const endY = Math.ceil((canvas.height - panY) / zoom / gridSize) * gridSize;
            
            // Set dot style - subtle gray dots
            ctx.fillStyle = 'rgba(128, 128, 128, 0.3)';
            const dotRadius = 1 / zoom; // Very small dots that scale with zoom
            
            // Draw dots at each grid intersection
            for (let x = startX; x <= endX; x += gridSize) {
                for (let y = startY; y <= endY; y += gridSize) {
                    ctx.beginPath();
                    ctx.arc(x, y, dotRadius, 0, 2 * Math.PI);
                    ctx.fill();
                }
            }
            
            ctx.restore();
        }
        
        function drawCurvedConnection(fromX, fromY, toX, toY, connection = null) {
            ctx.beginPath();
            ctx.moveTo(fromX, fromY);
            
            const distance = Math.abs(toX - fromX);
            const curveOffset = Math.min(distance * 0.5, 80);
            const cp1X = fromX + curveOffset;
            const cp1Y = fromY;
            const cp2X = toX - curveOffset;
            const cp2Y = toY;
            
            ctx.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, toX, toY);
            ctx.stroke();
        }
        
        function drawConnectionDot(x, y) {
            ctx.fillStyle = '#4ecdc4';
            const radius = 4 / zoom;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, 2 * Math.PI);
            ctx.fill();
            
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1 / zoom;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, 2 * Math.PI);
            ctx.stroke();
        }
        
        function drawRectangleText(rectangle) {
            if (!rectangle.name) return;
            
            ctx.fillStyle = '#ffffff';
            ctx.font = (12 / zoom) + 'px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            const centerX = rectangle.x + rectangle.width / 2;
            const centerY = rectangle.y + rectangle.height / 2;
            
            ctx.fillText(rectangle.name, centerX, centerY);
        }
        
        // Helper function to determine if text should be black or white for best contrast
        function getContrastColor(backgroundColor) {
            // Remove # if present
            const hex = backgroundColor.replace('#', '');
            
            // Convert to RGB
            const r = parseInt(hex.substr(0, 2), 16);
            const g = parseInt(hex.substr(2, 2), 16);
            const b = parseInt(hex.substr(4, 2), 16);
            
            // Calculate luminance using relative luminance formula
            const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
            
            // Return black for light colors, white for dark colors
            return luminance > 0.5 ? '#000000' : '#ffffff';
        }
        
        function drawConnectionLabel(connection) {
            if (!connection.label) return;
            
            const points = connection.getConnectionPoints();
            let labelPos;
            
            if (connection.labelPosition) {
                labelPos = connection.labelPosition;
            } else {
                labelPos = getBezierPoint(points.from.x, points.from.y, points.to.x, points.to.y, 0.5);
            }
            
            // Use connection color for background, or default
            const backgroundColor = connection.color || '#4ecdc4';
            const textColor = getContrastColor(backgroundColor);
            
            ctx.font = (10 / zoom) + 'px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            const textWidth = ctx.measureText(connection.label).width + 8 / zoom;
            const textHeight = 16 / zoom;
            const radius = textHeight / 2; // Make radius half the height for lozenge shape
            
            // Draw rounded rectangle (lozenge) background
            ctx.fillStyle = backgroundColor;
            ctx.beginPath();
            ctx.roundRect(labelPos.x - textWidth/2, labelPos.y - textHeight/2, textWidth, textHeight, radius);
            ctx.fill();
            
            // Draw text with contrasting color
            ctx.fillStyle = textColor;
            ctx.fillText(connection.label, labelPos.x, labelPos.y);
        }
        
        function draw() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            drawGrid();
            
            ctx.save();
            ctx.setTransform(zoom, 0, 0, zoom, panX, panY);
            
            // Draw connections
            connections.forEach(conn => {
                const points = conn.getConnectionPoints();
                const fromPoint = points.from;
                const toPoint = points.to;
                
                ctx.strokeStyle = conn.color || '#4ecdc4';
                ctx.lineWidth = 2 / zoom;
                
                // Set line style
                const lineStyle = conn.lineStyle || 'solid';
                if (lineStyle === 'thick-dotted') {
                    ctx.setLineDash([2.25 / zoom, 8 / zoom]); // Short dots with gaps (75% of previous length)
                    ctx.lineWidth = 4 / zoom; // Make it thicker
                    ctx.lineCap = 'round'; // Round the ends to make dots
                } else if (lineStyle === 'dashed') {
                    ctx.setLineDash([15 / zoom, 10 / zoom]); // Dashed line
                    ctx.lineCap = 'butt'; // Normal line caps for dashes
                } else {
                    ctx.setLineDash([]); // Solid line
                    ctx.lineCap = 'butt'; // Normal line caps
                }
                
                drawCurvedConnection(fromPoint.x, fromPoint.y, toPoint.x, toPoint.y, conn);
                
                // Reset line dash, width, and cap
                ctx.setLineDash([]);
                ctx.lineWidth = conn.selected ? 3 / zoom : 2 / zoom;
                ctx.lineCap = 'butt';
                
                drawConnectionDot(fromPoint.x, fromPoint.y);
                drawConnectionDot(toPoint.x, toPoint.y);

                if (conn.label && conn.label.trim() !== '') {
                    drawConnectionLabel(conn);
                }

                // Draw payload indicator for connections with non-trivial payload
                if (conn.payload && conn.payload.trim() !== '') {
                    try {
                        let indicatorPos;

                        if (conn.labelPosition) {
                            indicatorPos = conn.labelPosition;
                        } else {
                            indicatorPos = getBezierPoint(fromPoint.x, fromPoint.y, toPoint.x, toPoint.y, 0.5);
                        }

                        // If there's a label, position the dot to the left of it
                        let dotX = indicatorPos.x;
                        let dotY = indicatorPos.y;

                        if (conn.label && conn.label.trim() !== '') {
                            ctx.font = (10 / zoom) + 'px Arial';
                            const textWidth = ctx.measureText(conn.label).width + 8 / zoom;
                            dotX = indicatorPos.x - textWidth/2 - 10 / zoom; // Position to the left of the label
                        }

                        const indicatorSize = 6 / zoom;

                        ctx.fillStyle = '#cc0000'; // Darker red color
                        ctx.beginPath();
                        ctx.arc(dotX, dotY, indicatorSize, 0, 2 * Math.PI);
                        ctx.fill();

                        // Add a subtle white border for better visibility
                        ctx.strokeStyle = '#ffffff';
                        ctx.lineWidth = 1 / zoom;
                        ctx.stroke();
                    } catch (e) {
                        console.error('Error drawing connection payload indicator:', e);
                    }
                }
            });
            
            // Draw rectangles
            rectangles.forEach(rectangle => {
                const hasLeftConnections = connections.some(c => c.toRect === rectangle);
                const hasRightConnections = connections.some(c => c.fromRect === rectangle);
                
                // Handle collection boxes differently
                if (rectangle.type === 'collection') {
                    // Collection boxes: use rectangle color for border, no fill for container
                    ctx.fillStyle = 'transparent';
                    
                    // Use rectangle color or default to adaptive color
                    let borderColor = rectangle.color && rectangle.color !== '#ffffff' ? rectangle.color : (darkBackground ? '#cccccc' : '#333333');
                    if (rectangle.selected) {
                        borderColor = '#6496ff';
                    }
                    
                    ctx.strokeStyle = borderColor;
                    ctx.setLineDash([5, 5]); // Dotted line
                    ctx.lineWidth = rectangle.selected ? 2 / zoom : 1 / zoom;
                    
                    // Draw collection box with all corners rounded
                    const radius = 10; // Collection box corner radius
                    ctx.beginPath();
                    ctx.roundRect(rectangle.x, rectangle.y, rectangle.width, rectangle.height, radius);
                    ctx.stroke();
                    
                    ctx.setLineDash([]); // Reset to solid line for other elements
                    
                    // Draw name box hard against upper left corner for collection boxes (always show for collections)
                    if (rectangle.name) {
                        const nameBoxWidth = Math.max(rectangle.name.length * 8, 40);
                        const nameBoxHeight = 20;
                        const nameBoxX = rectangle.x; // Hard against the collection box
                        const nameBoxY = rectangle.y; // Hard against the collection box
                        const nameRadius = nameBoxHeight / 2; // Radius = half height
                        
                        // Use rectangle color for name box fill, or default background
                        let nameBoxFillColor;
                        if (rectangle.color && rectangle.color !== '#ffffff') {
                            nameBoxFillColor = rectangle.color;
                        } else {
                            nameBoxFillColor = darkBackground ? 'rgba(60, 60, 60, 0.9)' : 'rgba(240, 240, 240, 0.9)';
                        }
                        
                        // Draw custom rounded rectangle (top-left, bottom-right rounded only)
                        ctx.fillStyle = nameBoxFillColor;
                        ctx.strokeStyle = borderColor;
                        ctx.lineWidth = 1 / zoom;
                        
                        // Custom path with selective rounded corners
                        ctx.beginPath();
                        // Start at top-left, move clockwise
                        ctx.moveTo(nameBoxX + nameRadius, nameBoxY); // Top edge start (after top-left curve)
                        ctx.lineTo(nameBoxX + nameBoxWidth, nameBoxY); // Top edge to top-right (no curve)
                        ctx.lineTo(nameBoxX + nameBoxWidth, nameBoxY + nameBoxHeight - nameRadius); // Right edge to bottom-right curve
                        ctx.arcTo(nameBoxX + nameBoxWidth, nameBoxY + nameBoxHeight, nameBoxX + nameBoxWidth - nameRadius, nameBoxY + nameBoxHeight, nameRadius); // Bottom-right curve
                        ctx.lineTo(nameBoxX, nameBoxY + nameBoxHeight); // Bottom edge to bottom-left (no curve)
                        ctx.lineTo(nameBoxX, nameBoxY + nameRadius); // Left edge to top-left curve
                        ctx.arcTo(nameBoxX, nameBoxY, nameBoxX + nameRadius, nameBoxY, nameRadius); // Top-left curve
                        ctx.closePath();
                        
                        ctx.fill();
                        ctx.stroke();
                        
                        // Draw name text with contrasting color
                        const textColor = getContrastColor(nameBoxFillColor);
                        ctx.fillStyle = textColor;
                        ctx.font = (12 / zoom) + 'px Arial';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(rectangle.name, nameBoxX + nameBoxWidth / 2, nameBoxY + nameBoxHeight / 2);
                    }
                } else {
                    // Regular rectangles: existing behavior
                    // Convert hex color to rgba with low opacity for subtle background
                    let fillColor = 'rgba(255, 255, 255, 0.1)'; // Default white
                    if (rectangle.color && rectangle.color !== '#ffffff') {
                        const hexColor = rectangle.color;
                        const r = parseInt(hexColor.substr(1, 2), 16);
                        const g = parseInt(hexColor.substr(3, 2), 16);
                        const b = parseInt(hexColor.substr(5, 2), 16);
                        fillColor = 'rgba(' + r + ', ' + g + ', ' + b + ', 0.15)'; // Subtle 15% opacity
                    }
                    
                    if (rectangle.selected) {
                        ctx.fillStyle = 'rgba(100, 150, 255, 0.3)';
                        ctx.strokeStyle = '#6496ff';
                    } else {
                        ctx.fillStyle = fillColor;
                        // Adaptive border color based on background
                        ctx.strokeStyle = darkBackground ? '#cccccc' : '#333333';
                    }
                    
                    // Fill the rectangle
                    ctx.fillRect(rectangle.x, rectangle.y, rectangle.width, rectangle.height);
                
                    // Draw rectangle outline with variable thickness (only for regular rectangles)
                    if (hasLeftConnections || hasRightConnections) {
                        // Draw each edge separately with appropriate thickness
                        const normalWidth = rectangle.selected ? 2 / zoom : 1 / zoom;
                        const thickWidth = 5 / zoom; // 25% thicker than connection dot radius (4 * 1.25 = 5)
                        
                        ctx.beginPath();
                        
                        // Left edge (incoming connections)
                        ctx.lineWidth = hasLeftConnections ? thickWidth : normalWidth;
                        ctx.beginPath();
                        ctx.moveTo(rectangle.x, rectangle.y);
                        ctx.lineTo(rectangle.x, rectangle.y + rectangle.height);
                        ctx.stroke();
                        
                        // Right edge (outgoing connections)
                        ctx.lineWidth = hasRightConnections ? thickWidth : normalWidth;
                        ctx.beginPath();
                        ctx.moveTo(rectangle.x + rectangle.width, rectangle.y);
                        ctx.lineTo(rectangle.x + rectangle.width, rectangle.y + rectangle.height);
                        ctx.stroke();
                        
                        // Top and bottom edges (normal thickness)
                        ctx.lineWidth = normalWidth;
                        ctx.beginPath();
                        ctx.moveTo(rectangle.x, rectangle.y);
                        ctx.lineTo(rectangle.x + rectangle.width, rectangle.y);
                        ctx.stroke();
                        
                        ctx.beginPath();
                        ctx.moveTo(rectangle.x, rectangle.y + rectangle.height);
                        ctx.lineTo(rectangle.x + rectangle.width, rectangle.y + rectangle.height);
                        ctx.stroke();
                    } else {
                        // No connections, draw normal outline
                        ctx.lineWidth = rectangle.selected ? 2 / zoom : 1 / zoom;
                        ctx.strokeRect(rectangle.x, rectangle.y, rectangle.width, rectangle.height);
                    }
                    
                    // Draw rectangle name if it exists (only for regular rectangles)
                    if (rectangle.name && rectangle.name.trim() !== '') {
                        drawRectangleText(rectangle);
                    }
                } // End of regular rectangle block
                
                // Draw payload indicator for all rectangles with non-trivial payload
                if (rectangle.payload && rectangle.payload.trim() !== '') {
                    const indicatorSize = 6 / zoom; // Size of the red dot
                    const indicatorX = rectangle.x + indicatorSize + 2 / zoom; // Bottom left corner with small margin
                    const indicatorY = rectangle.y + rectangle.height - indicatorSize - 2 / zoom;
                    
                    ctx.fillStyle = '#cc0000'; // Darker red color (50% luminance)
                    ctx.beginPath();
                    ctx.arc(indicatorX, indicatorY, indicatorSize, 0, 2 * Math.PI);
                    ctx.fill();
                    
                    // Add a subtle white border for better visibility
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 1 / zoom;
                    ctx.stroke();
                }
            });
            
            ctx.restore();
        }
        
        function drawRectangleText(rectangle) {
            if (!rectangle.name || rectangle.name.trim() === '') return;
            
            // Set text properties
            const fontSize = Math.max(12 / zoom, 8); // Scale font size with zoom, minimum 8px
            ctx.font = fontSize + 'px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle'; // Center vertically like HTML export
            
            // Calculate text position (center of rectangle)
            const textX = rectangle.x + rectangle.width / 2;
            const textY = rectangle.y + rectangle.height / 2; // Center vertically
            
            // Draw text with outline for better readability without background
            const lineWidth = Math.max(2 / zoom, 1);
            
            // Draw text outline (stroke)
            ctx.strokeStyle = darkBackground ? '#000000' : '#ffffff';
            ctx.lineWidth = lineWidth;
            ctx.strokeText(rectangle.name, textX, textY);
            
            // Draw the text (fill) - color matches background
            ctx.fillStyle = darkBackground ? '#ffffff' : '#000000';
            ctx.fillText(rectangle.name, textX, textY);
        }
        
        // Mouse handling for tooltips
        canvas.addEventListener('mousemove', function(e) {
            const rect = canvas.getBoundingClientRect();
            const screenX = e.clientX - rect.left;
            const screenY = e.clientY - rect.top;
            const x = (screenX - panX) / zoom;
            const y = (screenY - panY) / zoom;
            
            const tooltip = document.getElementById('tooltip');
            
            // Check for payload indicator hover first
            let payloadRect = null;
            for (const rectangle of rectangles) {
                if (rectangle.payload && rectangle.payload.trim() !== '') {
                    const indicatorSize = 6 / zoom;
                    const indicatorX = rectangle.x + indicatorSize + 2 / zoom;
                    const indicatorY = rectangle.y + rectangle.height - indicatorSize - 2 / zoom;
                    
                    // Check if mouse is within the payload indicator circle
                    const distance = Math.sqrt((x - indicatorX) ** 2 + (y - indicatorY) ** 2);
                    if (distance <= indicatorSize) {
                        payloadRect = rectangle;
                        canvas.style.cursor = 'pointer';
                        break;
                    }
                }
            }
            
            if (payloadRect && tooltip) {
                console.log('Showing payload tooltip:', payloadRect.payload.substring(0, 50) + '...');
                console.log('Tooltip element:', tooltip);

                // Position tooltip directly below the red dot
                const indicatorSize = 6 / zoom;
                const dotX = payloadRect.x + indicatorSize + 2 / zoom;
                const dotY = payloadRect.y + payloadRect.height - indicatorSize - 2 / zoom;
                const dotScreenX = (dotX * zoom) + panX;
                const dotScreenY = (dotY * zoom) + panY + 15; // Just below the dot

                tooltip.textContent = payloadRect.payload;
                tooltip.style.display = 'block';
                tooltip.style.left = dotScreenX + 'px';
                tooltip.style.top = dotScreenY + 'px';
                tooltip.style.backgroundColor = '#1e3a5f';
                tooltip.style.color = '#00ffff';
                tooltip.style.fontFamily = 'Consolas, "Courier New", monospace';
                tooltip.style.fontSize = '11px';
                tooltip.style.maxWidth = '400px';
                tooltip.style.whiteSpace = 'pre-wrap';
                tooltip.style.border = '1px solid #555';
                tooltip.style.borderRadius = '4px';
                tooltip.style.padding = '8px';
                tooltip.style.lineHeight = '1.3';
                console.log('Tooltip positioned at:', dotScreenX, dotScreenY);

                // Important: Return early to prevent rectangle tooltip logic from running
                return;
            }

            // Check for connection payload indicator hover
            let payloadConnection = null;
            for (const conn of connections) {
                if (conn.payload && conn.payload.trim() !== '') {
                    const points = conn.getConnectionPoints();
                    let indicatorPos;

                    if (conn.labelPosition) {
                        indicatorPos = conn.labelPosition;
                    } else {
                        indicatorPos = getBezierPoint(points.from.x, points.from.y, points.to.x, points.to.y, 0.5);
                    }

                    let dotX = indicatorPos.x;
                    let dotY = indicatorPos.y;

                    if (conn.label && conn.label.trim() !== '') {
                        ctx.font = (10 / zoom) + 'px Arial';
                        const textWidth = ctx.measureText(conn.label).width + 8 / zoom;
                        dotX = indicatorPos.x - textWidth/2 - 10 / zoom;
                    }

                    const indicatorSize = 6 / zoom;
                    const distance = Math.sqrt((x - dotX) ** 2 + (y - dotY) ** 2);

                    if (distance <= indicatorSize) {
                        payloadConnection = conn;
                        canvas.style.cursor = 'pointer';
                        break;
                    }
                }
            }

            if (payloadConnection && tooltip) {
                // Position tooltip directly below the red dot
                const points = payloadConnection.getConnectionPoints();
                let indicatorPos;

                if (payloadConnection.labelPosition) {
                    indicatorPos = payloadConnection.labelPosition;
                } else {
                    indicatorPos = getBezierPoint(points.from.x, points.from.y, points.to.x, points.to.y, 0.5);
                }

                let dotX = indicatorPos.x;
                let dotY = indicatorPos.y;

                if (payloadConnection.label && payloadConnection.label.trim() !== '') {
                    ctx.font = (10 / zoom) + 'px Arial';
                    const textWidth = ctx.measureText(payloadConnection.label).width + 8 / zoom;
                    dotX = indicatorPos.x - textWidth/2 - 10 / zoom;
                }

                const dotScreenX = (dotX * zoom) + panX;
                const dotScreenY = (dotY * zoom) + panY + 15;

                tooltip.textContent = payloadConnection.payload;
                tooltip.style.display = 'block';
                tooltip.style.left = dotScreenX + 'px';
                tooltip.style.top = dotScreenY + 'px';
                tooltip.style.backgroundColor = '#1e3a5f';
                tooltip.style.color = '#00ffff';
                tooltip.style.fontFamily = 'Consolas, "Courier New", monospace';
                tooltip.style.fontSize = '11px';
                tooltip.style.maxWidth = '400px';
                tooltip.style.whiteSpace = 'pre-wrap';
                tooltip.style.border = '1px solid #555';
                tooltip.style.borderRadius = '4px';
                tooltip.style.padding = '8px';
                tooltip.style.lineHeight = '1.3';

                return;
            }

            if (!payloadRect && !payloadConnection) {
                console.log('No payload, checking regular tooltips');
                // Reset cursor when not hovering over payload
                canvas.style.cursor = 'crosshair';

                // Check connections first (more specific than rectangle areas)
                // Check both the connection line AND the label area
                const hoveredConnection = connections.find(c => c.isNearConnection(x, y) || c.isLabelClicked(x, y));

                // If we found a connection (even without description), don't check rectangles
                if (hoveredConnection) {
                    if (hoveredConnection.description && hoveredConnection.description.trim() !== '' && tooltip) {
                        tooltip.textContent = hoveredConnection.description;
                        tooltip.style.display = 'block';
                        tooltip.style.left = (screenX + 15) + 'px';
                        tooltip.style.top = screenY + 'px';
                        // Reset payload tooltip styling
                        tooltip.style.backgroundColor = '';
                        tooltip.style.color = '';
                        tooltip.style.fontFamily = '';
                        tooltip.style.fontSize = '';
                        tooltip.style.maxWidth = '';
                        tooltip.style.whiteSpace = '';
                        tooltip.style.border = '';
                        tooltip.style.borderRadius = '';
                        tooltip.style.padding = '';
                        tooltip.style.lineHeight = '';
                    } else if (tooltip) {
                        // Connection found but no description - hide tooltip
                        tooltip.style.display = 'none';
                    }
                    return; // Early return - connection found, stop processing
                } else {
                    // No connection found - check for rectangles
                    // For rectangles, only show tooltip when hovering over name box (for collections/frames)
                    const hoveredRect = rectangles.find(r => r.isHoveringNameBox(x, y));
                    if (hoveredRect && hoveredRect.description && hoveredRect.description.trim() !== '' && tooltip) {
                        tooltip.textContent = hoveredRect.description;
                        tooltip.style.display = 'block';
                        tooltip.style.left = (screenX + 15) + 'px';
                        tooltip.style.top = screenY + 'px';
                        // Reset payload tooltip styling
                        tooltip.style.backgroundColor = '';
                        tooltip.style.color = '';
                        tooltip.style.fontFamily = '';
                        tooltip.style.fontSize = '';
                        tooltip.style.maxWidth = '';
                        tooltip.style.whiteSpace = '';
                        tooltip.style.border = '';
                        tooltip.style.borderRadius = '';
                        tooltip.style.padding = '';
                        tooltip.style.lineHeight = '';
                    } else if (tooltip) {
                        tooltip.style.display = 'none';
                    }
                }
            }
        });
        
        // Tooltip helper functions
        function showTooltip(screenX, screenY, text) {
            const tooltip = document.getElementById('tooltip');
            if (tooltip) {
                tooltip.textContent = text;
                tooltip.style.display = 'block';
                tooltip.style.left = (screenX + 15) + 'px';
                tooltip.style.top = screenY + 'px';
            }
        }
        
        function hideTooltip() {
            const tooltip = document.getElementById('tooltip');
            if (tooltip) {
                tooltip.style.display = 'none';
            }
        }

        // Function to substitute variables in payload
        function substituteVariables(payload) {
            // Find all $$variable$$ patterns - use non-greedy match
            const variablePattern = /\\$\\$(.+?)\\$\\$/g;

            return payload.replace(variablePattern, (match, variableName) => {
                // First, try to find a rectangle with matching name
                const matchingRect = rectangles.find(r => r.name === variableName);
                if (matchingRect && matchingRect.payload) {
                    return matchingRect.payload;
                }

                // If no rectangle found, try to find a connection with matching label
                const matchingConnection = connections.find(c => c.label === variableName);
                if (matchingConnection && matchingConnection.payload) {
                    return matchingConnection.payload;
                }

                // If no match found, leave the variable as-is
                return match;
            });
        }

        // Click handling for payload indicators
        canvas.addEventListener('click', function(e) {
            const rect = canvas.getBoundingClientRect();
            const screenX = e.clientX - rect.left;
            const screenY = e.clientY - rect.top;
            const x = (screenX - panX) / zoom;
            const y = (screenY - panY) / zoom;

            // Check if clicking on rectangle payload indicator
            const payloadRect = rectangles.find(r => {
                if (!r.payload || r.payload.trim() === '') return false;

                const indicatorSize = 6 / zoom;
                const indicatorX = r.x + indicatorSize + 2 / zoom;
                const indicatorY = r.y + r.height - indicatorSize - 2 / zoom;

                // Check if click is within the payload indicator circle
                const distance = Math.sqrt((x - indicatorX) ** 2 + (y - indicatorY) ** 2);
                return distance <= indicatorSize;
            });

            // Check if clicking on connection payload indicator
            const payloadConnection = connections.find(conn => {
                if (!conn.payload || conn.payload.trim() === '') return false;

                const points = conn.getConnectionPoints();
                let indicatorPos;

                if (conn.labelPosition) {
                    indicatorPos = conn.labelPosition;
                } else {
                    indicatorPos = getBezierPoint(points.from.x, points.from.y, points.to.x, points.to.y, 0.5);
                }

                let dotX = indicatorPos.x;
                let dotY = indicatorPos.y;

                if (conn.label && conn.label.trim() !== '') {
                    ctx.font = (10 / zoom) + 'px Arial';
                    const textWidth = ctx.measureText(conn.label).width + 8 / zoom;
                    dotX = indicatorPos.x - textWidth/2 - 10 / zoom;
                }

                const indicatorSize = 6 / zoom;
                const distance = Math.sqrt((x - dotX) ** 2 + (y - dotY) ** 2);
                return distance <= indicatorSize;
            });

            const payloadToCopy = payloadRect ? payloadRect.payload : (payloadConnection ? payloadConnection.payload : null);

            if (payloadToCopy) {
                // Substitute variables before copying
                const processedPayload = substituteVariables(payloadToCopy);

                // Copy payload to clipboard using browser API
                if (navigator.clipboard) {
                    navigator.clipboard.writeText(processedPayload).then(() => {
                        console.log('Payload copied to clipboard (after substitution):', processedPayload);
                        // Show temporary notification
                        const notification = document.createElement('div');
                        notification.textContent = 'Payload copied to clipboard!';
                        notification.style.cssText = \`
                            position: fixed;
                            top: 20px;
                            right: 20px;
                            background: #4caf50;
                            color: white;
                            padding: 10px 15px;
                            border-radius: 4px;
                            font-size: 12px;
                            z-index: 9999;
                            animation: fadeInOut 2s ease-in-out;
                        \`;
                        document.body.appendChild(notification);
                        setTimeout(() => {
                            document.body.removeChild(notification);
                        }, 2000);
                    }).catch(() => {
                        console.log('Clipboard API not available, falling back to manual copy');
                        // Fallback for older browsers
                        const textArea = document.createElement('textarea');
                        textArea.value = processedPayload;
                        document.body.appendChild(textArea);
                        textArea.select();
                        document.execCommand('copy');
                        document.body.removeChild(textArea);
                    });
                }
            }
        });
        
        // Add CSS for the notification animation
        const style = document.createElement('style');
        style.textContent = \`
            @keyframes fadeInOut {
                0% { opacity: 0; transform: translateY(-10px); }
                20% { opacity: 1; transform: translateY(0); }
                80% { opacity: 1; transform: translateY(0); }
                100% { opacity: 0; transform: translateY(-10px); }
            }
        \`;
        document.head.appendChild(style);
        
        // Load data and initialize
        rectangles = ${JSON.stringify(data.rectangles)}.map(r => {
            const rect = new Rectangle(r.x, r.y, r.width, r.height, r.name, r.description, r.payload, r.color, r.type);
            rect.id = r.id; // Preserve original ID
            return rect;
        });
        
        console.log('Loaded rectangles:', rectangles);
        
        // Load connections
        const connectionData = ${JSON.stringify(data.connections)};
        console.log('Loading connections:', connectionData);
        
        connectionData.forEach(conn => {
            const fromRect = rectangles.find(r => r.id === conn.fromRectId);
            const toRect = rectangles.find(r => r.id === conn.toRectId);
            console.log('Connection:', conn, 'fromRect:', fromRect, 'toRect:', toRect);
            if (fromRect && toRect) {
                const fromPoint = { x: fromRect.x + fromRect.width, y: fromRect.y + fromRect.height / 2 };
                const toPoint = { x: toRect.x, y: toRect.y + toRect.height / 2 };
                const connection = new Connection(fromRect, fromPoint, toRect, toPoint, conn.label, conn.description, conn.payload, conn.color, conn.lineStyle);
                connection.id = conn.id;
                if (conn.labelPosition) {
                    connection.labelPosition = conn.labelPosition;
                }
                connections.push(connection);
                console.log('Added connection:', connection);
            }
        });
        
        console.log('Final connections array:', connections);
        
        // Initialize
        resizeCanvas();
    </script>
</body>
</html>`;
    }

    private _generateSVG(data: any): string {
        // Calculate bounding box
        let minX = Number.MAX_VALUE;
        let minY = Number.MAX_VALUE;
        let maxX = Number.MIN_VALUE;
        let maxY = Number.MIN_VALUE;

        // Find bounds from rectangles
        data.rectangles.forEach((rect: any) => {
            minX = Math.min(minX, rect.x);
            minY = Math.min(minY, rect.y);
            maxX = Math.max(maxX, rect.x + rect.width);
            maxY = Math.max(maxY, rect.y + rect.height);
        });

        // Add padding
        const padding = 50;
        minX -= padding;
        minY -= padding;
        maxX += padding;
        maxY += padding;

        const width = maxX - minX;
        const height = maxY - minY;

        // Determine if we're in dark mode (default true if not specified)
        const darkBackground = data.darkBackground !== false;
        const bgColor = darkBackground ? '#1e1e1e' : '#ffffff';

        // Helper function to get connection points
        const getConnectionPoints = (fromRect: any, toRect: any) => {
            const fromPoint = { x: fromRect.x + fromRect.width, y: fromRect.y + fromRect.height / 2 };
            const toPoint = { x: toRect.x, y: toRect.y + toRect.height / 2 };
            return { from: fromPoint, to: toPoint };
        };

        // Helper function to create bezier path
        const createBezierPath = (fromX: number, fromY: number, toX: number, toY: number) => {
            const distance = Math.abs(toX - fromX);
            const curveOffset = Math.min(distance * 0.5, 80);
            const cp1X = fromX + curveOffset;
            const cp1Y = fromY;
            const cp2X = toX - curveOffset;
            const cp2Y = toY;
            return `M ${fromX} ${fromY} C ${cp1X} ${cp1Y} ${cp2X} ${cp2Y} ${toX} ${toY}`;
        };

        // Helper function to adjust colors for translucency simulation
        const adjustColorForBackground = (foregroundColor: string, alpha: number = 0.9) => {
            const hex = foregroundColor.replace('#', '');
            const r = parseInt(hex.substr(0, 2), 16);
            const g = parseInt(hex.substr(2, 2), 16);
            const b = parseInt(hex.substr(4, 2), 16);

            // Get background RGB
            const bgR = darkBackground ? 30 : 255;  // #1e1e1e vs #ffffff
            const bgG = darkBackground ? 30 : 255;
            const bgB = darkBackground ? 30 : 255;

            // Simulate alpha blending: result = alpha * foreground + (1 - alpha) * background
            const finalR = Math.round(alpha * r + (1 - alpha) * bgR);
            const finalG = Math.round(alpha * g + (1 - alpha) * bgG);
            const finalB = Math.round(alpha * b + (1 - alpha) * bgB);

            return `#${finalR.toString(16).padStart(2, '0')}${finalG.toString(16).padStart(2, '0')}${finalB.toString(16).padStart(2, '0')}`;
        };

        // Helper function to get contrasting text color
        const getContrastColor = (backgroundColor: string) => {
            // Simple: text color matches the current background
            // Dark background = light text, Light background = dark text
            return data.darkBackground ? '#ffffff' : '#000000';
        };

        // Check if rectangles have connections for border styling
        const hasConnections = (rectId: string, side: 'left' | 'right') => {
            return data.connections.some((conn: any) => {
                if (side === 'left') return conn.toRectId === rectId;
                if (side === 'right') return conn.fromRectId === rectId;
                return false;
            });
        };

        // Generate SVG content without background and grid, with adjusted colors
        const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="${minX} ${minY} ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
        <!-- Drop shadow filter -->
        <filter id="dropShadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="2" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.3)"/>
        </filter>
        
        <!-- Gradient for connection dots -->
        <radialGradient id="dotGradient">
            <stop offset="0%" stop-color="#4ecdc4" stop-opacity="1"/>
            <stop offset="70%" stop-color="#4ecdc4" stop-opacity="0.8"/>
            <stop offset="100%" stop-color="#2a9d8f" stop-opacity="1"/>
        </radialGradient>
        
        <style>
            .rectangle-main { stroke-width: 1; stroke: ${data.darkBackground ? '#cccccc' : '#333333'}; stroke-opacity: 0.8; filter: url(#dropShadow); }
            .rectangle-left-thick { stroke-width: 5; stroke: ${data.darkBackground ? '#cccccc' : '#333333'}; stroke-opacity: 0.9; }
            .rectangle-right-thick { stroke-width: 5; stroke: ${data.darkBackground ? '#cccccc' : '#333333'}; stroke-opacity: 0.9; }
            .connection { stroke-width: 2; fill: none; opacity: 0.9; filter: url(#dropShadow); }
            .connection-dashed { stroke-dasharray: 8,4; }
            .connection-dot { fill: url(#dotGradient); stroke: #ffffff; stroke-width: 1; stroke-opacity: 0.9; filter: url(#dropShadow); }
            .text { font-family: Arial, sans-serif; text-anchor: middle; dominant-baseline: middle; }
            .label-bg { stroke: none; filter: url(#dropShadow); opacity: 0.95; }
        </style>
    </defs>
    
    <!-- Connections with enhanced styling -->
    ${data.connections.map((conn: any) => {
            const fromRect = data.rectangles.find((r: any) => r.id === conn.fromRectId);
            const toRect = data.rectangles.find((r: any) => r.id === conn.toRectId);
            if (!fromRect || !toRect) return '';

            const points = getConnectionPoints(fromRect, toRect);
            const pathData = createBezierPath(points.from.x, points.from.y, points.to.x, points.to.y);
            const dashClass = conn.lineStyle === 'dashed' ? 'connection-dashed' : '';

            let labelElement = '';
            if (conn.label) {
                // Calculate label position (midpoint of curve)
                const midX = (points.from.x + points.to.x) / 2;
                const midY = (points.from.y + points.to.y) / 2;
                const textWidth = conn.label.length * 6 + 8; // Approximate text width
                const adjustedLabelColor = adjustColorForBackground(conn.color, 0.95);

                labelElement = `
                <g>
                    <rect x="${midX - textWidth / 2}" y="${midY - 8}" width="${textWidth}" height="16" 
                          rx="8" class="label-bg" fill="${adjustedLabelColor}"/>
                    <text x="${midX}" y="${midY}" class="text" font-size="10" 
                          fill="${getContrastColor(conn.color)}" font-weight="500">${conn.label}</text>
                </g>`;
            }

            return `
            <path d="${pathData}" class="connection ${dashClass}" stroke="${conn.color}"/>
            <circle cx="${points.from.x}" cy="${points.from.y}" r="4" class="connection-dot"/>
            <circle cx="${points.to.x}" cy="${points.to.y}" r="4" class="connection-dot"/>
            ${labelElement}`;
        }).join('')}
    
    <!-- Rectangles with background-adjusted colors -->
    ${data.rectangles.map((rect: any) => {
            // Match canvas alpha values: white=0.1, colored=0.15
            const alpha = rect.color === '#ffffff' ? 0.1 : 0.15;
            const adjustedColor = adjustColorForBackground(rect.color, alpha);
            const textColor = getContrastColor(rect.color);
            const hasLeftConn = hasConnections(rect.id, 'left');
            const hasRightConn = hasConnections(rect.id, 'right');

            if (rect.type === 'collection') {
                // Collection box: all corners rounded dotted border, name box hard against upper left corner
                const nameBoxWidth = Math.max(rect.name.length * 8, 40);
                const nameBoxHeight = 20;
                const nameBoxX = rect.x; // Hard against the collection box
                const nameBoxY = rect.y; // Hard against the collection box
                const nameRadius = nameBoxHeight / 2; // Radius = half height
                const collectionRadius = 10; // Collection box corner radius

                // Use rectangle color or default to adaptive color (same logic as canvas)
                const borderColor = rect.color && rect.color !== '#ffffff' ? rect.color : (data.darkBackground ? '#cccccc' : '#333333');

                // Use rectangle color for name box fill, or default background
                let nameBoxFillColor;
                if (rect.color && rect.color !== '#ffffff') {
                    nameBoxFillColor = rect.color;
                } else {
                    nameBoxFillColor = data.darkBackground ? 'rgba(60, 60, 60, 0.9)' : 'rgba(240, 240, 240, 0.9)';
                }

                // Calculate text color for contrast
                let textColor = '#000000'; // Default black
                if (rect.color && rect.color !== '#ffffff') {
                    // Simple check: if it's a "dark" hex color (sum of RGB < 384), use white text
                    const hex = rect.color.replace('#', '');
                    const r = parseInt(hex.substr(0, 2), 16);
                    const g = parseInt(hex.substr(2, 2), 16);
                    const b = parseInt(hex.substr(4, 2), 16);
                    if (r + g + b < 384) {
                        textColor = '#ffffff';
                    }
                } else if (nameBoxFillColor.includes('60, 60, 60')) {
                    textColor = '#ffffff'; // White for dark gray
                }

                return `
                <g>
                    <!-- Collection box with all corners rounded dotted border -->
                    <rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" 
                          rx="${collectionRadius}" ry="${collectionRadius}"
                          fill="none" stroke="${borderColor}" 
                          stroke-width="1" stroke-dasharray="5,5" stroke-opacity="0.8"/>
                    
                    ${rect.name ? `
                    <!-- Custom rounded name box hard against upper left corner -->
                    <g>
                        <!-- SVG path with selective rounded corners (top-left and bottom-right only) -->
                        <path d="M ${nameBoxX + nameRadius} ${nameBoxY}
                                 L ${nameBoxX + nameBoxWidth} ${nameBoxY}
                                 L ${nameBoxX + nameBoxWidth} ${nameBoxY + nameBoxHeight - nameRadius}
                                 Q ${nameBoxX + nameBoxWidth} ${nameBoxY + nameBoxHeight} ${nameBoxX + nameBoxWidth - nameRadius} ${nameBoxY + nameBoxHeight}
                                 L ${nameBoxX} ${nameBoxY + nameBoxHeight}
                                 L ${nameBoxX} ${nameBoxY + nameRadius}
                                 Q ${nameBoxX} ${nameBoxY} ${nameBoxX + nameRadius} ${nameBoxY}
                                 Z"
                              fill="${nameBoxFillColor}" 
                              stroke="${borderColor}" 
                              stroke-width="1" stroke-opacity="0.8"/>
                        <text x="${nameBoxX + nameBoxWidth / 2}" y="${nameBoxY + nameBoxHeight / 2}" 
                              class="text" font-size="12" font-weight="500" 
                              fill="${textColor}" 
                              text-anchor="middle" dominant-baseline="middle">${rect.name}</text>
                    </g>` : ''}
                    
                    <!-- Payload indicator for collection boxes -->
                    ${rect.payload && rect.payload.trim() !== '' ? `
                    <circle cx="${rect.x + 8}" cy="${rect.y + rect.height - 8}" r="6" 
                            fill="#cc0000" stroke="#ffffff" stroke-width="1">
                        <title>${rect.payload}</title>
                    </circle>` : ''}
                </g>`;
            } else {
                // Regular rectangle
                return `
                <g>
                    <!-- Main rectangle with adjusted color -->
                    <rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" 
                          fill="${adjustedColor}" class="rectangle-main"/>
                    
                    <!-- Enhanced left border if has connections -->
                    ${hasLeftConn ? `<line x1="${rect.x}" y1="${rect.y}" x2="${rect.x}" y2="${rect.y + rect.height}" 
                                          class="rectangle-left-thick"/>` : ''}
                    
                    <!-- Enhanced right border if has connections -->
                    ${hasRightConn ? `<line x1="${rect.x + rect.width}" y1="${rect.y}" x2="${rect.x + rect.width}" y2="${rect.y + rect.height}" 
                                           class="rectangle-right-thick"/>` : ''}
                    
                    <!-- Text with contrast -->
                    ${rect.name ? `<text x="${rect.x + rect.width / 2}" y="${rect.y + rect.height / 2}" 
                                   class="text" font-size="12" font-weight="500" fill="${textColor}" 
                                   opacity="0.95">${rect.name}</text>` : ''}
                    
                    <!-- Payload indicator -->
                    ${rect.payload && rect.payload.trim() !== '' ? `
                    <circle cx="${rect.x + 8}" cy="${rect.y + rect.height - 8}" r="6" 
                            fill="#cc0000" stroke="#ffffff" stroke-width="1">
                        <title>${rect.payload}</title>
                    </circle>` : ''}
                </g>`;
            }
        }).join('')}
</svg>`;

        return svgContent;
    }

    private _getHtmlForWebview(webview: vscode.Webview, context: string = 'sidebar') {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Rectangle Drawer</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        body {
            margin: 0;
            padding: 0;
            font-family: var(--vscode-font-family);
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            height: 100vh;
            width: 100vw;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            box-sizing: border-box;
        }
        
        .controls {
            padding: ${context === 'sidebar' ? '6px' : '10px'};
            background-color: var(--vscode-panel-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            flex-shrink: 0;
            font-size: ${context === 'sidebar' ? '11px' : '13px'};
        }
        
        .controls button {
            font-size: ${context === 'sidebar' ? '10px' : '12px'};
            padding: ${context === 'sidebar' ? '3px 6px' : '6px 12px'};
            margin-right: ${context === 'sidebar' ? '3px' : '8px'};
        }
        
        #canvas {
            border: none;
            cursor: crosshair;
            background-color: var(--vscode-editor-background);
            flex: 1;
            display: block;
            width: 100%;
            height: 100%;
            min-height: 200px;
        }
        
        .canvas-container {
            flex: 1;
            position: relative;
            overflow: hidden;
            min-height: 0; /* Important for flex child */
        }
        
        button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 6px 8px;
            margin-right: 5px;
            cursor: pointer;
            border-radius: 3px;
            font-size: 12px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 28px;
            height: 28px;
            position: relative;
        }
        
        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        button i {
            font-size: 12px;
        }
        
        .tooltip-text {
            visibility: hidden;
            background-color: var(--vscode-editorHoverWidget-background);
            color: var(--vscode-editorHoverWidget-foreground);
            border: 1px solid var(--vscode-editorHoverWidget-border);
            text-align: center;
            border-radius: 3px;
            padding: 5px 8px;
            position: absolute;
            z-index: 1000;
            top: 120%;
            left: 50%;
            transform: translateX(-50%);
            font-size: 12px;
            white-space: nowrap;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        }
        
        button:hover .tooltip-text {
            visibility: visible;
        }
        
        .help-modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.5);
            z-index: 2000;
        }
        
        .help-content {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            padding: 20px;
            max-width: 500px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }
        
        .help-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 10px;
        }
        
        .help-close {
            background: none;
            border: none;
            color: var(--vscode-editor-foreground);
            font-size: 16px;
            cursor: pointer;
            padding: 0;
            margin: 0;
            min-width: auto;
            height: auto;
        }
        
        .help-close:hover {
            background-color: var(--vscode-toolbar-hoverBackground);
        }
        
        .info {
            padding: ${context === 'sidebar' ? '6px' : '10px'};
            font-size: ${context === 'sidebar' ? '10px' : '12px'};
            color: var(--vscode-descriptionForeground);
            background-color: var(--vscode-panel-background);
            border-top: 1px solid var(--vscode-panel-border);
            flex-shrink: 0;
            max-height: ${context === 'sidebar' ? '100px' : '150px'};
            overflow-y: auto;
        }
        
        .info div {
            margin: 2px 0;
        }
        
        .context-menu {
            position: absolute;
            background: var(--vscode-menu-background);
            border: 1px solid var(--vscode-menu-border);
            border-radius: 3px;
            padding: 4px 0;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
            z-index: 1000;
            min-width: 120px;
            display: none;
        }
        
        .context-menu-item {
            padding: 6px 12px;
            cursor: pointer;
            color: var(--vscode-menu-foreground);
            font-size: 13px;
        }
        
        .context-menu-item:hover {
            background: var(--vscode-menu-selectionBackground);
            color: var(--vscode-menu-selectionForeground);
        }
        
        .context-menu-separator {
            height: 1px;
            background: var(--vscode-menu-separatorBackground);
            margin: 4px 0;
        }
        
        .tooltip {
            position: absolute;
            background: var(--vscode-editorHoverWidget-background);
            border: 1px solid var(--vscode-editorHoverWidget-border);
            border-radius: 3px;
            padding: 8px 12px;
            color: var(--vscode-editorHoverWidget-foreground);
            font-size: 12px;
            z-index: 1500;
            max-width: 300px;
            white-space: pre-wrap;
            word-wrap: break-word;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
            pointer-events: none;
        }
        
        .property-editor {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            z-index: 2000;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .property-editor-content {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            padding: 20px;
            min-width: 300px;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
        }
        
        .property-editor-content h3 {
            margin: 0 0 15px 0;
            color: var(--vscode-foreground);
            font-size: 16px;
        }
        
        .property-field {
            margin-bottom: 15px;
        }
        
        .property-field label {
            display: block;
            margin-bottom: 5px;
            color: var(--vscode-foreground);
            font-size: 13px;
        }
        
        .property-field input {
            width: 100%;
            padding: 6px 8px;
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 2px;
            color: var(--vscode-input-foreground);
            font-size: 13px;
            box-sizing: border-box;
        }
        
        .property-field input:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }
        
        .property-field textarea {
            width: 100%;
            padding: 6px 8px;
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 2px;
            color: var(--vscode-input-foreground);
            font-size: 13px;
            box-sizing: border-box;
            resize: vertical;
            font-family: var(--vscode-font-family);
        }
        
        .property-field textarea:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }
        
        .property-buttons {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
        }
        
        .property-buttons button {
            padding: 6px 12px;
            border: 1px solid var(--vscode-button-border);
            border-radius: 2px;
            cursor: pointer;
            font-size: 13px;
        }
        
        .property-buttons button:first-child {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        
        .property-buttons button:first-child:hover {
            background: var(--vscode-button-hoverBackground);
        }
        
        .property-buttons button:last-child {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        
        .property-buttons button:last-child:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
        
        .radio-group {
            display: flex;
            gap: 15px;
            margin-top: 5px;
        }
        
        .radio-group label {
            display: flex;
            align-items: center;
            gap: 5px;
            cursor: pointer;
            font-size: 12px;
        }
        
        .radio-group input[type="radio"] {
            margin: 0;
            cursor: pointer;
        }
        
        .color-palette {
            display: flex;
            gap: 4px;
            margin-top: 5px;
            flex-wrap: wrap;
        }
        
        .color-swatch {
            width: 24px;
            height: 24px;
            border: 2px solid var(--vscode-input-border);
            border-radius: 3px;
            cursor: pointer;
            transition: all 0.2s ease;
        }
        
        .color-swatch:hover {
            border-color: var(--vscode-focusBorder);
            transform: scale(1.1);
        }
        
        .color-swatch.selected {
            border-color: var(--vscode-focusBorder);
            border-width: 3px;
            box-shadow: 0 0 0 1px var(--vscode-focusBorder);
        }
    </style>
</head>
<body>
    ${context === 'sidebar' ? `
    <div style="padding: 5px 10px; background-color: var(--vscode-sideBar-background); border-bottom: 1px solid var(--vscode-sideBar-border);">
        <span id="fileNameDisplay" style="font-size: 11px; color: var(--vscode-descriptionForeground); display: none;" title=""></span>
    </div>
    ` : ''}
    <div class="controls">
        <button onclick="loadDrawing()" title="Load">
            <i class="fas fa-folder-open"></i>
            <span class="tooltip-text">Load</span>
        </button>
        <button onclick="saveDrawing()" title="Save">
            <i class="fas fa-save"></i>
            <span class="tooltip-text">Save</span>
        </button>
        <button onclick="clearCanvas()" title="Clear All">
            <i class="fas fa-trash"></i>
            <span class="tooltip-text">Clear All</span>
        </button>
        <button onclick="resetView()" title="Reset View">
            <i class="fas fa-home"></i>
            <span class="tooltip-text">Reset View</span>
        </button>
        ${context === 'sidebar' ?
                '<button onclick="openInPanel()" title="Open in Panel"><i class="fas fa-window-maximize"></i><span class="tooltip-text">Open in Panel</span></button>' :
                '<button onclick="openInSidebar()" title="Show in Sidebar"><i class="fas fa-columns"></i><span class="tooltip-text">Show in Sidebar</span></button>'
            }
        <button onclick="exportToHTML()" title="Export HTML">
            <i class="fas fa-file-export"></i>
            <span class="tooltip-text">Export HTML</span>
        </button>
        <button onclick="exportToSVG()" title="Export SVG">
            <i class="fas fa-file-image"></i>
            <span class="tooltip-text">Export SVG</span>
        </button>
        <button onclick="toggleBackground()" title="Toggle Background">
            <i class="fas fa-adjust"></i>
            <span class="tooltip-text">Toggle Background</span>
        </button>
        <button onclick="showHelp()" title="Help">
            <i class="fas fa-question-circle"></i>
            <span class="tooltip-text">Help</span>
        </button>
        <span style="margin-left: 10px; font-size: ${context === 'sidebar' ? '9px' : '11px'};">
            Zoom: <span id="zoomLevel">100%</span>
            ${context === 'panel' ? `<span id="fileNameDisplayPanel" style="margin-left: 15px; color: var(--vscode-descriptionForeground); display: none;" title=""></span>` : ''}
        </span>
    </div>
    
    <div class="canvas-container">
        <canvas id="canvas"></canvas>
    </div>
    
    <div id="helpModal" class="help-modal">
        <div class="help-content">
            <div class="help-header">
                <h3>Pix - Help</h3>
                <button class="help-close" onclick="hideHelp()">&times;</button>
            </div>
            <div>
                
                <h4>Pix</h4>
                A simple diagramming tool with boxes and links. Either type can have a name, a Descriptin (which shows when hovering) and a payload which can be cut/pasted or dragged)
                <table>
                    <tr>
                        <td><strong>Draw Box</strong></td>
                        <td>Click and drag</td>
                    </tr>
                    <tr>
                        <td><strong>Draw Collection Box:</strong></td>
                        <td>Hold Ctrl and drag</td>
                    </tr>
                    <tr>
                        <td><strong>Draw link:</strong></td>
                        <td>Right-drag</td>
                    </tr>
                    <tr>
                        <td>Hint:</td>
                        <td>right-drag to empty space to link to new box</td>
                    </tr>
                </table>
                <hr>
                <table>
                    <tr>
                        <td><strong>Edit Properties:</strong></td>
                        <td>Double-click</td>
                    </tr>
                    <tr>
                        <td><strong>Move Rectangle:</strong></td>
                        <td>Drag</td>
                    </tr>
                    <tr>
                        <td><strong>Resize Rectangle:</strong></td>
                        <td>Click, then drag handles</td>
                    </tr>
                </table>
                <hr>
                <table>
                    <tr>
                        <td><strong>Pan View:</strong></td>
                        <td>Middle button</td>
                    </tr>
                    <tr>
                        <td><strong>Zoom:</strong></td>
                        <td>Mouse wheel</td>
                    </tr>
                    <tr>
                        <td><strong>Delete:</strong></td>
                        <td>Context menu</td>
                    </tr>
                </table>
                <hr>
                <table>
                    <tr>
                        <td><strong>Copy/Paste:</strong></td>
                        <td>Select box, then Ctrl+C/Ctrl+V</td>
                    </tr>
                    <tr>
                        <td><strong>Copy:</strong></td>
                        <td>Double-click red dot</td>
                    </tr>
                    <tr>
                        <td><strong>drag out text:</strong></td>
                        <td>drag red buttons</td>
                    </tr>
                    <tr>
                        <td>Note:</td>
                        <td>Payloads can contain other payloads if you wrap the name e.g. %%name$$</td>
                    </tr>
                </table>
            </div>
        </div>
    </div>
    
    <div id="contextMenu" class="context-menu">
        <div class="context-menu-item" onclick="deleteSelected()">Delete</div>
    </div>
    
    <div id="tooltip" class="tooltip" style="display: none;"></div>
    
    <div id="propertyEditor" class="property-editor" style="display: none;">
        <div class="property-editor-content">
            <h3 id="propertyEditorTitle">Edit Properties</h3>
            <div id="rectangleProperties" style="display: none;">
                <div class="property-field">
                    <label for="rectName">Name:</label>
                    <input type="text" id="rectName" placeholder="Enter rectangle name">
                </div>
                <div class="property-field">
                    <label for="rectDescription">Description:</label>
                    <input type="text" id="rectDescription" placeholder="Enter description (shown on hover)">
                </div>
                <div class="property-field">
                    <label for="rectPayload">Payload:</label>
                    <textarea id="rectPayload" placeholder="Enter payload data (Ctrl+C/V when selected)" rows="3" wrap="soft"></textarea>
                </div>
                <div class="property-field">
                    <label for="rectColor">Color:</label>
                    <div class="color-palette" id="rectColorPalette">
                        <div class="color-swatch" style="background-color: #000000;" data-color="#000000" title="Black"></div>
                        <div class="color-swatch" style="background-color: #ff4444;" data-color="#ff4444" title="Red"></div>
                        <div class="color-swatch" style="background-color: #ff8800;" data-color="#ff8800" title="Orange"></div>
                        <div class="color-swatch" style="background-color: #ffdd00;" data-color="#ffdd00" title="Yellow"></div>
                        <div class="color-swatch" style="background-color: #228822;" data-color="#228822" title="Green"></div>
                        <div class="color-swatch" style="background-color: #4488ff;" data-color="#4488ff" title="Blue"></div>
                        <div class="color-swatch" style="background-color: #8844ff;" data-color="#8844ff" title="Purple"></div>
                        <div class="color-swatch" style="background-color: #555555;" data-color="#555555" title="Dark Gray"></div>
                        <div class="color-swatch" style="background-color: #888888;" data-color="#888888" title="Gray"></div>
                        <div class="color-swatch" style="background-color: #bbbbbb;" data-color="#bbbbbb" title="Light Gray"></div>
                        <div class="color-swatch" style="background-color: #ffffff;" data-color="#ffffff" title="White"></div>
                        <div class="color-swatch" style="background-color: #00ffff;" data-color="#00ffff" title="Cyan"></div>
                        <div class="color-swatch" style="background-color: #ff00ff;" data-color="#ff00ff" title="Magenta"></div>
                    </div>
                </div>
            </div>
            <div id="connectionProperties" style="display: none;">
                <div class="property-field">
                    <label for="connLabel">Label:</label>
                    <input type="text" id="connLabel" placeholder="Enter connection label">
                </div>
                <div class="property-field">
                    <label for="connDescription">Description:</label>
                    <input type="text" id="connDescription" placeholder="Enter description (shown on hover)">
                </div>
                <div class="property-field">
                    <label for="connPayload">Payload:</label>
                    <textarea id="connPayload" placeholder="Enter payload data (Ctrl+C/V when selected)" rows="3" wrap="soft"></textarea>
                </div>
                <div class="property-field">
                    <label for="connColor">Color:</label>
                    <div class="color-palette" id="connColorPalette">
                        <div class="color-swatch" style="background-color: #000000;" data-color="#000000" title="Black"></div>
                        <div class="color-swatch" style="background-color: #ff4444;" data-color="#ff4444" title="Red"></div>
                        <div class="color-swatch" style="background-color: #ff8800;" data-color="#ff8800" title="Orange"></div>
                        <div class="color-swatch" style="background-color: #ffdd00;" data-color="#ffdd00" title="Yellow"></div>
                        <div class="color-swatch" style="background-color: #228822;" data-color="#228822" title="Green"></div>
                        <div class="color-swatch" style="background-color: #4488ff;" data-color="#4488ff" title="Blue"></div>
                        <div class="color-swatch" style="background-color: #8844ff;" data-color="#8844ff" title="Purple"></div>
                        <div class="color-swatch" style="background-color: #555555;" data-color="#555555" title="Dark Gray"></div>
                        <div class="color-swatch" style="background-color: #888888;" data-color="#888888" title="Gray"></div>
                        <div class="color-swatch" style="background-color: #bbbbbb;" data-color="#bbbbbb" title="Light Gray"></div>
                        <div class="color-swatch" style="background-color: #ffffff;" data-color="#ffffff" title="White"></div>
                        <div class="color-swatch" style="background-color: #00ffff;" data-color="#00ffff" title="Cyan"></div>
                        <div class="color-swatch" style="background-color: #ff00ff;" data-color="#ff00ff" title="Magenta"></div>
                    </div>
                </div>
                <div class="property-field">
                    <label>Line Style:</label>
                    <div class="radio-group">
                        <label><input type="radio" name="lineStyle" value="solid" id="lineSolid" checked> Solid</label>
                        <label><input type="radio" name="lineStyle" value="thick-dotted" id="lineThickDotted"> Thick Dotted</label>
                        <label><input type="radio" name="lineStyle" value="dashed" id="lineDashed"> Dashed</label>
                    </div>
                </div>
            </div>
            <div class="property-buttons">
                <button onclick="saveProperties()">Save</button>
                <button onclick="cancelProperties()">Cancel</button>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d');
        const canvasContainer = document.querySelector('.canvas-container');
        
        // Make canvas responsive
        function resizeCanvas() {
            console.log('resizeCanvas called');
            const container = canvasContainer;
            if (!container) {
                console.error('Canvas container not found');
                return;
            }
            
            const rect = container.getBoundingClientRect();
            console.log('Container rect:', rect);
            
            // Ensure we have minimum dimensions
            const width = Math.max(rect.width, 200);
            const height = Math.max(rect.height, 200);
            
            console.log('Setting canvas size to:', { width, height });
            
            // Set canvas size to fill container
            canvas.width = width;
            canvas.height = height;
            
            // Set CSS size to match
            canvas.style.width = width + 'px';
            canvas.style.height = height + 'px';
            
            console.log('Canvas after resize:', {
                width: canvas.width,
                height: canvas.height,
                styleWidth: canvas.style.width,
                styleHeight: canvas.style.height
            });
            
            // Redraw everything
            draw();
        }
        
        // Initial resize and setup resize listener
        window.addEventListener('resize', resizeCanvas);
        window.addEventListener('load', resizeCanvas);
        
        // Add debug logging
        console.log('Setting up canvas...');
        console.log('Canvas element:', canvas);
        console.log('Canvas container:', canvasContainer);
        
        // Use ResizeObserver for better responsiveness
        if (window.ResizeObserver) {
            const resizeObserver = new ResizeObserver(entries => {
                console.log('ResizeObserver triggered:', entries);
                requestAnimationFrame(resizeCanvas);
            });
            resizeObserver.observe(canvasContainer);
        }
        
        // Initial setup with multiple attempts to ensure proper sizing
        setTimeout(() => {
            console.log('Initial resize attempt 1');
            resizeCanvas();
            updateZoomDisplay();
        }, 100);
        setTimeout(() => {
            console.log('Initial resize attempt 2');
            resizeCanvas();
        }, 300);
        setTimeout(() => {
            console.log('Initial resize attempt 3');
            resizeCanvas();
        }, 500);
        
        let rectangles = [];
        let connections = [];
        let isDrawing = false;
        let isDrawingCollection = false; // Flag for collection box drawing with Ctrl+drag
        let isConnecting = false;
        let isDragging = false;
        let isResizing = false;
        let isPanning = false;
        let startPoint = null;
        let currentRect = null;
        let selectedRect = null;
        let selectedConnection = null;
        let dragStartX = 0;
        let dragStartY = 0;
        let dragOffset = { x: 0, y: 0 };
        let resizeHandle = null;
        let contextMenu = null;
        
        // Pan and zoom variables
        let panX = 0;
        let panY = 0;
        let zoom = 1;
        let panStartX = 0;
        let panStartY = 0;
        
        // Background toggle for printing
        let darkBackground = true;
        
        // Grid settings
        const gridSize = 10;
        
        function snapToGrid(value) {
            return Math.round(value / gridSize) * gridSize;
        }
        
        // Rectangle class
        class Rectangle {
            constructor(x, y, width, height, name = '', description = '', payload = '', color = '#ffffff', type = 'regular') {
                this.x = snapToGrid(x);
                this.y = snapToGrid(y);
                this.width = snapToGrid(Math.max(width, gridSize));
                this.height = snapToGrid(Math.max(height, gridSize));
                this.selected = false;
                this.id = Math.random().toString(36).substr(2, 9);
                this.name = name;
                this.description = description;
                this.payload = payload;
                this.color = color;
                this.type = type; // 'regular' or 'collection'
            }
            
            contains(x, y) {
                // Check main rectangle area
                const inMainArea = x >= this.x && x <= this.x + this.width &&
                                   y >= this.y && y <= this.y + this.height;
                
                // For collection boxes, also check name box area (positioned hard against upper left)
                if (this.type === 'collection' && this.name) {
                    const nameBoxWidth = Math.max(this.name.length * 8, 40);
                    const nameBoxHeight = 20;
                    const nameBoxX = this.x; // Hard against the collection box
                    const nameBoxY = this.y; // Hard against the collection box
                    
                    const inNameBox = x >= nameBoxX && x <= nameBoxX + nameBoxWidth &&
                                      y >= nameBoxY && y <= nameBoxY + nameBoxHeight;
                    
                    return inMainArea || inNameBox;
                }
                
                return inMainArea;
            }
            
            getResizeHandle(x, y) {
                const handleSize = 8;
                const handles = {
                    'top-left': { x: this.x, y: this.y },
                    'top-right': { x: this.x + this.width, y: this.y },
                    'bottom-left': { x: this.x, y: this.y + this.height },
                    'bottom-right': { x: this.x + this.width, y: this.y + this.height },
                    'top': { x: this.x + this.width / 2, y: this.y },
                    'bottom': { x: this.x + this.width / 2, y: this.y + this.height },
                    'left': { x: this.x, y: this.y + this.height / 2 },
                    'right': { x: this.x + this.width, y: this.y + this.height / 2 }
                };
                
                for (const [handle, pos] of Object.entries(handles)) {
                    if (Math.abs(x - pos.x) <= handleSize / 2 && Math.abs(y - pos.y) <= handleSize / 2) {
                        return handle;
                    }
                }
                return null;
            }
            
            resize(handle, newX, newY, startX, startY) {
                const deltaX = newX - startX;
                const deltaY = newY - startY;
                
                let newLeft = this.x;
                let newTop = this.y;
                let newWidth = this.width;
                let newHeight = this.height;
                
                switch (handle) {
                    case 'top-left':
                        newWidth = this.width - deltaX;
                        newHeight = this.height - deltaY;
                        newLeft = this.x + deltaX;
                        newTop = this.y + deltaY;
                        break;
                    case 'top-right':
                        newWidth = this.width + deltaX;
                        newHeight = this.height - deltaY;
                        newTop = this.y + deltaY;
                        break;
                    case 'bottom-left':
                        newWidth = this.width - deltaX;
                        newHeight = this.height + deltaY;
                        newLeft = this.x + deltaX;
                        break;
                    case 'bottom-right':
                        newWidth = this.width + deltaX;
                        newHeight = this.height + deltaY;
                        break;
                    case 'top':
                        newHeight = this.height - deltaY;
                        newTop = this.y + deltaY;
                        break;
                    case 'bottom':
                        newHeight = this.height + deltaY;
                        break;
                    case 'left':
                        newWidth = this.width - deltaX;
                        newLeft = this.x + deltaX;
                        break;
                    case 'right':
                        newWidth = this.width + deltaX;
                        break;
                }
                
                // Ensure minimum size
                newWidth = Math.max(newWidth, gridSize);
                newHeight = Math.max(newHeight, gridSize);
                
                // Apply the values
                this.x = newLeft;
                this.y = newTop;
                this.width = newWidth;
                this.height = newHeight;
            }
            
            getConnectionPoints() {
                return {
                    top: { x: this.x + this.width / 2, y: this.y },
                    bottom: { x: this.x + this.width / 2, y: this.y + this.height },
                    left: { x: this.x, y: this.y + this.height / 2 },
                    right: { x: this.x + this.width, y: this.y + this.height / 2 }
                };
            }
            
            getNearestConnectionPoint(x, y) {
                const points = this.getConnectionPoints();
                let nearest = null;
                let minDistance = Infinity;

                for (const [key, point] of Object.entries(points)) {
                    const distance = Math.sqrt((x - point.x) ** 2 + (y - point.y) ** 2);
                    if (distance < minDistance && distance < 20) {
                        minDistance = distance;
                        nearest = { ...point, side: key };
                    }
                }

                return nearest;
            }

            isHoveringNameBox(x, y) {
                // For collection boxes, check if hovering over the name box
                if (this.type === 'collection' && this.name) {
                    const nameBoxWidth = Math.max(this.name.length * 8, 40);
                    const nameBoxHeight = 20;
                    const nameBoxX = this.x;
                    const nameBoxY = this.y;

                    return x >= nameBoxX && x <= nameBoxX + nameBoxWidth &&
                           y >= nameBoxY && y <= nameBoxY + nameBoxHeight;
                }
                // For regular rectangles, any hover counts
                return this.contains(x, y);
            }
        }
        
        // Connection class
        class Connection {
            constructor(fromRect, fromPoint, toRect, toPoint, label = '', description = '', payload = '', color = '#4ecdc4', lineStyle = 'solid') {
                this.fromRect = fromRect;
                this.fromPoint = fromPoint;
                this.toRect = toRect;
                this.toPoint = toPoint;
                this.id = Math.random().toString(36).substr(2, 9);
                this.selected = false;
                this.label = label;
                this.description = description;
                this.payload = payload;
                this.color = color;
                this.lineStyle = lineStyle; // 'solid', 'thick-dotted', or 'dashed'
                this.labelPosition = null; // Will be calculated automatically if null
                this.isDraggingLabel = false;
            }
            
            getConnectionPoints() {
                // Snap to edges: right edge of source rect, left edge of target rect
                const fromEdge = this.getSnapPoint(this.fromRect, this.toRect, 'from');
                const toEdge = this.getSnapPoint(this.toRect, this.fromRect, 'to');
                
                return { from: fromEdge, to: toEdge };
            }
            
            getSnapPoint(rect, otherRect, direction) {
                if (direction === 'from') {
                    // Snap to right edge of source rectangle (already grid-aligned)
                    return {
                        x: rect.x + rect.width,
                        y: snapToGrid(rect.y + rect.height / 2)
                    };
                } else {
                    // Snap to left edge of target rectangle (already grid-aligned)
                    return {
                        x: rect.x,
                        y: snapToGrid(rect.y + rect.height / 2)
                    };
                }
            }
            
            isNearConnection(x, y, tolerance = 8) {
                const points = this.getConnectionPoints();
                const fromPoint = points.from;
                const toPoint = points.to;
                
                // Check if point is near the bezier curve
                // Sample points along the curve and check distance
                for (let t = 0; t <= 1; t += 0.05) {
                    const curvePoint = this.getBezierPoint(fromPoint.x, fromPoint.y, toPoint.x, toPoint.y, t);
                    const distance = Math.sqrt((x - curvePoint.x) ** 2 + (y - curvePoint.y) ** 2);
                    if (distance <= tolerance) {
                        return true;
                    }
                }
                return false;
            }
            
            getBezierPoint(fromX, fromY, toX, toY, t) {
                if (this.labelPosition) {
                    // Use quadratic curve through label position
                    const labelPos = this.labelPosition;
                    
                    // Quadratic bezier formula: (1-t)²P0 + 2(1-t)tP1 + t²P2
                    const x = Math.pow(1-t, 2) * fromX + 
                             2 * (1-t) * t * labelPos.x + 
                             Math.pow(t, 2) * toX;
                             
                    const y = Math.pow(1-t, 2) * fromY + 
                             2 * (1-t) * t * labelPos.y + 
                             Math.pow(t, 2) * toY;
                             
                    return { x, y };
                } else {
                    // Default cubic bezier curve
                    const distance = Math.abs(toX - fromX);
                    const curveOffset = Math.min(distance * 0.5, 80);
                    
                    const cp1X = fromX + curveOffset;
                    const cp1Y = fromY;
                    const cp2X = toX - curveOffset;
                    const cp2Y = toY;
                    
                    // Bezier curve formula
                    const x = Math.pow(1-t, 3) * fromX + 
                             3 * Math.pow(1-t, 2) * t * cp1X + 
                             3 * (1-t) * Math.pow(t, 2) * cp2X + 
                             Math.pow(t, 3) * toX;
                             
                    const y = Math.pow(1-t, 3) * fromY + 
                             3 * Math.pow(1-t, 2) * t * cp1Y + 
                             3 * (1-t) * Math.pow(t, 2) * cp2Y + 
                             Math.pow(t, 3) * toY;
                             
                    return { x, y };
                }
            }
            
            getLabelPosition() {
                if (this.labelPosition) {
                    return this.labelPosition;
                }
                
                // Calculate default label position at middle of connection
                const points = this.getConnectionPoints();
                const fromPoint = points.from;
                const toPoint = points.to;
                
                // Get midpoint of bezier curve
                return this.getBezierPoint(fromPoint.x, fromPoint.y, toPoint.x, toPoint.y, 0.5);
            }
            
            setLabelPosition(x, y) {
                this.labelPosition = { x, y };
            }
            
            isLabelClicked(x, y) {
                if (!this.label || this.label.trim() === '') return false;

                const labelPos = this.getLabelPosition();

                // Calculate label dimensions accurately
                // Need to match the dimensions used in drawConnectionLabel
                const fontSize = Math.max(10 / zoom, 6);
                ctx.font = fontSize + 'px Arial';
                const textMetrics = ctx.measureText(this.label);
                const textWidth = textMetrics.width;
                const labelWidth = textWidth + 8 / zoom; // Padding
                const labelHeight = fontSize + 4 / zoom; // Padding

                const isInside = x >= labelPos.x - labelWidth/2 &&
                       x <= labelPos.x + labelWidth/2 &&
                       y >= labelPos.y - labelHeight/2 &&
                       y <= labelPos.y + labelHeight/2;

                // Debug logging
                if (isInside) {
                    console.log('Label clicked!', this.label, 'at', x, y);
                }

                return isInside;
            }
        }

        // Standalone getBezierPoint function for use outside Connection class
        function getBezierPoint(fromX, fromY, toX, toY, t) {
            const distance = Math.abs(toX - fromX);
            const curveOffset = Math.min(distance * 0.5, 80);

            const cp1X = fromX + curveOffset;
            const cp1Y = fromY;
            const cp2X = toX - curveOffset;
            const cp2Y = toY;

            // Bezier curve formula
            const x = Math.pow(1-t, 3) * fromX +
                     3 * Math.pow(1-t, 2) * t * cp1X +
                     3 * (1-t) * Math.pow(t, 2) * cp2X +
                     Math.pow(t, 3) * toX;

            const y = Math.pow(1-t, 3) * fromY +
                     3 * Math.pow(1-t, 2) * t * cp1Y +
                     3 * (1-t) * Math.pow(t, 2) * cp2Y +
                     Math.pow(t, 3) * toY;

            return { x, y };
        }

        function handleDragStart(e) {
            const rect = canvas.getBoundingClientRect();
            const screenX = e.clientX - rect.left;
            const screenY = e.clientY - rect.top;
            const x = (screenX - panX) / zoom;
            const y = (screenY - panY) / zoom;

            // Check if dragging from rectangle payload indicator
            const payloadRect = rectangles.find(r => {
                if (!r.payload || r.payload.trim() === '') return false;

                const indicatorSize = 6 / zoom;
                const indicatorX = r.x + indicatorSize + 2 / zoom;
                const indicatorY = r.y + r.height - indicatorSize - 2 / zoom;

                const distance = Math.sqrt((x - indicatorX) ** 2 + (y - indicatorY) ** 2);
                return distance <= indicatorSize;
            });

            // Check if dragging from connection payload indicator
            const payloadConnection = connections.find(conn => {
                if (!conn.payload || conn.payload.trim() === '') return false;

                const points = conn.getConnectionPoints();
                let indicatorPos;

                if (conn.labelPosition) {
                    indicatorPos = conn.labelPosition;
                } else {
                    indicatorPos = getBezierPoint(points.from.x, points.from.y, points.to.x, points.to.y, 0.5);
                }

                let dotX = indicatorPos.x;
                let dotY = indicatorPos.y;

                if (conn.label && conn.label.trim() !== '') {
                    ctx.font = (10 / zoom) + 'px Arial';
                    const textWidth = ctx.measureText(conn.label).width + 8 / zoom;
                    dotX = indicatorPos.x - textWidth/2 - 10 / zoom;
                }

                const indicatorSize = 6 / zoom;
                const distance = Math.sqrt((x - dotX) ** 2 + (y - dotY) ** 2);
                return distance <= indicatorSize;
            });

            if (payloadRect || payloadConnection) {
                const payload = payloadRect ? payloadRect.payload : payloadConnection.payload;
                const processedPayload = substituteVariables(payload);

                // Create a custom drag image showing only the red dot
                const dragCanvas = document.createElement('canvas');
                const dragCtx = dragCanvas.getContext('2d');
                const dotSize = 24; // Size of the drag image
                dragCanvas.width = dotSize;
                dragCanvas.height = dotSize;

                // Draw the red dot
                dragCtx.fillStyle = '#cc0000';
                dragCtx.beginPath();
                dragCtx.arc(dotSize / 2, dotSize / 2, dotSize / 2 - 2, 0, 2 * Math.PI);
                dragCtx.fill();

                // Add white border
                dragCtx.strokeStyle = '#ffffff';
                dragCtx.lineWidth = 2;
                dragCtx.beginPath();
                dragCtx.arc(dotSize / 2, dotSize / 2, dotSize / 2 - 2, 0, 2 * Math.PI);
                dragCtx.stroke();

                // Set the drag data
                e.dataTransfer.effectAllowed = 'copy';
                e.dataTransfer.setData('text/plain', processedPayload);
                e.dataTransfer.setDragImage(dragCanvas, dotSize / 2, dotSize / 2);
            } else {
                // Prevent drag if not on payload indicator
                e.preventDefault();
            }
        }

        // Event handlers
        canvas.addEventListener('mousedown', handleMouseDown);
        canvas.addEventListener('mousemove', handleMouseMove);
        canvas.addEventListener('mouseup', handleMouseUp);
        canvas.addEventListener('contextmenu', handleContextMenu);
        canvas.addEventListener('wheel', handleWheel);
        canvas.addEventListener('dblclick', handleDoubleClick);
        canvas.addEventListener('dragstart', handleDragStart);
        document.addEventListener('click', hideContextMenu);
        document.addEventListener('keydown', handleKeyDown);
        
        // Property editor keyboard support
        document.addEventListener('keydown', function(e) {
            const propertyEditor = document.getElementById('propertyEditor');
            if (propertyEditor && propertyEditor.style.display === 'flex') {
                if (e.key === 'Enter') {
                    // Only save on Enter if we're not in a textarea (allow line breaks in textareas)
                    if (document.activeElement.tagName !== 'TEXTAREA') {
                        e.preventDefault();
                        saveProperties();
                    }
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelProperties();
                }
            }
        });
        
        function handleContextMenu(e) {
            e.preventDefault();
            
            // Clear any potential connection start since we're showing context menu
            potentialStartPoint = null;
            
            const rect = canvas.getBoundingClientRect();
            const screenX = e.clientX - rect.left;
            const screenY = e.clientY - rect.top;
            const x = (screenX - panX) / zoom;
            const y = (screenY - panY) / zoom;
            
            // Check what was right-clicked
            const clickedRect = rectangles.find(r => r.contains(x, y));
            const clickedConnection = connections.find(c => c.isNearConnection(x, y));
            
            if (clickedRect || clickedConnection) {
                // Clear previous selections
                rectangles.forEach(r => r.selected = false);
                connections.forEach(c => c.selected = false);
                selectedRect = null;
                selectedConnection = null;
                
                if (clickedRect) {
                    clickedRect.selected = true;
                    selectedRect = clickedRect;
                } else if (clickedConnection) {
                    clickedConnection.selected = true;
                    selectedConnection = clickedConnection;
                }
                
                // Position context menu relative to viewport
                showContextMenu(e.clientX, e.clientY);
                draw();
            }
        }
        
        function showContextMenu(x, y) {
            contextMenu = document.getElementById('contextMenu');
            contextMenu.style.display = 'block';
            
            // Ensure context menu stays within viewport
            const menuRect = contextMenu.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            
            let menuX = x;
            let menuY = y;
            
            // Adjust position if menu would go off-screen
            if (x + menuRect.width > viewportWidth) {
                menuX = viewportWidth - menuRect.width - 5;
            }
            if (y + menuRect.height > viewportHeight) {
                menuY = viewportHeight - menuRect.height - 5;
            }
            
            contextMenu.style.left = menuX + 'px';
            contextMenu.style.top = menuY + 'px';
        }
        
        function hideContextMenu() {
            if (contextMenu) {
                contextMenu.style.display = 'none';
            }
        }
        
        function handleWheel(e) {
            e.preventDefault();
            
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            // Convert mouse coordinates to world coordinates
            const worldX = (mouseX - panX) / zoom;
            const worldY = (mouseY - panY) / zoom;
            
            // Zoom factor
            const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
            const newZoom = Math.max(0.1, Math.min(5.0, zoom * zoomFactor));
            
            // Calculate new pan to keep mouse position fixed
            panX = mouseX - worldX * newZoom;
            panY = mouseY - worldY * newZoom;
            zoom = newZoom;
            
            updateZoomDisplay();
            draw();
        }
        
        function handleDoubleClick(e) {
            console.log('Double-click detected!');
            const rect = canvas.getBoundingClientRect();
            const screenX = e.clientX - rect.left;
            const screenY = e.clientY - rect.top;

            // Convert screen coordinates to world coordinates
            const x = (screenX - panX) / zoom;
            const y = (screenY - panY) / zoom;

            // Check if double-clicking on a red dot payload indicator first - if so, ignore (already handled by click)
            const payloadRect = rectangles.find(r => {
                if (!r.payload || r.payload.trim() === '') return false;
                const indicatorSize = 6 / zoom;
                const indicatorX = r.x + indicatorSize + 2 / zoom;
                const indicatorY = r.y + r.height - indicatorSize - 2 / zoom;
                const distance = Math.sqrt((x - indicatorX) ** 2 + (y - indicatorY) ** 2);
                return distance <= indicatorSize;
            });

            const payloadConnection = connections.find(conn => {
                if (!conn.payload || conn.payload.trim() === '') return false;
                const points = conn.getConnectionPoints();
                let indicatorPos;
                if (conn.labelPosition) {
                    indicatorPos = conn.labelPosition;
                } else {
                    indicatorPos = getBezierPoint(points.from.x, points.from.y, points.to.x, points.to.y, 0.5);
                }
                let dotX = indicatorPos.x;
                let dotY = indicatorPos.y;
                if (conn.label && conn.label.trim() !== '') {
                    ctx.font = (10 / zoom) + 'px Arial';
                    const textWidth = ctx.measureText(conn.label).width + 8 / zoom;
                    dotX = indicatorPos.x - textWidth/2 - 10 / zoom;
                }
                const indicatorSize = 6 / zoom;
                const distance = Math.sqrt((x - dotX) ** 2 + (y - dotY) ** 2);
                return distance <= indicatorSize;
            });

            // If double-clicking on a red dot, copy to clipboard
            if (payloadRect) {
                console.log('Double-click on red dot - copying to clipboard');
                // Substitute variables before copying
                const processedPayload = substituteVariables(payloadRect.payload);

                // Copy payload to clipboard
                vscode.postMessage({
                    type: 'copyToClipboard',
                    text: processedPayload
                });

                // Visual feedback - briefly highlight the indicator
                const originalFillStyle = ctx.fillStyle;
                ctx.fillStyle = '#ffaaaa';
                const indicatorSize = 6 / zoom;
                const indicatorX = payloadRect.x + indicatorSize + 2 / zoom;
                const indicatorY = payloadRect.y + payloadRect.height - indicatorSize - 2 / zoom;
                ctx.beginPath();
                ctx.arc(indicatorX, indicatorY, indicatorSize, 0, 2 * Math.PI);
                ctx.fill();
                ctx.fillStyle = originalFillStyle;

                setTimeout(() => {
                    draw(); // Redraw to remove highlight
                }, 150);

                return; // Don't open property editor
            }

            if (payloadConnection) {
                console.log('Double-click on red dot - copying to clipboard');
                // Substitute variables before copying
                const processedPayload = substituteVariables(payloadConnection.payload);

                // Copy payload to clipboard
                vscode.postMessage({
                    type: 'copyToClipboard',
                    text: processedPayload
                });

                // Visual feedback - briefly highlight the indicator
                const points = payloadConnection.getConnectionPoints();
                let indicatorPos;

                if (payloadConnection.labelPosition) {
                    indicatorPos = payloadConnection.labelPosition;
                } else {
                    indicatorPos = getBezierPoint(points.from.x, points.from.y, points.to.x, points.to.y, 0.5);
                }

                let dotX = indicatorPos.x;
                let dotY = indicatorPos.y;

                if (payloadConnection.label && payloadConnection.label.trim() !== '') {
                    ctx.font = (10 / zoom) + 'px Arial';
                    const textWidth = ctx.measureText(payloadConnection.label).width + 8 / zoom;
                    dotX = indicatorPos.x - textWidth/2 - 10 / zoom;
                }

                const originalFillStyle = ctx.fillStyle;
                ctx.fillStyle = '#ffaaaa';
                const indicatorSize = 6 / zoom;
                ctx.beginPath();
                ctx.arc(dotX, dotY, indicatorSize, 0, 2 * Math.PI);
                ctx.fill();
                ctx.fillStyle = originalFillStyle;

                setTimeout(() => {
                    draw(); // Redraw to remove highlight
                }, 150);

                return; // Don't open property editor
            }

            // Check for connections first (more specific than rectangle areas)
            // This allows editing connectors even when they're inside frames
            const clickedConnection = connections.find(c => c.isNearConnection(x, y));

            if (clickedConnection) {
                console.log('Connection found for editing:', clickedConnection);
                editConnectionProperties(clickedConnection);
                return;
            }

            // If no connection, check for rectangle
            const clickedRect = rectangles.find(r => r.contains(x, y));

            if (clickedRect) {
                console.log('Rectangle found for editing:', clickedRect);
                editRectangleProperties(clickedRect);
                return;
            }

            console.log('No rectangle or connection found at click position');
        }

        // Function to substitute variables in payload
        function substituteVariables(payload) {
            // Find all $$variable$$ patterns - use non-greedy match
            const variablePattern = /\\$\\$(.+?)\\$\\$/g;

            return payload.replace(variablePattern, (match, variableName) => {
                // First, try to find a rectangle with matching name
                const matchingRect = rectangles.find(r => r.name === variableName);
                if (matchingRect && matchingRect.payload) {
                    return matchingRect.payload;
                }

                // If no rectangle found, try to find a connection with matching label
                const matchingConnection = connections.find(c => c.label === variableName);
                if (matchingConnection && matchingConnection.payload) {
                    return matchingConnection.payload;
                }

                // If no match found, leave the variable as-is
                return match;
            });
        }

        function handleKeyDown(e) {
            // Only handle Ctrl+C and Ctrl+V when something is selected and no input fields are focused
            if ((!selectedRect && !selectedConnection) || document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
                return;
            }

            if (e.ctrlKey || e.metaKey) { // Support both Ctrl (Windows/Linux) and Cmd (Mac)
                if (e.key === 'c' || e.key === 'C') {
                    // Copy payload to clipboard
                    let payload = '';
                    if (selectedRect && selectedRect.payload) {
                        payload = selectedRect.payload;
                    } else if (selectedConnection && selectedConnection.payload) {
                        payload = selectedConnection.payload;
                    }

                    if (payload.trim() !== '') {
                        // Substitute variables before copying
                        const processedPayload = substituteVariables(payload);
                        navigator.clipboard.writeText(processedPayload).catch(err => {
                            console.error('Failed to copy to clipboard:', err);
                        });
                    }
                    e.preventDefault();
                } else if (e.key === 'v' || e.key === 'V') {
                    // Paste from clipboard to payload
                    navigator.clipboard.readText().then(text => {
                        if (selectedRect) {
                            selectedRect.payload = text;
                        } else if (selectedConnection) {
                            selectedConnection.payload = text;
                        }
                        notifyDataChanged();
                        draw(); // Redraw to show the payload indicator
                        console.log('Payload pasted from clipboard:', text);
                    }).catch(err => {
                        console.error('Failed to read from clipboard:', err);
                    });
                    e.preventDefault();
                }
            }
        }
        
        let currentEditingRect = null;
        let currentEditingConnection = null;
        let isDraggingLabel = false;
        let potentialStartPoint = null; // For delayed connection start
        
        function editRectangleProperties(rectangle) {
            currentEditingRect = rectangle;
            currentEditingConnection = null;
            const propertyEditor = document.getElementById('propertyEditor');
            const title = document.getElementById('propertyEditorTitle');
            const rectProps = document.getElementById('rectangleProperties');
            const connProps = document.getElementById('connectionProperties');
            const nameInput = document.getElementById('rectName');
            const descriptionInput = document.getElementById('rectDescription');
            const payloadInput = document.getElementById('rectPayload');
            
            // Configure for rectangle editing
            title.textContent = 'Edit Rectangle Properties';
            rectProps.style.display = 'block';
            connProps.style.display = 'none';
            
            // Set current values
            nameInput.value = rectangle.name || '';
            descriptionInput.value = rectangle.description || '';
            payloadInput.value = rectangle.payload || '';
            
            // Set color palette selection
            setColorPaletteSelection('rectColorPalette', rectangle.color || '#ffffff');
            
            // Show the dialog
            propertyEditor.style.display = 'flex';
            
            // Focus the name input
            setTimeout(() => nameInput.focus(), 100);
        }
        
        function editConnectionProperties(connection) {
            currentEditingConnection = connection;
            currentEditingRect = null;
            const propertyEditor = document.getElementById('propertyEditor');
            const title = document.getElementById('propertyEditorTitle');
            const rectProps = document.getElementById('rectangleProperties');
            const connProps = document.getElementById('connectionProperties');
            const labelInput = document.getElementById('connLabel');
            const descriptionInput = document.getElementById('connDescription');
            const payloadInput = document.getElementById('connPayload');
            
            // Configure for connection editing
            title.textContent = 'Edit Connection Properties';
            rectProps.style.display = 'none';
            connProps.style.display = 'block';
            
            // Set current values
            labelInput.value = connection.label || '';
            descriptionInput.value = connection.description || '';
            payloadInput.value = connection.payload || '';
            
            // Set color palette selection
            setColorPaletteSelection('connColorPalette', connection.color || '#4ecdc4');
            
            // Set line style radio buttons
            const lineStyle = connection.lineStyle || 'solid';
            document.getElementById('lineSolid').checked = (lineStyle === 'solid');
            document.getElementById('lineThickDotted').checked = (lineStyle === 'thick-dotted');
            document.getElementById('lineDashed').checked = (lineStyle === 'dashed');
            
            // Show the dialog
            propertyEditor.style.display = 'flex';
            
            // Focus the label input
            setTimeout(() => labelInput.focus(), 100);
        }
        
        function saveProperties() {
            if (currentEditingRect) {
                const nameInput = document.getElementById('rectName');
                const descriptionInput = document.getElementById('rectDescription');
                const payloadInput = document.getElementById('rectPayload');
                currentEditingRect.name = nameInput.value;
                currentEditingRect.description = descriptionInput.value;
                currentEditingRect.payload = payloadInput.value;
                currentEditingRect.color = getSelectedColorFromPalette('rectColorPalette');
                notifyDataChanged();
                draw();
            } else if (currentEditingConnection) {
                const labelInput = document.getElementById('connLabel');
                const descriptionInput = document.getElementById('connDescription');
                const payloadInput = document.getElementById('connPayload');
                const lineStyleRadios = document.getElementsByName('lineStyle');
                let selectedLineStyle = 'solid';
                for (const radio of lineStyleRadios) {
                    if (radio.checked) {
                        selectedLineStyle = radio.value;
                        break;
                    }
                }
                
                currentEditingConnection.label = labelInput.value;
                currentEditingConnection.description = descriptionInput.value;
                currentEditingConnection.payload = payloadInput.value;
                currentEditingConnection.color = getSelectedColorFromPalette('connColorPalette');
                currentEditingConnection.lineStyle = selectedLineStyle;
                notifyDataChanged();
                draw();
            }
            cancelProperties();
        }
        
        function cancelProperties() {
            const propertyEditor = document.getElementById('propertyEditor');
            propertyEditor.style.display = 'none';
            currentEditingRect = null;
            currentEditingConnection = null;
        }
        
        function handleMouseDown(e) {
            const rect = canvas.getBoundingClientRect();
            const screenX = e.clientX - rect.left;
            const screenY = e.clientY - rect.top;

            // Convert screen coordinates to world coordinates
            const x = (screenX - panX) / zoom;
            const y = (screenY - panY) / zoom;

            // Hide context menu if visible
            hideContextMenu();

            if (e.button === 1) { // Middle button - start panning
                isPanning = true;
                panStartX = screenX - panX;
                panStartY = screenY - panY;
                canvas.style.cursor = 'grabbing';
                e.preventDefault();
                return;
            } else if (e.button === 0) { // Left click
                // Check if clicking on rectangle payload indicator first
                const payloadRect = rectangles.find(r => {
                    if (!r.payload || r.payload.trim() === '') return false;

                    const indicatorSize = 6 / zoom;
                    const indicatorX = r.x + indicatorSize + 2 / zoom;
                    const indicatorY = r.y + r.height - indicatorSize - 2 / zoom;

                    // Check if click is within the payload indicator circle
                    const distance = Math.sqrt((x - indicatorX) ** 2 + (y - indicatorY) ** 2);
                    return distance <= indicatorSize;
                });

                // Check if clicking on connection payload indicator
                const payloadConnection = connections.find(conn => {
                    if (!conn.payload || conn.payload.trim() === '') return false;

                    const points = conn.getConnectionPoints();
                    let indicatorPos;

                    if (conn.labelPosition) {
                        indicatorPos = conn.labelPosition;
                    } else {
                        indicatorPos = getBezierPoint(points.from.x, points.from.y, points.to.x, points.to.y, 0.5);
                    }

                    let dotX = indicatorPos.x;
                    let dotY = indicatorPos.y;

                    if (conn.label && conn.label.trim() !== '') {
                        ctx.font = (10 / zoom) + 'px Arial';
                        const textWidth = ctx.measureText(conn.label).width + 8 / zoom;
                        dotX = indicatorPos.x - textWidth/2 - 10 / zoom;
                    }

                    const indicatorSize = 6 / zoom;
                    const distance = Math.sqrt((x - dotX) ** 2 + (y - dotY) ** 2);
                    return distance <= indicatorSize;
                });

                // Single click on red dot no longer copies - only used for drag-and-drop
                // Double-click on red dot will copy to clipboard (see handleDoubleClick)
                if (payloadRect || payloadConnection) {
                    return; // Don't process other click logic
                }
                
                // Check if clicking on connection label first
                let labelConnection = null;
                for (const conn of connections) {
                    if (conn.isLabelClicked(x, y)) {
                        labelConnection = conn;
                        break;
                    }
                }
                
                if (labelConnection) {
                    // Start dragging the label
                    isDraggingLabel = true;
                    selectedConnection = labelConnection;
                    // Clear other selections
                    rectangles.forEach(r => r.selected = false);
                    connections.forEach(c => c.selected = false);
                    labelConnection.selected = true;
                    selectedRect = null;
                    draw();
                    return;
                }
                
                // Check if clicking on existing rectangle
                const clickedRect = rectangles.find(r => r.contains(x, y));
                const clickedConnection = connections.find(c => c.isNearConnection(x, y));
                
                // Clear all selections first
                rectangles.forEach(r => r.selected = false);
                connections.forEach(c => c.selected = false);
                selectedConnection = null;
                
                if (clickedRect) {
                    selectedRect = clickedRect;
                    clickedRect.selected = true;
                    
                    // Check if clicking on resize handle
                    resizeHandle = clickedRect.getResizeHandle(x, y);
                    
                    if (resizeHandle) {
                        isResizing = true;
                        dragStartX = x;
                        dragStartY = y;
                    } else {
                        // Start dragging
                        isDragging = true;
                        dragOffset.x = x - clickedRect.x;
                        dragOffset.y = y - clickedRect.y;
                    }
                } else if (clickedConnection) {
                    selectedConnection = clickedConnection;
                    clickedConnection.selected = true;
                    selectedRect = null;
                } else {
                    // Start drawing new rectangle with snapped start point
                    // Check if Ctrl is held for collection box
                    isDrawingCollection = e.ctrlKey;
                    isDrawing = true;
                    startPoint = { x: snapToGrid(x), y: snapToGrid(y) };
                    dragStartX = x;
                    dragStartY = y;
                    selectedRect = null;
                }
            } else if (e.button === 2) { // Right click - start connection creation from rectangles
                // Only allow connection creation from rectangles, not on connections or empty space
                const clickedRect = rectangles.find(r => r.contains(x, y));
                const clickedConnection = connections.find(c => c.isNearConnection(x, y));
                
                if (clickedRect && !clickedConnection) {
                    // Start connection creation - this will be handled if user drags
                    // Context menu will be handled by contextmenu event if user doesn't drag
                    potentialStartPoint = {
                        rect: clickedRect,
                        x: clickedRect.x + clickedRect.width, // Right edge (already grid-aligned)
                        y: snapToGrid(clickedRect.y + clickedRect.height / 2) // Middle of right edge
                    };
                }
            }
            
            draw();
        }
        
        function handleMouseMove(e) {
            const rect = canvas.getBoundingClientRect();
            const screenX = e.clientX - rect.left;
            const screenY = e.clientY - rect.top;
            
            // Handle panning
            if (isPanning) {
                panX = screenX - panStartX;
                panY = screenY - panStartY;
                draw();
                return;
            }
            
            // Handle label dragging
            if (isDraggingLabel && selectedConnection) {
                const x = (screenX - panX) / zoom;
                const y = (screenY - panY) / zoom;
                selectedConnection.setLabelPosition(x, y);
                draw();
                return;
            }
            
            // Convert screen coordinates to world coordinates
            const x = (screenX - panX) / zoom;
            const y = (screenY - panY) / zoom;
            
            // Check for payload indicator hover for tooltip
            if (!isDragging && !isResizing && !isDrawing && !isConnecting && !isPanning) {
                let payloadTooltipRect = null;
                
                // Check if hovering over a payload indicator
                for (const rectangle of rectangles) {
                    if (rectangle.payload && rectangle.payload.trim() !== '') {
                        const indicatorSize = 6 / zoom;
                        const indicatorX = rectangle.x + indicatorSize + 2 / zoom;
                        const indicatorY = rectangle.y + rectangle.height - indicatorSize - 2 / zoom;
                        
                        // Check if mouse is within the payload indicator circle
                        const distance = Math.sqrt((x - indicatorX) ** 2 + (y - indicatorY) ** 2);
                        if (distance <= indicatorSize) {
                            payloadTooltipRect = rectangle;
                            canvas.style.cursor = 'pointer';
                            canvas.draggable = true;
                            break;
                        }
                    }
                }
                
                // Check for connection payload indicator hover
                let payloadTooltipConnection = null;
                for (const conn of connections) {
                    if (conn.payload && conn.payload.trim() !== '') {
                        const points = conn.getConnectionPoints();
                        let indicatorPos;

                        if (conn.labelPosition) {
                            indicatorPos = conn.labelPosition;
                        } else {
                            indicatorPos = getBezierPoint(points.from.x, points.from.y, points.to.x, points.to.y, 0.5);
                        }

                        let dotX = indicatorPos.x;
                        let dotY = indicatorPos.y;

                        if (conn.label && conn.label.trim() !== '') {
                            ctx.font = (10 / zoom) + 'px Arial';
                            const textWidth = ctx.measureText(conn.label).width + 8 / zoom;
                            dotX = indicatorPos.x - textWidth/2 - 10 / zoom;
                        }

                        const indicatorSize = 6 / zoom;
                        const distance = Math.sqrt((x - dotX) ** 2 + (y - dotY) ** 2);

                        if (distance <= indicatorSize) {
                            payloadTooltipConnection = conn;
                            canvas.style.cursor = 'pointer';
                            canvas.draggable = true;
                            break;
                        }
                    }
                }

                // Show payload tooltip for rectangle
                if (payloadTooltipRect) {
                    console.log('Showing panel payload tooltip:', payloadTooltipRect.payload.substring(0, 50) + '...');
                    const tooltip = document.getElementById('tooltip');
                    console.log('Panel tooltip element:', tooltip);
                    if (tooltip) {
                        // Position tooltip directly below the red dot
                        const indicatorSize = 6 / zoom;
                        const dotX = payloadTooltipRect.x + indicatorSize + 2 / zoom;
                        const dotY = payloadTooltipRect.y + payloadTooltipRect.height - indicatorSize - 2 / zoom;
                        const dotScreenX = (dotX * zoom) + panX;
                        const dotScreenY = (dotY * zoom) + panY + 15; // Just below the dot

                        tooltip.textContent = payloadTooltipRect.payload;
                        tooltip.style.display = 'block';
                        tooltip.style.left = dotScreenX + 'px';
                        tooltip.style.top = dotScreenY + 'px';
                        tooltip.style.backgroundColor = '#1e3a5f';
                        tooltip.style.color = '#00ffff';
                        tooltip.style.fontFamily = 'Consolas, "Courier New", monospace';
                        tooltip.style.fontSize = '11px';
                        tooltip.style.maxWidth = '400px';
                        tooltip.style.whiteSpace = 'pre-wrap';
                        tooltip.style.border = '1px solid #555';
                        tooltip.style.borderRadius = '4px';
                        tooltip.style.padding = '8px';
                        tooltip.style.lineHeight = '1.3';
                        console.log('Panel tooltip positioned at:', dotScreenX, dotScreenY);
                    }
                    return; // Early return to prevent regular tooltip logic
                }

                // Show payload tooltip for connection
                if (payloadTooltipConnection) {
                    const tooltip = document.getElementById('tooltip');
                    if (tooltip) {
                        const points = payloadTooltipConnection.getConnectionPoints();
                        let indicatorPos;

                        if (payloadTooltipConnection.labelPosition) {
                            indicatorPos = payloadTooltipConnection.labelPosition;
                        } else {
                            indicatorPos = getBezierPoint(points.from.x, points.from.y, points.to.x, points.to.y, 0.5);
                        }

                        let dotX = indicatorPos.x;
                        let dotY = indicatorPos.y;

                        if (payloadTooltipConnection.label && payloadTooltipConnection.label.trim() !== '') {
                            ctx.font = (10 / zoom) + 'px Arial';
                            const textWidth = ctx.measureText(payloadTooltipConnection.label).width + 8 / zoom;
                            dotX = indicatorPos.x - textWidth/2 - 10 / zoom;
                        }

                        const dotScreenX = (dotX * zoom) + panX;
                        const dotScreenY = (dotY * zoom) + panY + 15;

                        tooltip.textContent = payloadTooltipConnection.payload;
                        tooltip.style.display = 'block';
                        tooltip.style.left = dotScreenX + 'px';
                        tooltip.style.top = dotScreenY + 'px';
                        tooltip.style.backgroundColor = '#1e3a5f';
                        tooltip.style.color = '#00ffff';
                        tooltip.style.fontFamily = 'Consolas, "Courier New", monospace';
                        tooltip.style.fontSize = '11px';
                        tooltip.style.maxWidth = '400px';
                        tooltip.style.whiteSpace = 'pre-wrap';
                        tooltip.style.border = '1px solid #555';
                        tooltip.style.borderRadius = '4px';
                        tooltip.style.padding = '8px';
                        tooltip.style.lineHeight = '1.3';
                    }
                    return; // Early return to prevent regular tooltip logic
                }

                if (!payloadTooltipRect && !payloadTooltipConnection) {
                    // Reset cursor and draggable when not over payload indicator
                    if (canvas.style.cursor === 'pointer') {
                        canvas.style.cursor = 'crosshair';
                    }
                    canvas.draggable = false;
                    
                    // Check for regular description tooltips
                    // Check connections first (more specific than rectangle areas)
                    // Check both the connection line AND the label area
                    const hoveredConnection = connections.find(c => c.isNearConnection(x, y) || c.isLabelClicked(x, y));
                    console.log('Hovered connection:', hoveredConnection ? hoveredConnection.label : 'none');

                    // If we found a connection (even without description), don't check rectangles
                    if (hoveredConnection) {
                        if (hoveredConnection.description && hoveredConnection.description.trim() !== '') {
                            const tooltip = document.getElementById('tooltip');
                            if (tooltip) {
                                tooltip.textContent = hoveredConnection.description;
                                tooltip.style.display = 'block';
                                tooltip.style.left = (screenX + 15) + 'px';
                                tooltip.style.top = screenY + 'px';
                                // Reset payload tooltip styling
                                tooltip.style.backgroundColor = '';
                                tooltip.style.color = '';
                                tooltip.style.fontFamily = '';
                                tooltip.style.fontSize = '';
                                tooltip.style.maxWidth = '';
                                tooltip.style.whiteSpace = '';
                                tooltip.style.border = '';
                                tooltip.style.borderRadius = '';
                                tooltip.style.padding = '';
                                tooltip.style.lineHeight = '';
                            }
                        } else {
                            // Connection found but no description - hide tooltip
                            const tooltip = document.getElementById('tooltip');
                            if (tooltip) {
                                tooltip.style.display = 'none';
                            }
                        }
                        return; // Early return - connection found, stop processing
                    } else {
                        // No connection found - check for rectangles
                        // For rectangles, only show tooltip when hovering over name box (for collections/frames)
                        const hoveredRect = rectangles.find(r => r.isHoveringNameBox(x, y));
                        console.log('Hovered rect:', hoveredRect ? hoveredRect.name : 'none');
                        if (hoveredRect && hoveredRect.description && hoveredRect.description.trim() !== '') {
                            const tooltip = document.getElementById('tooltip');
                            if (tooltip) {
                                tooltip.textContent = hoveredRect.description;
                                tooltip.style.display = 'block';
                                tooltip.style.left = (screenX + 15) + 'px';
                                tooltip.style.top = screenY + 'px';
                                // Reset payload tooltip styling
                                tooltip.style.backgroundColor = '';
                                tooltip.style.color = '';
                                tooltip.style.fontFamily = '';
                                tooltip.style.fontSize = '';
                                tooltip.style.maxWidth = '';
                                tooltip.style.whiteSpace = '';
                                tooltip.style.border = '';
                                tooltip.style.borderRadius = '';
                                tooltip.style.padding = '';
                                tooltip.style.lineHeight = '';
                            }
                        } else {
                            const tooltip = document.getElementById('tooltip');
                            if (tooltip) {
                                tooltip.style.display = 'none';
                            }
                        }
                    }
                }
            }
            
            // Check if we should start connection creation (user is dragging from potential start)
            if (potentialStartPoint && !isConnecting) {
                // Calculate distance moved to determine if this is a drag vs click
                const startScreenX = (potentialStartPoint.x * zoom) + panX;
                const startScreenY = (potentialStartPoint.y * zoom) + panY;
                const distanceMoved = Math.sqrt((screenX - startScreenX) ** 2 + (screenY - startScreenY) ** 2);
                
                if (distanceMoved > 10) { // Threshold for drag detection
                    // User is dragging - start connection creation
                    isConnecting = true;
                    startPoint = potentialStartPoint;
                    potentialStartPoint = null;
                }
            }
            
            // Update cursor based on what's under the mouse
            if (selectedRect && !isDragging && !isResizing && !isDrawing && !isConnecting && !isPanning) {
                const handle = selectedRect.getResizeHandle(x, y);
                if (handle) {
                    setCursor(handle);
                } else if (selectedRect.contains(x, y)) {
                    canvas.style.cursor = 'move';
                } else {
                    canvas.style.cursor = 'crosshair';
                }
            }
            
            if (isDrawing && startPoint) {
                const snappedX = snapToGrid(Math.min(startPoint.x, x));
                const snappedY = snapToGrid(Math.min(startPoint.y, y));
                const snappedWidth = snapToGrid(Math.abs(x - startPoint.x));
                const snappedHeight = snapToGrid(Math.abs(y - startPoint.y));
                
                currentRect = {
                    x: snappedX,
                    y: snappedY,
                    width: snappedWidth,
                    height: snappedHeight
                };
                draw();
            } else if (isDragging && selectedRect) {
                // Move the rectangle smoothly without snapping
                selectedRect.x = x - dragOffset.x;
                selectedRect.y = y - dragOffset.y;
                
                // Reset label positions for connections involving this rectangle
                resetLabelPositionsForRectangle(selectedRect);
                
                draw();
            } else if (isResizing && selectedRect && resizeHandle) {
                // Resize the rectangle
                selectedRect.resize(resizeHandle, x, y, dragStartX, dragStartY);
                dragStartX = x;
                dragStartY = y;
                
                // Reset label positions for connections involving this rectangle
                resetLabelPositionsForRectangle(selectedRect);
                
                draw();
            } else if (isConnecting && startPoint) {
                draw();
                // Draw temporary curved connection line
                const targetRect = rectangles.find(r => r.contains(x, y) && r !== startPoint.rect);
                let endX = x;
                let endY = y;
                
                // If hovering over a target rectangle, snap to its left edge
                if (targetRect) {
                    endX = targetRect.x;
                    endY = targetRect.y + targetRect.height / 2;
                }
                
                // Apply transform for drawing temporary connection
                ctx.save();
                ctx.setTransform(zoom, 0, 0, zoom, panX, panY);
                
                ctx.setLineDash([5, 5]);
                ctx.strokeStyle = '#ff6b6b';
                ctx.lineWidth = 2 / zoom; // Adjust line width for zoom
                drawCurvedConnection(startPoint.x, startPoint.y, endX, endY, null);
                ctx.setLineDash([]);
                
                // Draw temporary dots
                drawConnectionDot(startPoint.x, startPoint.y);
                if (targetRect) {
                    drawConnectionDot(endX, endY);
                }
                
                ctx.restore();
            }
            
            // Handle tooltip display
            updateTooltip(x, y, screenX, screenY);
        }
        
        function updateTooltip(worldX, worldY, screenX, screenY) {
            const tooltip = document.getElementById('tooltip');
            if (!tooltip) return;
            
            // Find rectangle under cursor first
            const hoveredRect = rectangles.find(r => r.contains(worldX, worldY));
            
            if (hoveredRect && hoveredRect.description && hoveredRect.description.trim() !== '') {
                tooltip.textContent = hoveredRect.description;
                tooltip.style.display = 'block';
                tooltip.style.left = (screenX + 15) + 'px';
                tooltip.style.top = screenY + 'px';
            } else {
                // If no rectangle, check for connections
                const hoveredConnection = connections.find(c => c.isNearConnection(worldX, worldY));
                
                if (hoveredConnection && hoveredConnection.description && hoveredConnection.description.trim() !== '') {
                    tooltip.textContent = hoveredConnection.description;
                    tooltip.style.display = 'block';
                    tooltip.style.left = (screenX + 15) + 'px';
                    tooltip.style.top = screenY + 'px';
                } else {
                    tooltip.style.display = 'none';
                }
            }
        }
        
        function setCursor(handle) {
            switch (handle) {
                case 'top-left':
                case 'bottom-right':
                    canvas.style.cursor = 'nw-resize';
                    break;
                case 'top-right':
                case 'bottom-left':
                    canvas.style.cursor = 'ne-resize';
                    break;
                case 'top':
                case 'bottom':
                    canvas.style.cursor = 'n-resize';
                    break;
                case 'left':
                case 'right':
                    canvas.style.cursor = 'e-resize';
                    break;
                default:
                    canvas.style.cursor = 'crosshair';
            }
        }
        
        function handleMouseUp(e) {
            if (isPanning) {
                isPanning = false;
                canvas.style.cursor = 'crosshair';
                return;
            }
            
            if (isDraggingLabel) {
                isDraggingLabel = false;
                notifyDataChanged();
                canvas.style.cursor = 'crosshair';
                return;
            }
            
            const rect = canvas.getBoundingClientRect();
            const screenX = e.clientX - rect.left;
            const screenY = e.clientY - rect.top;
            const x = (screenX - panX) / zoom;
            const y = (screenY - panY) / zoom;
            
            if (isDrawing && currentRect && currentRect.width >= gridSize && currentRect.height >= gridSize) {
                // Different prompts for regular vs collection boxes
                const name = isDrawingCollection 
                    ? (prompt('Enter a name for this collection:', ' ') || ' ') // Default to space for collection
                    : (prompt('Enter a name for this rectangle:', '') || '');
                
                const newRect = new Rectangle(
                    currentRect.x,
                    currentRect.y,
                    currentRect.width,
                    currentRect.height,
                    name,
                    '', // Empty description initially
                    '',  // Empty payload initially
                    '#ffffff', // Default white color
                    isDrawingCollection ? 'collection' : 'regular' // Set type based on Ctrl+drag
                );
                rectangles.push(newRect);
                notifyDataChanged();
            }
            
            if (isConnecting && startPoint) {
                const targetRect = rectangles.find(r => r.contains(x, y) && r !== startPoint.rect);
                if (targetRect) {
                    // Create connection with grid-aligned edge snapping
                    const endPoint = {
                        x: targetRect.x, // Left edge (already grid-aligned)
                        y: snapToGrid(targetRect.y + targetRect.height / 2) // Middle of left edge
                    };
                    
                    const connection = new Connection(
                        startPoint.rect,
                        startPoint,
                        targetRect,
                        endPoint,
                        '', // Empty label initially
                        '', // Empty description initially
                        '', // Empty payload initially
                        '#4ecdc4', // Default color
                        'solid' // Default line style
                    );
                    connections.push(connection);
                    notifyDataChanged();
                } else {
                    // No target found - create a new rectangle at the drop location
                    const sourceRect = startPoint.rect;
                    
                    // Create new rectangle with same size as source, positioned at drop location
                    const newRectX = snapToGrid(x - sourceRect.width / 2); // Center on drop point
                    const newRectY = snapToGrid(y - sourceRect.height / 2);
                    
                    // Prompt for new rectangle name
                    const name = prompt('Enter a name for the new rectangle:', '') || '';
                    
                    const newRect = new Rectangle(
                        newRectX,
                        newRectY,
                        sourceRect.width,
                        sourceRect.height,
                        name,
                        '', // Empty description initially
                        '',  // Empty payload initially
                        '#ffffff', // Default white color
                        'regular' // Default to regular rectangle type
                    );
                    rectangles.push(newRect);
                    
                    // Create connection to the new rectangle
                    const endPoint = {
                        x: newRect.x, // Left edge
                        y: snapToGrid(newRect.y + newRect.height / 2) // Middle of left edge
                    };
                    
                    const connection = new Connection(
                        startPoint.rect,
                        startPoint,
                        newRect,
                        endPoint,
                        '', // Empty label initially
                        '', // Empty description initially
                        '', // Empty payload initially
                        '#4ecdc4', // Default color
                        'solid' // Default line style
                    );
                    connections.push(connection);
                    notifyDataChanged();
                }
            }
            
            // Notify of changes if we were dragging or resizing
            if (isDragging || isResizing) {
                // Apply grid snapping when drag/resize is complete
                if (selectedRect) {
                    selectedRect.x = snapToGrid(selectedRect.x);
                    selectedRect.y = snapToGrid(selectedRect.y);
                    selectedRect.width = Math.max(snapToGrid(selectedRect.width), gridSize);
                    selectedRect.height = Math.max(snapToGrid(selectedRect.height), gridSize);
                }
                notifyDataChanged();
            }
            
            isDrawing = false;
            isDrawingCollection = false; // Reset collection flag
            isConnecting = false;
            isDragging = false;
            isResizing = false;
            isPanning = false;
            startPoint = null;
            potentialStartPoint = null;
            currentRect = null;
            resizeHandle = null;
            canvas.style.cursor = 'crosshair';
            draw();
        }
        
        function notifyDataChanged() {
            const data = {
                rectangles: rectangles.map(r => ({
                    x: r.x,
                    y: r.y,
                    width: r.width,
                    height: r.height,
                    id: r.id,
                    name: r.name || '',
                    description: r.description || '',
                    payload: r.payload || '',
                    color: r.color || '#ffffff',
                    type: r.type || 'regular' // Include type for collection boxes
                })),
                connections: connections.map(c => ({
                    fromRectId: c.fromRect.id,
                    toRectId: c.toRect.id,
                    id: c.id,
                    label: c.label || '',
                    description: c.description || '',
                    payload: c.payload || '',
                    labelPosition: c.labelPosition
                }))
            };
            
            vscode.postMessage({
                type: 'dataChanged',
                data: data
            });
        }

        function draw() {
            console.log('draw() called - canvas size:', canvas.width, 'x', canvas.height);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Save context and apply pan/zoom transform
            ctx.save();
            ctx.setTransform(zoom, 0, 0, zoom, panX, panY);
            
            // Draw grid dots
            console.log('Drawing grid dots...');
            drawGridDots();
            
            console.log('Drawing connections and rectangles...', { 
                connectionsCount: connections.length, 
                rectanglesCount: rectangles.length 
            });
            
            // Draw connections
            connections.forEach(conn => {
                const points = conn.getConnectionPoints();
                const fromPoint = points.from;
                const toPoint = points.to;
                
                if (conn.selected) {
                    ctx.strokeStyle = '#ff6b6b';
                    ctx.lineWidth = 3 / zoom; // Adjust line width for zoom
                } else {
                    ctx.strokeStyle = conn.color || '#4ecdc4';
                    ctx.lineWidth = 2 / zoom; // Adjust line width for zoom
                }
                
                // Set line style
                const lineStyle = conn.lineStyle || 'solid';
                if (lineStyle === 'thick-dotted') {
                    ctx.setLineDash([2.25 / zoom, 8 / zoom]); // Short dots with gaps (75% of previous length)
                    ctx.lineWidth = 4 / zoom; // Make it thicker
                    ctx.lineCap = 'round'; // Round the ends to make dots
                } else if (lineStyle === 'dashed') {
                    ctx.setLineDash([15 / zoom, 10 / zoom]); // Dashed line
                    ctx.lineCap = 'butt'; // Normal line caps for dashes
                } else {
                    ctx.setLineDash([]); // Solid line
                    ctx.lineCap = 'butt'; // Normal line caps
                }
                
                // Draw curved line using bezier curve
                drawCurvedConnection(fromPoint.x, fromPoint.y, toPoint.x, toPoint.y, conn);
                
                // Reset line dash, width, and cap
                ctx.setLineDash([]);
                ctx.lineWidth = conn.selected ? 3 / zoom : 2 / zoom;
                ctx.lineCap = 'butt';
                
                // Draw dots at both ends
                drawConnectionDot(fromPoint.x, fromPoint.y, conn.selected);
                drawConnectionDot(toPoint.x, toPoint.y, conn.selected);

                // Draw connection label if it exists
                if (conn.label && conn.label.trim() !== '') {
                    drawConnectionLabel(conn);
                }

                // Draw payload indicator for connections with non-trivial payload
                if (conn.payload && conn.payload.trim() !== '') {
                    try {
                        let indicatorPos;

                        if (conn.labelPosition) {
                            indicatorPos = conn.labelPosition;
                        } else {
                            indicatorPos = getBezierPoint(fromPoint.x, fromPoint.y, toPoint.x, toPoint.y, 0.5);
                        }

                        // If there's a label, position the dot to the left of it
                        let dotX = indicatorPos.x;
                        let dotY = indicatorPos.y;

                        if (conn.label && conn.label.trim() !== '') {
                            ctx.font = (10 / zoom) + 'px Arial';
                            const textWidth = ctx.measureText(conn.label).width + 8 / zoom;
                            dotX = indicatorPos.x - textWidth/2 - 10 / zoom; // Position to the left of the label
                        }

                        const indicatorSize = 6 / zoom;

                        ctx.fillStyle = '#cc0000'; // Darker red color
                        ctx.beginPath();
                        ctx.arc(dotX, dotY, indicatorSize, 0, 2 * Math.PI);
                        ctx.fill();

                        // Add a subtle white border for better visibility
                        ctx.strokeStyle = '#ffffff';
                        ctx.lineWidth = 1 / zoom;
                        ctx.stroke();
                    } catch (e) {
                        console.error('Error drawing connection payload indicator:', e);
                    }
                }
            });
            
            // Draw rectangles
            rectangles.forEach(rectangle => {
                // Check which edges have connections
                const hasLeftConnections = connections.some(c => c.toRect === rectangle);
                const hasRightConnections = connections.some(c => c.fromRect === rectangle);
                
                // Handle collection boxes differently
                if (rectangle.type === 'collection') {
                    // Collection boxes: use rectangle color for border, no fill for container
                    ctx.fillStyle = 'transparent';
                    
                    // Use rectangle color or default to adaptive color
                    let borderColor = rectangle.color && rectangle.color !== '#ffffff' ? rectangle.color : (darkBackground ? '#cccccc' : '#333333');
                    if (rectangle.selected) {
                        borderColor = '#6496ff';
                    }
                    
                    ctx.strokeStyle = borderColor;
                    ctx.setLineDash([5, 5]); // Dotted line
                    ctx.lineWidth = rectangle.selected ? 2 / zoom : 1 / zoom;
                    
                    // Draw collection box with all corners rounded
                    const radius = 10; // Collection box corner radius
                    ctx.beginPath();
                    ctx.roundRect(rectangle.x, rectangle.y, rectangle.width, rectangle.height, radius);
                    ctx.stroke();
                    
                    ctx.setLineDash([]); // Reset to solid line for other elements
                    
                    // Draw name box hard against upper left corner for collection boxes (always show for collections)
                    if (rectangle.name) {
                        const nameBoxWidth = Math.max(rectangle.name.length * 8, 40);
                        const nameBoxHeight = 20;
                        const nameBoxX = rectangle.x; // Hard against the collection box
                        const nameBoxY = rectangle.y; // Hard against the collection box
                        const nameRadius = nameBoxHeight / 2; // Radius = half height
                        
                        // Use rectangle color for name box fill, or default background
                        let nameBoxFillColor;
                        if (rectangle.color && rectangle.color !== '#ffffff') {
                            nameBoxFillColor = rectangle.color;
                        } else {
                            nameBoxFillColor = darkBackground ? 'rgba(60, 60, 60, 0.9)' : 'rgba(240, 240, 240, 0.9)';
                        }
                        
                        // Draw custom rounded rectangle (top-left, bottom-right rounded only)
                        ctx.fillStyle = nameBoxFillColor;
                        ctx.strokeStyle = borderColor;
                        ctx.lineWidth = 1 / zoom;
                        
                        // Custom path with selective rounded corners
                        ctx.beginPath();
                        // Start at top-left, move clockwise
                        ctx.moveTo(nameBoxX + nameRadius, nameBoxY); // Top edge start (after top-left curve)
                        ctx.lineTo(nameBoxX + nameBoxWidth, nameBoxY); // Top edge to top-right (no curve)
                        ctx.lineTo(nameBoxX + nameBoxWidth, nameBoxY + nameBoxHeight - nameRadius); // Right edge to bottom-right curve
                        ctx.arcTo(nameBoxX + nameBoxWidth, nameBoxY + nameBoxHeight, nameBoxX + nameBoxWidth - nameRadius, nameBoxY + nameBoxHeight, nameRadius); // Bottom-right curve
                        ctx.lineTo(nameBoxX, nameBoxY + nameBoxHeight); // Bottom edge to bottom-left (no curve)
                        ctx.lineTo(nameBoxX, nameBoxY + nameRadius); // Left edge to top-left curve
                        ctx.arcTo(nameBoxX, nameBoxY, nameBoxX + nameRadius, nameBoxY, nameRadius); // Top-left curve
                        ctx.closePath();
                        
                        ctx.fill();
                        ctx.stroke();
                        
                        // Draw name text with contrasting color
                        const textColor = getContrastColor(nameBoxFillColor);
                        ctx.fillStyle = textColor;
                        ctx.font = (12 / zoom) + 'px Arial';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(rectangle.name, nameBoxX + nameBoxWidth / 2, nameBoxY + nameBoxHeight / 2);
                    }
                } else {
                    // Regular rectangles: existing behavior
                    // Convert hex color to rgba with low opacity for subtle background
                    let fillColor = 'rgba(255, 255, 255, 0.1)'; // Default white
                    if (rectangle.color && rectangle.color !== '#ffffff') {
                        const hexColor = rectangle.color;
                        const r = parseInt(hexColor.substr(1, 2), 16);
                        const g = parseInt(hexColor.substr(3, 2), 16);
                        const b = parseInt(hexColor.substr(5, 2), 16);
                        fillColor = 'rgba(' + r + ', ' + g + ', ' + b + ', 0.15)'; // Subtle 15% opacity
                    }
                    
                    if (rectangle.selected) {
                        ctx.fillStyle = 'rgba(100, 150, 255, 0.3)';
                        ctx.strokeStyle = '#6496ff';
                    } else {
                        ctx.fillStyle = fillColor;
                        // Adaptive border color based on background
                        ctx.strokeStyle = darkBackground ? '#cccccc' : '#333333';
                    }
                    
                    // Fill the rectangle
                    ctx.fillRect(rectangle.x, rectangle.y, rectangle.width, rectangle.height);
                
                    // Draw rectangle outline with variable thickness (only for regular rectangles)
                    if (hasLeftConnections || hasRightConnections) {
                        // Draw each edge separately with appropriate thickness
                        const normalWidth = rectangle.selected ? 2 / zoom : 1 / zoom;
                        const thickWidth = 5 / zoom; // 25% thicker than connection dot radius (4 * 1.25 = 5)
                        
                        ctx.beginPath();
                        
                        // Left edge (incoming connections)
                        ctx.lineWidth = hasLeftConnections ? thickWidth : normalWidth;
                        ctx.beginPath();
                        ctx.moveTo(rectangle.x, rectangle.y);
                        ctx.lineTo(rectangle.x, rectangle.y + rectangle.height);
                        ctx.stroke();
                        
                        // Right edge (outgoing connections)
                        ctx.lineWidth = hasRightConnections ? thickWidth : normalWidth;
                        ctx.beginPath();
                        ctx.moveTo(rectangle.x + rectangle.width, rectangle.y);
                        ctx.lineTo(rectangle.x + rectangle.width, rectangle.y + rectangle.height);
                        ctx.stroke();
                        
                        // Top and bottom edges (normal thickness)
                        ctx.lineWidth = normalWidth;
                        ctx.beginPath();
                        ctx.moveTo(rectangle.x, rectangle.y);
                        ctx.lineTo(rectangle.x + rectangle.width, rectangle.y);
                        ctx.stroke();
                        
                        ctx.beginPath();
                        ctx.moveTo(rectangle.x, rectangle.y + rectangle.height);
                        ctx.lineTo(rectangle.x + rectangle.width, rectangle.y + rectangle.height);
                        ctx.stroke();
                    } else {
                        // No connections, draw normal outline
                        ctx.lineWidth = rectangle.selected ? 2 / zoom : 1 / zoom;
                        ctx.strokeRect(rectangle.x, rectangle.y, rectangle.width, rectangle.height);
                    }
                    
                    // Draw rectangle name if it exists (only for regular rectangles)
                    if (rectangle.name && rectangle.name.trim() !== '') {
                        drawRectangleText(rectangle);
                    }
                } // End of regular rectangle block
                
                // Draw payload indicator for all rectangles with non-trivial payload
                if (rectangle.payload && rectangle.payload.trim() !== '') {
                    const indicatorSize = 6 / zoom; // Size of the red dot
                    const indicatorX = rectangle.x + indicatorSize + 2 / zoom; // Bottom left corner with small margin
                    const indicatorY = rectangle.y + rectangle.height - indicatorSize - 2 / zoom;
                    
                    ctx.fillStyle = '#cc0000'; // Darker red color (50% luminance)
                    ctx.beginPath();
                    ctx.arc(indicatorX, indicatorY, indicatorSize, 0, 2 * Math.PI);
                    ctx.fill();
                    
                    // Add a subtle white border for better visibility
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 1 / zoom;
                    ctx.stroke();
                }
                
                // Draw connection points for selected rectangle
                if (rectangle.selected) {
                    const points = rectangle.getConnectionPoints();
                    ctx.fillStyle = '#ff6b6b';
                    Object.values(points).forEach(point => {
                        ctx.beginPath();
                        ctx.arc(point.x, point.y, 4, 0, 2 * Math.PI);
                        ctx.fill();
                    });
                    
                    // Draw resize handles
                    drawResizeHandles(rectangle);
                }
            });
            
            // Draw current rectangle being drawn
            if (currentRect) {
                ctx.strokeStyle = '#ffeb3b';
                ctx.lineWidth = 2 / zoom; // Adjust line width for zoom
                ctx.setLineDash([5 / zoom, 5 / zoom]); // Adjust dash pattern for zoom
                ctx.strokeRect(currentRect.x, currentRect.y, currentRect.width, currentRect.height);
                ctx.setLineDash([]);
            }
            
            // Restore context
            ctx.restore();
        }
        
        function drawRectangleText(rectangle) {
            if (!rectangle.name || rectangle.name.trim() === '') return;
            
            // Set text properties
            const fontSize = Math.max(12 / zoom, 8); // Scale font size with zoom, minimum 8px
            ctx.font = fontSize + 'px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle'; // Center vertically like HTML export
            
            // Calculate text position (center of rectangle)
            const textX = rectangle.x + rectangle.width / 2;
            const textY = rectangle.y + rectangle.height / 2; // Center vertically
            
            // Draw text with outline for better readability without background
            const lineWidth = Math.max(2 / zoom, 1);
            
            // Draw text outline (stroke)
            ctx.strokeStyle = darkBackground ? '#000000' : '#ffffff';
            ctx.lineWidth = lineWidth;
            ctx.strokeText(rectangle.name, textX, textY);
            
            // Draw the text (fill) - color matches background
            ctx.fillStyle = darkBackground ? '#ffffff' : '#000000';
            ctx.fillText(rectangle.name, textX, textY);
        }
        
        // Helper function to determine if text should be black or white for best contrast
        function getContrastColor(backgroundColor) {
            // Remove # if present
            const hex = backgroundColor.replace('#', '');
            
            // Convert to RGB
            const r = parseInt(hex.substr(0, 2), 16);
            const g = parseInt(hex.substr(2, 2), 16);
            const b = parseInt(hex.substr(4, 2), 16);
            
            // Calculate luminance using relative luminance formula
            const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
            
            // Return black for light colors, white for dark colors
            return luminance > 0.5 ? '#000000' : '#ffffff';
        }
        
        function drawConnectionLabel(connection) {
            if (!connection.label || connection.label.trim() === '') return;
            
            const labelPos = connection.getLabelPosition();
            const fontSize = Math.max(10 / zoom, 6); // Smaller font for labels
            ctx.font = fontSize + 'px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            // Measure text for background box
            const textMetrics = ctx.measureText(connection.label);
            const textWidth = textMetrics.width;
            const boxWidth = textWidth + 8 / zoom; // Padding
            const boxHeight = fontSize + 4 / zoom; // Padding
            const radius = boxHeight / 2; // Make radius half the height for lozenge shape
            
            // Use connection color for background (with selection override)
            const backgroundColor = connection.selected ? '#ff6b6b' : (connection.color || '#4ecdc4');
            const textColor = getContrastColor(backgroundColor);
            
            // Draw rounded rectangle (lozenge) background
            ctx.fillStyle = backgroundColor;
            ctx.beginPath();
            ctx.roundRect(
                labelPos.x - boxWidth / 2,
                labelPos.y - boxHeight / 2,
                boxWidth,
                boxHeight,
                radius
            );
            ctx.fill();
            
            // Draw rounded border with same color as background
            ctx.strokeStyle = backgroundColor;
            ctx.lineWidth = 1 / zoom;
            ctx.beginPath();
            ctx.roundRect(
                labelPos.x - boxWidth / 2,
                labelPos.y - boxHeight / 2,
                boxWidth,
                boxHeight,
                radius
            );
            ctx.stroke();
            
            // Draw text with contrasting color
            ctx.fillStyle = textColor;
            ctx.fillText(connection.label, labelPos.x, labelPos.y);
        }
        
        function drawGridDots() {
            console.log('drawGridDots called with zoom:', zoom, 'pan:', panX, panY);
            // Calculate visible area in world coordinates
            const startX = Math.floor((-panX) / zoom / gridSize) * gridSize;
            const startY = Math.floor((-panY) / zoom / gridSize) * gridSize;
            const endX = Math.ceil((canvas.width - panX) / zoom / gridSize) * gridSize;
            const endY = Math.ceil((canvas.height - panY) / zoom / gridSize) * gridSize;
            
            console.log('Grid bounds:', { startX, startY, endX, endY });
            
            // Set dot style - subtle gray dots
            ctx.fillStyle = 'rgba(128, 128, 128, 0.3)';
            const dotRadius = 1 / zoom; // Very small dots that scale with zoom
            
            let dotCount = 0;
            // Draw dots at each grid intersection
            for (let x = startX; x <= endX; x += gridSize) {
                for (let y = startY; y <= endY; y += gridSize) {
                    ctx.beginPath();
                    ctx.arc(x, y, dotRadius, 0, 2 * Math.PI);
                    ctx.fill();
                    dotCount++;
                }
            }
            console.log('Drew', dotCount, 'grid dots');
        }
        
        function resetLabelPositionsForRectangle(rectangle) {
            // Find all connections that involve this rectangle
            connections.forEach(connection => {
                if (connection.fromRect === rectangle || connection.toRect === rectangle) {
                    // Reset the label position to null so it will be automatically positioned on the curve
                    connection.labelPosition = null;
                }
            });
        }
        
        function drawCurvedConnection(fromX, fromY, toX, toY, connection = null) {
            ctx.beginPath();
            ctx.moveTo(fromX, fromY);
            
            // Always use horizontal Bézier curves for consistent orthogonal behavior
            const distance = Math.abs(toX - fromX);
            const curveOffset = Math.min(distance * 0.5, 80); // Control how much the curve bends
            
            // Create a smooth curve using bezier curve with horizontal tangents
            const cp1X = fromX + curveOffset;
            const cp1Y = fromY;
            const cp2X = toX - curveOffset;
            const cp2Y = toY;
            
            ctx.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, toX, toY);
            ctx.stroke();
        }
        
        function drawConnectionDot(x, y, selected = false) {
            if (selected) {
                ctx.fillStyle = '#ff6b6b';
            } else {
                ctx.fillStyle = '#4ecdc4';
            }
            
            const radius = 4 / zoom; // Adjust radius for zoom
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, 2 * Math.PI);
            ctx.fill();
            
            // Add a white border for better visibility
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1 / zoom; // Adjust line width for zoom
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, 2 * Math.PI);
            ctx.stroke();
        }
        
        function drawArrow(fromX, fromY, toX, toY) {
            // This function is now replaced by drawConnectionDot, but keeping for compatibility
            const angle = Math.atan2(toY - fromY, toX - fromX);
            const arrowLength = 10;
            const arrowAngle = Math.PI / 6;
            
            ctx.beginPath();
            ctx.moveTo(toX, toY);
            ctx.lineTo(
                toX - arrowLength * Math.cos(angle - arrowAngle),
                toY - arrowLength * Math.sin(angle - arrowAngle)
            );
            ctx.moveTo(toX, toY);
            ctx.lineTo(
                toX - arrowLength * Math.cos(angle + arrowAngle),
                toY - arrowLength * Math.sin(angle + arrowAngle)
            );
            ctx.stroke();
        }
        
        function drawResizeHandles(rectangle) {
            const handleSize = 8 / zoom; // Adjust handle size for zoom
            const handles = [
                { x: rectangle.x, y: rectangle.y }, // top-left
                { x: rectangle.x + rectangle.width, y: rectangle.y }, // top-right
                { x: rectangle.x, y: rectangle.y + rectangle.height }, // bottom-left
                { x: rectangle.x + rectangle.width, y: rectangle.y + rectangle.height }, // bottom-right
                { x: rectangle.x + rectangle.width / 2, y: rectangle.y }, // top
                { x: rectangle.x + rectangle.width / 2, y: rectangle.y + rectangle.height }, // bottom
                { x: rectangle.x, y: rectangle.y + rectangle.height / 2 }, // left
                { x: rectangle.x + rectangle.width, y: rectangle.y + rectangle.height / 2 } // right
            ];
            
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = '#6496ff';
            ctx.lineWidth = 1 / zoom; // Adjust line width for zoom
            
            handles.forEach(handle => {
                ctx.fillRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
                ctx.strokeRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
            });
        }
        
        // Color palette helper functions
        function setColorPaletteSelection(paletteId, color) {
            const palette = document.getElementById(paletteId);
            if (!palette) return;
            
            const swatches = palette.querySelectorAll('.color-swatch');
            
            // Remove selection from all swatches
            swatches.forEach(swatch => swatch.classList.remove('selected'));
            
            // Find and select the matching color swatch
            for (const swatch of swatches) {
                if (swatch.dataset.color.toLowerCase() === color.toLowerCase()) {
                    swatch.classList.add('selected');
                    return;
                }
            }
            
            // If no exact match found, don't select any (custom color)
        }
        
        function getSelectedColorFromPalette(paletteId) {
            const palette = document.getElementById(paletteId);
            if (!palette) return '#ffffff';
            
            const selectedSwatch = palette.querySelector('.color-swatch.selected');
            if (selectedSwatch) {
                return selectedSwatch.dataset.color;
            }
            
            // If no swatch is selected, try to get the color from the current editing object
            if (paletteId === 'rectColorPalette' && currentEditingRect) {
                return currentEditingRect.color || '#ffffff';
            } else if (paletteId === 'connColorPalette' && currentEditingConnection) {
                return currentEditingConnection.color || '#4ecdc4';
            }
            
            return '#ffffff';
        }
        
        function setupColorPaletteEvents() {
            // Setup click events for both color palettes
            document.querySelectorAll('.color-palette').forEach(palette => {
                palette.addEventListener('click', (e) => {
                    if (e.target.classList.contains('color-swatch')) {
                        // Remove selection from siblings
                        palette.querySelectorAll('.color-swatch').forEach(swatch => {
                            swatch.classList.remove('selected');
                        });
                        // Select clicked swatch
                        e.target.classList.add('selected');
                    }
                });
            });
        }
        
        // Initialize color palette events when DOM is ready
        setTimeout(setupColorPaletteEvents, 100);
        
        function clearCanvas() {
            rectangles = [];
            connections = [];
            selectedRect = null;
            selectedConnection = null;
            updateFileNameDisplay(null); // Clear filename display
            
            // Notify extension to clear titles
            vscode.postMessage({
                type: 'clearTitles'
            });
            
            notifyDataChanged();
            draw();
        }
        
        function deleteSelected() {
            console.log('deleteSelected called', { selectedRect, selectedConnection });
            let dataChanged = false;
            
            if (selectedRect) {
                console.log('Deleting rectangle:', selectedRect.id);
                // Remove the rectangle and all its connections
                const rectId = selectedRect.id;
                rectangles = rectangles.filter(r => r.id !== rectId);
                connections = connections.filter(c => c.fromRect.id !== rectId && c.toRect.id !== rectId);
                selectedRect = null;
                dataChanged = true;
            } else if (selectedConnection) {
                console.log('Deleting connection:', selectedConnection.id);
                // Remove the connection
                const connId = selectedConnection.id;
                connections = connections.filter(c => c.id !== connId);
                selectedConnection = null;
                dataChanged = true;
            }
            
            console.log('Data changed:', dataChanged);
            if (dataChanged) {
                notifyDataChanged();
            }
            
            hideContextMenu();
            draw();
        }
        
        // Make functions globally accessible for HTML onclick handlers
        window.deleteSelected = deleteSelected;
        window.saveProperties = saveProperties;
        window.cancelProperties = cancelProperties;
        
        function saveDrawing() {
            const data = {
                rectangles: rectangles.map(r => ({
                    x: r.x,
                    y: r.y,
                    width: r.width,
                    height: r.height,
                    id: r.id,
                    name: r.name || '',
                    description: r.description || '',
                    payload: r.payload || '',
                    color: r.color || '#ffffff',
                    type: r.type || 'regular' // Include type for collection boxes
                })),
                connections: connections.map(c => ({
                    fromRectId: c.fromRect.id,
                    toRectId: c.toRect.id,
                    id: c.id,
                    label: c.label || '',
                    description: c.description || '',
                    payload: c.payload || '',
                    color: c.color || '#4ecdc4',
                    lineStyle: c.lineStyle || 'solid',
                    labelPosition: c.labelPosition
                }))
            };
            
            vscode.postMessage({
                type: 'saveDrawing',
                data: data
            });
        }
        
        function loadDrawing() {
            vscode.postMessage({
                type: 'loadDrawing'
            });
        }
        
        function exportToHTML() {
            const data = {
                rectangles: rectangles.map(r => ({
                    x: r.x,
                    y: r.y,
                    width: r.width,
                    height: r.height,
                    id: r.id,
                    name: r.name || '',
                    description: r.description || '',
                    payload: r.payload || '',
                    color: r.color || '#ffffff',
                    type: r.type || 'regular' // Include type for collection boxes
                })),
                connections: connections.map(c => ({
                    fromRectId: c.fromRect.id,
                    toRectId: c.toRect.id,
                    id: c.id,
                    label: c.label || '',
                    description: c.description || '',
                    payload: c.payload || '',
                    color: c.color || '#4ecdc4',
                    lineStyle: c.lineStyle || 'solid',
                    labelPosition: c.labelPosition
                })),
                darkBackground: darkBackground
            };
            
            vscode.postMessage({
                type: 'exportToHTML',
                data: data
            });
        }
        
        function exportToSVG() {
            const data = {
                rectangles: rectangles.map(r => ({
                    x: r.x,
                    y: r.y,
                    width: r.width,
                    height: r.height,
                    id: r.id,
                    name: r.name || '',
                    description: r.description || '',
                    payload: r.payload || '',
                    color: r.color || '#ffffff',
                    type: r.type || 'regular' // Include type for collection boxes
                })),
                connections: connections.map(c => ({
                    fromRectId: c.fromRect.id,
                    toRectId: c.toRect.id,
                    id: c.id,
                    label: c.label || '',
                    description: c.description || '',
                    payload: c.payload || '',
                    color: c.color || '#4ecdc4',
                    lineStyle: c.lineStyle || 'solid',
                    labelPosition: c.labelPosition
                })),
                darkBackground: darkBackground
            };
            
            vscode.postMessage({
                type: 'exportToSVG',
                data: data
            });
        }
        
        function toggleBackground() {
            darkBackground = !darkBackground;
            document.body.style.backgroundColor = darkBackground ? '#1e1e1e' : '#ffffff';
            canvas.style.backgroundColor = darkBackground ? '#1e1e1e' : '#ffffff';
            draw(); // Redraw to update any grid colors
        }
        
        function openInPanel() {
            // Get current drawing data
            const data = {
                rectangles: rectangles.map(r => ({
                    x: r.x,
                    y: r.y,
                    width: r.width,
                    height: r.height,
                    id: r.id,
                    name: r.name || '',
                    description: r.description || '',
                    payload: r.payload || '',
                    color: r.color || '#ffffff',
                    type: r.type || 'regular' // Include type for collection boxes
                })),
                connections: connections.map(c => ({
                    fromRectId: c.fromRect.id,
                    toRectId: c.toRect.id,
                    id: c.id,
                    label: c.label || '',
                    description: c.description || '',
                    payload: c.payload || '',
                    color: c.color || '#4ecdc4',
                    lineStyle: c.lineStyle || 'solid',
                    labelPosition: c.labelPosition
                }))
            };
            
            vscode.postMessage({
                type: 'openInPanel',
                data: data
            });
        }
        
        function openInSidebar() {
            // Get current drawing data before closing panel
            const data = {
                rectangles: rectangles.map(r => ({
                    x: r.x,
                    y: r.y,
                    width: r.width,
                    height: r.height,
                    id: r.id,
                    name: r.name || '',
                    description: r.description || '',
                    payload: r.payload || '',
                    color: r.color || '#ffffff',
                    type: r.type || 'regular' // Include type for collection boxes
                })),
                connections: connections.map(c => ({
                    fromRectId: c.fromRect.id,
                    toRectId: c.toRect.id,
                    id: c.id,
                    label: c.label || '',
                    description: c.description || '',
                    payload: c.payload || '',
                    color: c.color || '#4ecdc4',
                    lineStyle: c.lineStyle || 'solid',
                    labelPosition: c.labelPosition
                }))
            };
            
            vscode.postMessage({
                type: 'openInSidebar',
                data: data
            });
        }
        
        function showHelp() {
            document.getElementById('helpModal').style.display = 'block';
        }
        
        function hideHelp() {
            document.getElementById('helpModal').style.display = 'none';
        }
        
        // Close help modal when clicking outside
        document.getElementById('helpModal').addEventListener('click', function(e) {
            if (e.target === this) {
                hideHelp();
            }
        });
        
        function resetView() {
            panX = 0;
            panY = 0;
            zoom = 1;
            updateZoomDisplay();
            draw();
        }
        
        function updateZoomDisplay() {
            const zoomElement = document.getElementById('zoomLevel');
            if (zoomElement) {
                zoomElement.textContent = Math.round(zoom * 100) + '%';
            }
        }
        
        function updateFileNameDisplay(filePath) {
            console.log('updateFileNameDisplay called with:', filePath);
            
            if (filePath) {
                // Extract filename from path
                const fileName = filePath.split(/[/\\\\]/).pop() || 'Untitled';
                console.log('Extracted filename:', fileName);
                
                // Update sidebar filename display
                const fileNameElement = document.getElementById('fileNameDisplay');
                if (fileNameElement) {
                    console.log('Setting sidebar filename to:', fileName);
                    fileNameElement.textContent = fileName;
                    fileNameElement.title = filePath;
                    fileNameElement.style.display = 'block';
                }
                
                // Update panel filename display (next to zoom)
                const fileNameElementPanel = document.getElementById('fileNameDisplayPanel');
                if (fileNameElementPanel) {
                    console.log('Setting panel filename to:', fileName);
                    fileNameElementPanel.textContent = fileName;
                    fileNameElementPanel.title = filePath;
                    fileNameElementPanel.style.display = 'inline';
                }
            } else {
                // Clear both displays
                const fileNameElement = document.getElementById('fileNameDisplay');
                if (fileNameElement) {
                    fileNameElement.textContent = '';
                    fileNameElement.title = '';
                    fileNameElement.style.display = 'none';
                }
                
                const fileNameElementPanel = document.getElementById('fileNameDisplayPanel');
                if (fileNameElementPanel) {
                    fileNameElementPanel.textContent = '';
                    fileNameElementPanel.title = '';
                    fileNameElementPanel.style.display = 'none';
                }
            }
        }
        
        // Listen for messages from the extension
        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.type) {
                case 'loadData':
                    console.log('Loading data:', message.data);
                    const data = message.data;
                    rectangles = [];
                    connections = [];
                    
                    // Recreate rectangles
                    console.log('Loading rectangles:', data.rectangles);
                    data.rectangles.forEach(rectData => {
                        console.log('Creating rectangle:', rectData);
                        const rect = new Rectangle(
                            rectData.x, 
                            rectData.y, 
                            rectData.width, 
                            rectData.height, 
                            rectData.name || '', 
                            rectData.description || '', 
                            rectData.payload || '',
                            rectData.color || '#ffffff',
                            rectData.type || 'regular' // Handle new type field
                        );
                        rect.id = rectData.id;
                        rectangles.push(rect);
                        console.log('Created rectangle:', rect);
                    });
                    
                    console.log('Final rectangles array:', rectangles);
                    
                    // Recreate connections
                    console.log('Loading connections:', data.connections);
                    data.connections.forEach(connData => {
                        console.log('Processing connection:', connData);
                        const fromRect = rectangles.find(r => r.id === connData.fromRectId);
                        const toRect = rectangles.find(r => r.id === connData.toRectId);
                        console.log('Found rectangles - from:', fromRect, 'to:', toRect);
                        
                        if (fromRect && toRect) {
                            // Create connection with proper edge snapping
                            const fromPoint = {
                                x: fromRect.x + fromRect.width,
                                y: fromRect.y + fromRect.height / 2
                            };
                            const toPoint = {
                                x: toRect.x,
                                y: toRect.y + toRect.height / 2
                            };
                            
                            const connection = new Connection(fromRect, fromPoint, toRect, toPoint, 
                                connData.label || '', 
                                connData.description || '', 
                                connData.payload || '',
                                connData.color || '#4ecdc4',
                                connData.lineStyle || 'solid');
                            connection.id = connData.id;
                            if (connData.labelPosition) {
                                connection.labelPosition = connData.labelPosition;
                            }
                            connections.push(connection);
                        }
                    });
                    
                    draw();
                    break;
                    
                case 'updateFileName':
                    console.log('Updating filename display:', message.filePath);
                    updateFileNameDisplay(message.filePath);
                    break;
            }
        });
        
        // Initial draw
        draw();
    </script>
</body>
</html>`;
    }
}