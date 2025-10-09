import * as vscode from 'vscode';

export class DrawingViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'rectangleDrawerView';
    private static currentPanel: vscode.WebviewPanel | undefined;
    private static currentData: any = { rectangles: [], connections: [] }; // Shared data store
    private static lastSaveLocation: vscode.Uri | undefined;
    private static lastLoadLocation: vscode.Uri | undefined;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview, 'sidebar');

        webviewView.webview.onDidReceiveMessage(
            message => {
                switch (message.type) {
                    case 'saveDrawing':
                        this._saveDrawing(message.data);
                        break;
                    case 'loadDrawing':
                        this._loadDrawing(webviewView.webview);
                        break;
                    case 'dataChanged':
                        // Update shared data store
                        DrawingViewProvider.currentData = message.data;
                        break;
                    case 'openInPanel':
                        this._openInPanelWithData(message.data);
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
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            DrawingViewProvider.viewType,
            'Rectangle Drawer',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [extensionUri],
                retainContextWhenHidden: true
            }
        );

        DrawingViewProvider.currentPanel = panel;

        panel.webview.html = new DrawingViewProvider(extensionUri)._getHtmlForWebview(panel.webview, 'panel');

        // Load initial data if provided, otherwise use shared data
        const dataToLoad = initialData || DrawingViewProvider.currentData;
        setTimeout(() => {
            panel.webview.postMessage({ type: 'loadData', data: dataToLoad });
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
                    case 'dataChanged':
                        DrawingViewProvider.currentData = message.data;
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
                defaultUri = vscode.Uri.joinPath(lastDir, 'rectangle-drawing.json');
            } else if (DrawingViewProvider.lastLoadLocation) {
                // Use same directory as last load if no save location
                const lastDir = vscode.Uri.joinPath(DrawingViewProvider.lastLoadLocation, '..');
                defaultUri = vscode.Uri.joinPath(lastDir, 'rectangle-drawing.json');
            } else {
                defaultUri = vscode.Uri.file('rectangle-drawing.json');
            }
            
            // Show save dialog
            const saveUri = await vscode.window.showSaveDialog({
                defaultUri: defaultUri,
                filters: {
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
                
                // Send to webview
                webview.postMessage({ type: 'loadData', data: data });
                
                vscode.window.showInformationMessage(`Drawing loaded from ${openUri[0].fsPath}`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load drawing: ${error}`);
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview, context: string = 'sidebar') {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Rectangle Drawer</title>
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
            padding: 6px 12px;
            margin-right: 8px;
            cursor: pointer;
            border-radius: 2px;
        }
        
        button:hover {
            background-color: var(--vscode-button-hoverBackground);
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
    </style>
</head>
<body>
    <div class="controls">
        <button onclick="clearCanvas()">Clear All</button>
        <button onclick="saveDrawing()">Save</button>
        <button onclick="loadDrawing()">Load</button>
        <button onclick="resetView()">Reset View</button>
        ${context === 'sidebar' ? '<button onclick="openInPanel()">Open in Panel</button>' : ''}
        <span style="margin-left: 10px; font-size: ${context === 'sidebar' ? '9px' : '11px'};">
            Zoom: <span id="zoomLevel">100%</span>
        </span>
    </div>
    
    <div class="canvas-container">
        <canvas id="canvas"></canvas>
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
                    <textarea id="rectPayload" placeholder="Enter payload data (Ctrl+C/V when selected)" rows="3"></textarea>
                </div>
            </div>
            <div id="connectionProperties" style="display: none;">
                <div class="property-field">
                    <label for="connLabel">Label:</label>
                    <input type="text" id="connLabel" placeholder="Enter connection label">
                </div>
            </div>
            <div class="property-buttons">
                <button onclick="saveProperties()">Save</button>
                <button onclick="cancelProperties()">Cancel</button>
            </div>
        </div>
    </div>
    
    <div class="info">
        <div><strong>Instructions:</strong></div>
        <div>• Left-click and drag to create rectangles</div>
        <div>• Right-click and drag to connect rectangles</div>
        <div>• <strong>Right-drag to empty space creates new connected rectangle</strong></div>
        <div>• Click on rectangles to select them</div>
        <div>• <strong>Double-click rectangles to edit name</strong></div>
        <div>• <strong>Double-click connections to add labels</strong></div>
        <div>• <strong>Drag connection labels to reposition (curves line)</strong></div>
        <div>• Drag selected rectangles to move them</div>
        <div>• Drag resize handles (white squares) to resize</div>
        <div>• <strong>Right-click rectangles or connections to delete</strong></div>
        <div>• <strong>Middle-click and drag to pan</strong></div>
        <div>• <strong>Mouse wheel to zoom in/out</strong></div>
        <div>• <strong>All elements snap to 10px grid</strong></div>
        <div>• Save/Load remembers last used folder</div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d');
        const canvasContainer = document.querySelector('.canvas-container');
        
        // Make canvas responsive
        function resizeCanvas() {
            const container = canvasContainer;
            if (!container) return;
            
            const rect = container.getBoundingClientRect();
            
            // Ensure we have minimum dimensions
            const width = Math.max(rect.width, 200);
            const height = Math.max(rect.height, 200);
            
            // Set canvas size to fill container
            canvas.width = width;
            canvas.height = height;
            
            // Set CSS size to match
            canvas.style.width = width + 'px';
            canvas.style.height = height + 'px';
            
            // Redraw everything
            draw();
        }
        
        // Initial resize and setup resize listener
        window.addEventListener('resize', resizeCanvas);
        window.addEventListener('load', resizeCanvas);
        
        // Use ResizeObserver for better responsiveness
        if (window.ResizeObserver) {
            const resizeObserver = new ResizeObserver(entries => {
                requestAnimationFrame(resizeCanvas);
            });
            resizeObserver.observe(canvasContainer);
        }
        
        // Initial setup with multiple attempts to ensure proper sizing
        setTimeout(() => {
            resizeCanvas();
            updateZoomDisplay();
        }, 100);
        setTimeout(resizeCanvas, 300);
        setTimeout(resizeCanvas, 500);
        
        let rectangles = [];
        let connections = [];
        let isDrawing = false;
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
        
        // Grid settings
        const gridSize = 10;
        
        function snapToGrid(value) {
            return Math.round(value / gridSize) * gridSize;
        }
        
        // Rectangle class
        class Rectangle {
            constructor(x, y, width, height, name = '', description = '', payload = '') {
                this.x = snapToGrid(x);
                this.y = snapToGrid(y);
                this.width = snapToGrid(Math.max(width, gridSize));
                this.height = snapToGrid(Math.max(height, gridSize));
                this.selected = false;
                this.id = Math.random().toString(36).substr(2, 9);
                this.name = name;
                this.description = description;
                this.payload = payload;
            }
            
            contains(x, y) {
                return x >= this.x && x <= this.x + this.width &&
                       y >= this.y && y <= this.y + this.height;
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
        }
        
        // Connection class
        class Connection {
            constructor(fromRect, fromPoint, toRect, toPoint, label = '') {
                this.fromRect = fromRect;
                this.fromPoint = fromPoint;
                this.toRect = toRect;
                this.toPoint = toPoint;
                this.id = Math.random().toString(36).substr(2, 9);
                this.selected = false;
                this.label = label;
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
                const labelWidth = 60; // Approximate label box width
                const labelHeight = 20; // Approximate label box height
                
                return x >= labelPos.x - labelWidth/2 && 
                       x <= labelPos.x + labelWidth/2 &&
                       y >= labelPos.y - labelHeight/2 && 
                       y <= labelPos.y + labelHeight/2;
            }
        }
        
        // Event handlers
        canvas.addEventListener('mousedown', handleMouseDown);
        canvas.addEventListener('mousemove', handleMouseMove);
        canvas.addEventListener('mouseup', handleMouseUp);
        canvas.addEventListener('contextmenu', handleContextMenu);
        canvas.addEventListener('wheel', handleWheel);
        canvas.addEventListener('dblclick', handleDoubleClick);
        document.addEventListener('click', hideContextMenu);
        document.addEventListener('keydown', handleKeyDown);
        
        // Property editor keyboard support
        document.addEventListener('keydown', function(e) {
            const propertyEditor = document.getElementById('propertyEditor');
            if (propertyEditor && propertyEditor.style.display === 'flex') {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    saveProperties();
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
            
            // Find rectangle under mouse first
            const clickedRect = rectangles.find(r => r.contains(x, y));
            
            if (clickedRect) {
                console.log('Rectangle found for editing:', clickedRect);
                editRectangleProperties(clickedRect);
                return;
            }
            
            // If no rectangle, check for connections
            const clickedConnection = connections.find(c => c.isNearConnection(x, y));
            
            if (clickedConnection) {
                console.log('Connection found for editing:', clickedConnection);
                editConnectionProperties(clickedConnection);
                return;
            }
            
            console.log('No rectangle or connection found at click position');
        }
        
        function handleKeyDown(e) {
            // Only handle Ctrl+C and Ctrl+V when a rectangle is selected and no input fields are focused
            if (!selectedRect || document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
                return;
            }
            
            if (e.ctrlKey || e.metaKey) { // Support both Ctrl (Windows/Linux) and Cmd (Mac)
                if (e.key === 'c' || e.key === 'C') {
                    // Copy payload to clipboard
                    if (selectedRect.payload && selectedRect.payload.trim() !== '') {
                        navigator.clipboard.writeText(selectedRect.payload).then(() => {
                            console.log('Payload copied to clipboard:', selectedRect.payload);
                        }).catch(err => {
                            console.error('Failed to copy to clipboard:', err);
                        });
                    }
                    e.preventDefault();
                } else if (e.key === 'v' || e.key === 'V') {
                    // Paste from clipboard to payload
                    navigator.clipboard.readText().then(text => {
                        selectedRect.payload = text;
                        notifyDataChanged();
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
            
            // Configure for connection editing
            title.textContent = 'Edit Connection Properties';
            rectProps.style.display = 'none';
            connProps.style.display = 'block';
            
            // Set current values
            labelInput.value = connection.label || '';
            
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
                notifyDataChanged();
                draw();
            } else if (currentEditingConnection) {
                const labelInput = document.getElementById('connLabel');
                currentEditingConnection.label = labelInput.value;
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
                draw();
            } else if (isResizing && selectedRect && resizeHandle) {
                // Resize the rectangle
                selectedRect.resize(resizeHandle, x, y, dragStartX, dragStartY);
                dragStartX = x;
                dragStartY = y;
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
                drawCurvedConnection(startPoint.x, startPoint.y, endX, endY);
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
            
            // Find rectangle under cursor
            const hoveredRect = rectangles.find(r => r.contains(worldX, worldY));
            
            if (hoveredRect && hoveredRect.description && hoveredRect.description.trim() !== '') {
                tooltip.textContent = hoveredRect.description;
                tooltip.style.display = 'block';
                tooltip.style.left = (screenX + 10) + 'px';
                tooltip.style.top = (screenY - 30) + 'px';
            } else {
                tooltip.style.display = 'none';
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
                // Prompt for rectangle name
                const name = prompt('Enter a name for this rectangle:', '') || '';
                const newRect = new Rectangle(
                    currentRect.x,
                    currentRect.y,
                    currentRect.width,
                    currentRect.height,
                    name
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
                        '' // Empty label initially
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
                        name
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
                        '' // Empty label initially
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
                    name: r.name || ''
                })),
                connections: connections.map(c => ({
                    fromRectId: c.fromRect.id,
                    toRectId: c.toRect.id,
                    id: c.id,
                    label: c.label || '',
                    labelPosition: c.labelPosition
                }))
            };
            
            vscode.postMessage({
                type: 'dataChanged',
                data: data
            });
        }

        function draw() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Save context and apply pan/zoom transform
            ctx.save();
            ctx.setTransform(zoom, 0, 0, zoom, panX, panY);
            
            // Draw grid dots
            drawGridDots();
            
            // Draw connections
            connections.forEach(conn => {
                const points = conn.getConnectionPoints();
                const fromPoint = points.from;
                const toPoint = points.to;
                
                if (conn.selected) {
                    ctx.strokeStyle = '#ff6b6b';
                    ctx.lineWidth = 3 / zoom; // Adjust line width for zoom
                } else {
                    ctx.strokeStyle = '#4ecdc4';
                    ctx.lineWidth = 2 / zoom; // Adjust line width for zoom
                }
                
                // Draw curved line using bezier curve
                drawCurvedConnection(fromPoint.x, fromPoint.y, toPoint.x, toPoint.y, conn);
                
                // Draw dots at both ends
                drawConnectionDot(fromPoint.x, fromPoint.y, conn.selected);
                drawConnectionDot(toPoint.x, toPoint.y, conn.selected);
                
                // Draw connection label if it exists
                if (conn.label && conn.label.trim() !== '') {
                    drawConnectionLabel(conn);
                }
            });
            
            // Draw rectangles
            rectangles.forEach(rectangle => {
                if (rectangle.selected) {
                    ctx.fillStyle = 'rgba(100, 150, 255, 0.3)';
                    ctx.strokeStyle = '#6496ff';
                    ctx.lineWidth = 2 / zoom; // Adjust line width for zoom
                } else {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 1 / zoom; // Adjust line width for zoom
                }
                
                ctx.fillRect(rectangle.x, rectangle.y, rectangle.width, rectangle.height);
                ctx.strokeRect(rectangle.x, rectangle.y, rectangle.width, rectangle.height);
                
                // Draw rectangle name if it exists
                if (rectangle.name && rectangle.name.trim() !== '') {
                    drawRectangleText(rectangle);
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
            ctx.textBaseline = 'top';
            
            // Calculate text position (top center of rectangle)
            const textX = rectangle.x + rectangle.width / 2;
            const textY = rectangle.y + 4 / zoom; // Small padding from top edge
            
            // Draw text with outline for better readability without background
            const lineWidth = Math.max(2 / zoom, 1);
            
            // Draw text outline (stroke)
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = lineWidth;
            ctx.strokeText(rectangle.name, textX, textY);
            
            // Draw the text (fill)
            ctx.fillStyle = '#ffffff';
            ctx.fillText(rectangle.name, textX, textY);
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
            
            // Draw background box
            ctx.fillStyle = connection.selected ? 'rgba(255, 107, 107, 0.9)' : 'rgba(78, 205, 196, 0.9)';
            ctx.fillRect(
                labelPos.x - boxWidth / 2,
                labelPos.y - boxHeight / 2,
                boxWidth,
                boxHeight
            );
            
            // Draw border
            ctx.strokeStyle = connection.selected ? '#ff6b6b' : '#4ecdc4';
            ctx.lineWidth = 1 / zoom;
            ctx.strokeRect(
                labelPos.x - boxWidth / 2,
                labelPos.y - boxHeight / 2,
                boxWidth,
                boxHeight
            );
            
            // Draw text
            ctx.fillStyle = '#ffffff';
            ctx.fillText(connection.label, labelPos.x, labelPos.y);
        }
        
        function drawGridDots() {
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
        }
        
        function drawCurvedConnection(fromX, fromY, toX, toY, connection = null) {
            ctx.beginPath();
            ctx.moveTo(fromX, fromY);
            
            if (connection && connection.labelPosition) {
                // Use label position as control point for a more sophisticated curve
                const labelPos = connection.labelPosition;
                
                // Create curve that goes through the label position
                // Use quadratic curve through the label point
                ctx.quadraticCurveTo(labelPos.x, labelPos.y, toX, toY);
            } else {
                // Default S-curve behavior
                const distance = Math.abs(toX - fromX);
                const curveOffset = Math.min(distance * 0.5, 80); // Control how much the curve bends
                
                // Create a smooth curve using bezier curve
                // Control points are offset horizontally to create a nice S-curve
                const cp1X = fromX + curveOffset;
                const cp1Y = fromY;
                const cp2X = toX - curveOffset;
                const cp2Y = toY;
                
                ctx.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, toX, toY);
            }
            
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
        
        function clearCanvas() {
            rectangles = [];
            connections = [];
            selectedRect = null;
            selectedConnection = null;
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
                    name: r.name || ''
                })),
                connections: connections.map(c => ({
                    fromRectId: c.fromRect.id,
                    toRectId: c.toRect.id,
                    id: c.id,
                    label: c.label || '',
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
        
        function openInPanel() {
            // Get current drawing data
            const data = {
                rectangles: rectangles.map(r => ({
                    x: r.x,
                    y: r.y,
                    width: r.width,
                    height: r.height,
                    id: r.id,
                    name: r.name || ''
                })),
                connections: connections.map(c => ({
                    fromRectId: c.fromRect.id,
                    toRectId: c.toRect.id,
                    id: c.id,
                    label: c.label || '',
                    labelPosition: c.labelPosition
                }))
            };
            
            vscode.postMessage({
                type: 'openInPanel',
                data: data
            });
        }
        
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
        
        // Listen for messages from the extension
        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.type) {
                case 'loadData':
                    const data = message.data;
                    rectangles = [];
                    connections = [];
                    
                    // Recreate rectangles
                    data.rectangles.forEach(rectData => {
                        const rect = new Rectangle(rectData.x, rectData.y, rectData.width, rectData.height, rectData.name || '');
                        rect.id = rectData.id;
                        rectangles.push(rect);
                    });
                    
                    // Recreate connections
                    data.connections.forEach(connData => {
                        const fromRect = rectangles.find(r => r.id === connData.fromRectId);
                        const toRect = rectangles.find(r => r.id === connData.toRectId);
                        
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
                            
                            const connection = new Connection(fromRect, fromPoint, toRect, toPoint, connData.label || '');
                            connection.id = connData.id;
                            if (connData.labelPosition) {
                                connection.labelPosition = connData.labelPosition;
                            }
                            connections.push(connection);
                        }
                    });
                    
                    draw();
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