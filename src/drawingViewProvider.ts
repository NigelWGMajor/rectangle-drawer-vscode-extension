import * as vscode from 'vscode';

export class DrawingViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'rectangleDrawerView';
    private static currentPanel: vscode.WebviewPanel | undefined;

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

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(
            message => {
                switch (message.type) {
                    case 'saveDrawing':
                        this._saveDrawing(message.data);
                        break;
                    case 'loadDrawing':
                        this._loadDrawing(webviewView.webview);
                        break;
                }
            }
        );
    }

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (DrawingViewProvider.currentPanel) {
            DrawingViewProvider.currentPanel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            DrawingViewProvider.viewType,
            'Rectangle Drawer',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [extensionUri]
            }
        );

        DrawingViewProvider.currentPanel = panel;

        panel.webview.html = new DrawingViewProvider(extensionUri)._getHtmlForWebview(panel.webview);

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
                }
            }
        );
    }

    private _saveDrawing(data: any) {
        vscode.window.showInformationMessage('Drawing saved!');
        // In a real implementation, you might save to workspace storage or a file
        console.log('Saving drawing data:', data);
    }

    private _loadDrawing(webview: vscode.Webview) {
        // In a real implementation, you might load from workspace storage or a file
        const sampleData = {
            rectangles: [],
            connections: []
        };
        webview.postMessage({ type: 'loadData', data: sampleData });
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Rectangle Drawer</title>
    <style>
        body {
            margin: 0;
            padding: 10px;
            font-family: var(--vscode-font-family);
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
        }
        
        #canvas {
            border: 1px solid var(--vscode-panel-border);
            cursor: crosshair;
            background-color: var(--vscode-editor-background);
            display: block;
            margin: 10px 0;
        }
        
        .controls {
            margin-bottom: 10px;
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
            font-size: 12px;
            margin-top: 10px;
            color: var(--vscode-descriptionForeground);
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
    </style>
</head>
<body>
    <div class="controls">
        <button onclick="clearCanvas()">Clear All</button>
        <button onclick="saveDrawing()">Save</button>
        <button onclick="loadDrawing()">Load</button>
    </div>
    
    <canvas id="canvas" width="600" height="400"></canvas>
    
    <div id="contextMenu" class="context-menu">
        <div class="context-menu-item" onclick="deleteSelected()">Delete</div>
    </div>
    
    <div class="info">
        <div><strong>Instructions:</strong></div>
        <div>• Left-click and drag to create rectangles</div>
        <div>• Right-click and drag to connect rectangles</div>
        <div>• Connections snap to edges (right → left)</div>
        <div>• Click on rectangles to select them</div>
        <div>• Drag selected rectangles to move them</div>
        <div>• Drag resize handles (white squares) to resize</div>
        <div>• <strong>Right-click rectangles or connections to delete</strong></div>
        <div>• Connections automatically update when moving/resizing</div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d');
        
        let rectangles = [];
        let connections = [];
        let isDrawing = false;
        let isConnecting = false;
        let isDragging = false;
        let isResizing = false;
        let startPoint = null;
        let currentRect = null;
        let selectedRect = null;
        let selectedConnection = null;
        let dragStartX = 0;
        let dragStartY = 0;
        let dragOffset = { x: 0, y: 0 };
        let resizeHandle = null;
        let contextMenu = null;
        
        // Rectangle class
        class Rectangle {
            constructor(x, y, width, height) {
                this.x = x;
                this.y = y;
                this.width = width;
                this.height = height;
                this.selected = false;
                this.id = Math.random().toString(36).substr(2, 9);
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
                
                switch (handle) {
                    case 'top-left':
                        this.width -= deltaX;
                        this.height -= deltaY;
                        this.x += deltaX;
                        this.y += deltaY;
                        break;
                    case 'top-right':
                        this.width += deltaX;
                        this.height -= deltaY;
                        this.y += deltaY;
                        break;
                    case 'bottom-left':
                        this.width -= deltaX;
                        this.height += deltaY;
                        this.x += deltaX;
                        break;
                    case 'bottom-right':
                        this.width += deltaX;
                        this.height += deltaY;
                        break;
                    case 'top':
                        this.height -= deltaY;
                        this.y += deltaY;
                        break;
                    case 'bottom':
                        this.height += deltaY;
                        break;
                    case 'left':
                        this.width -= deltaX;
                        this.x += deltaX;
                        break;
                    case 'right':
                        this.width += deltaX;
                        break;
                }
                
                // Ensure minimum size
                if (this.width < 20) {
                    this.width = 20;
                }
                if (this.height < 20) {
                    this.height = 20;
                }
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
            constructor(fromRect, fromPoint, toRect, toPoint) {
                this.fromRect = fromRect;
                this.fromPoint = fromPoint;
                this.toRect = toRect;
                this.toPoint = toPoint;
                this.id = Math.random().toString(36).substr(2, 9);
                this.selected = false;
            }
            
            getConnectionPoints() {
                // Snap to edges: right edge of source rect, left edge of target rect
                const fromEdge = this.getSnapPoint(this.fromRect, this.toRect, 'from');
                const toEdge = this.getSnapPoint(this.toRect, this.fromRect, 'to');
                
                return { from: fromEdge, to: toEdge };
            }
            
            getSnapPoint(rect, otherRect, direction) {
                if (direction === 'from') {
                    // Snap to right edge of source rectangle
                    return {
                        x: rect.x + rect.width,
                        y: rect.y + rect.height / 2
                    };
                } else {
                    // Snap to left edge of target rectangle
                    return {
                        x: rect.x,
                        y: rect.y + rect.height / 2
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
        
        // Event handlers
        canvas.addEventListener('mousedown', handleMouseDown);
        canvas.addEventListener('mousemove', handleMouseMove);
        canvas.addEventListener('mouseup', handleMouseUp);
        canvas.addEventListener('contextmenu', handleContextMenu);
        document.addEventListener('click', hideContextMenu);
        
        function handleContextMenu(e) {
            e.preventDefault();
            
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
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
                
                showContextMenu(e.clientX, e.clientY);
                draw();
            }
        }
        
        function showContextMenu(x, y) {
            contextMenu = document.getElementById('contextMenu');
            contextMenu.style.display = 'block';
            contextMenu.style.left = x + 'px';
            contextMenu.style.top = y + 'px';
        }
        
        function hideContextMenu() {
            if (contextMenu) {
                contextMenu.style.display = 'none';
            }
        }
        
        function handleMouseDown(e) {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            // Hide context menu if visible
            hideContextMenu();
            
            if (e.button === 0) { // Left click
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
                    // Start drawing new rectangle
                    isDrawing = true;
                    startPoint = { x, y };
                    dragStartX = x;
                    dragStartY = y;
                    selectedRect = null;
                }
            } else if (e.button === 2) { // Right click - only for creating connections, not context menu
                // Only allow connection creation if not right-clicking on existing elements
                const clickedRect = rectangles.find(r => r.contains(x, y));
                const clickedConnection = connections.find(c => c.isNearConnection(x, y));
                
                if (clickedRect && !clickedConnection) {
                    isConnecting = true;
                    startPoint = {
                        rect: clickedRect,
                        x: clickedRect.x + clickedRect.width, // Right edge
                        y: clickedRect.y + clickedRect.height / 2 // Middle of right edge
                    };
                }
            }
            
            draw();
        }
        
        function handleMouseMove(e) {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            // Update cursor based on what's under the mouse
            if (selectedRect && !isDragging && !isResizing && !isDrawing && !isConnecting) {
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
                currentRect = {
                    x: Math.min(startPoint.x, x),
                    y: Math.min(startPoint.y, y),
                    width: Math.abs(x - startPoint.x),
                    height: Math.abs(y - startPoint.y)
                };
                draw();
            } else if (isDragging && selectedRect) {
                // Move the rectangle
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
                
                ctx.setLineDash([5, 5]);
                ctx.strokeStyle = '#ff6b6b';
                ctx.lineWidth = 2;
                drawCurvedConnection(startPoint.x, startPoint.y, endX, endY);
                ctx.setLineDash([]);
                
                // Draw temporary dots
                drawConnectionDot(startPoint.x, startPoint.y);
                if (targetRect) {
                    drawConnectionDot(endX, endY);
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
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            if (isDrawing && currentRect && currentRect.width > 5 && currentRect.height > 5) {
                const newRect = new Rectangle(
                    currentRect.x,
                    currentRect.y,
                    currentRect.width,
                    currentRect.height
                );
                rectangles.push(newRect);
            }
            
            if (isConnecting && startPoint) {
                const targetRect = rectangles.find(r => r.contains(x, y) && r !== startPoint.rect);
                if (targetRect) {
                    // Create connection with edge snapping
                    const endPoint = {
                        x: targetRect.x, // Left edge
                        y: targetRect.y + targetRect.height / 2 // Middle of left edge
                    };
                    
                    const connection = new Connection(
                        startPoint.rect,
                        startPoint,
                        targetRect,
                        endPoint
                    );
                    connections.push(connection);
                }
            }
            
            isDrawing = false;
            isConnecting = false;
            isDragging = false;
            isResizing = false;
            startPoint = null;
            currentRect = null;
            resizeHandle = null;
            canvas.style.cursor = 'crosshair';
            draw();
        }
        
        function draw() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Draw connections
            connections.forEach(conn => {
                const points = conn.getConnectionPoints();
                const fromPoint = points.from;
                const toPoint = points.to;
                
                if (conn.selected) {
                    ctx.strokeStyle = '#ff6b6b';
                    ctx.lineWidth = 3;
                } else {
                    ctx.strokeStyle = '#4ecdc4';
                    ctx.lineWidth = 2;
                }
                
                // Draw curved line using bezier curve
                drawCurvedConnection(fromPoint.x, fromPoint.y, toPoint.x, toPoint.y);
                
                // Draw dots at both ends
                drawConnectionDot(fromPoint.x, fromPoint.y, conn.selected);
                drawConnectionDot(toPoint.x, toPoint.y, conn.selected);
            });
            
            // Draw rectangles
            rectangles.forEach(rectangle => {
                if (rectangle.selected) {
                    ctx.fillStyle = 'rgba(100, 150, 255, 0.3)';
                    ctx.strokeStyle = '#6496ff';
                    ctx.lineWidth = 2;
                } else {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 1;
                }
                
                ctx.fillRect(rectangle.x, rectangle.y, rectangle.width, rectangle.height);
                ctx.strokeRect(rectangle.x, rectangle.y, rectangle.width, rectangle.height);
                
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
                ctx.lineWidth = 2;
                ctx.setLineDash([5, 5]);
                ctx.strokeRect(currentRect.x, currentRect.y, currentRect.width, currentRect.height);
                ctx.setLineDash([]);
            }
        }
        
        function drawCurvedConnection(fromX, fromY, toX, toY) {
            const distance = Math.abs(toX - fromX);
            const curveOffset = Math.min(distance * 0.5, 80); // Control how much the curve bends
            
            ctx.beginPath();
            ctx.moveTo(fromX, fromY);
            
            // Create a smooth curve using bezier curve
            // Control points are offset horizontally to create a nice S-curve
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
            
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, 2 * Math.PI);
            ctx.fill();
            
            // Add a white border for better visibility
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, 2 * Math.PI);
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
            const handleSize = 8;
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
            ctx.lineWidth = 1;
            
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
            draw();
        }
        
        function deleteSelected() {
            if (selectedRect) {
                // Remove the rectangle and all its connections
                const rectId = selectedRect.id;
                rectangles = rectangles.filter(r => r.id !== rectId);
                connections = connections.filter(c => c.fromRect.id !== rectId && c.toRect.id !== rectId);
                selectedRect = null;
            } else if (selectedConnection) {
                // Remove the connection
                const connId = selectedConnection.id;
                connections = connections.filter(c => c.id !== connId);
                selectedConnection = null;
            }
            
            hideContextMenu();
            draw();
        }
        
        function saveDrawing() {
            const data = {
                rectangles: rectangles.map(r => ({
                    x: r.x,
                    y: r.y,
                    width: r.width,
                    height: r.height,
                    id: r.id
                })),
                connections: connections.map(c => ({
                    fromRectId: c.fromRect.id,
                    toRectId: c.toRect.id,
                    id: c.id
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
                        const rect = new Rectangle(rectData.x, rectData.y, rectData.width, rectData.height);
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
                            
                            const connection = new Connection(fromRect, fromPoint, toRect, toPoint);
                            connection.id = connData.id;
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