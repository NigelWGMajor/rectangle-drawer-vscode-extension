# Rectangle Drawer VS Code Extension

A VS Code extension that allows you to draw rectangles and connect them using mouse interactions.

## Features

- **Draw Rectangles**: Left-click and drag to create rectangles
- **Connect Rectangles**: Right-click and drag to connect rectangles with arrows
- **Select Rectangles**: Click on rectangles to select them and see connection points
- **Save/Load**: Save and load your drawings
- **Clear Canvas**: Clear all rectangles and connections

## How to Use

1. Open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`)
2. Type "Open Rectangle Drawer" and select the command
3. A webview will open with the drawing canvas

### Mouse Controls

- **Left-click and drag**: Create a new rectangle
- **Right-click and drag**: Create a connection between rectangles
  - Right-click on a rectangle to start the connection
  - Drag to another rectangle to complete the connection
- **Left-click on rectangle**: Select a rectangle to see its connection points

### Buttons

- **Clear All**: Remove all rectangles and connections
- **Save**: Save the current drawing (currently logs to console)
- **Load**: Load a saved drawing

## Development

### Running the Extension

1. Open this project in VS Code
2. Press `F5` to open a new Extension Development Host window
3. In the new window, open the Command Palette and run "Open Rectangle Drawer"

### Building

```bash
npm install
npm run compile
```

### File Structure

```
├── src/
│   ├── extension.ts           # Main extension entry point
│   └── drawingViewProvider.ts # Webview provider with drawing logic
├── .vscode/
│   ├── launch.json           # Debug configuration
│   └── tasks.json           # Build tasks
├── package.json             # Extension manifest
├── tsconfig.json           # TypeScript configuration
└── README.md              # This file
```

## Technical Details

The extension uses:
- **VS Code Webview API** for the drawing interface
- **HTML5 Canvas** for rendering rectangles and connections
- **TypeScript** for type-safe development
- **CSS Custom Properties** for VS Code theme integration

The drawing canvas supports:
- Rectangle creation with mouse drag
- Connection points on rectangle edges (top, bottom, left, right)
- Visual feedback for selections and connections
- Proper event handling for left and right mouse buttons

## Future Enhancements

- Persistent storage of drawings
- Export to various formats (PNG, SVG, JSON)
- Multiple canvas support
- Undo/redo functionality
- Rectangle labeling
- Connection styling options
- Grid snap functionality