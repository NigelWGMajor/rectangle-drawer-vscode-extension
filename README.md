# Pix for VS Code

A professional diagram creation extension for Visual Studio Code that allows you to draw rectangles, connect them with labeled lines, and create interactive flowcharts and diagrams.

## Features

### 🎨 **Drawing Tools**
- **Draw Rectangles**: Click and drag to create rectangles
- **Draw Frames**: ctrl+c;lick to draw frames around groups
- **Connect Elements**: Create labeled connections between rectangles
- **Move & Resize**: Drag rectangles to reposition, use handles to resize
- **Smart Grid Snapping**: All elements snap to a 10px grid for perfect alignment

### 🎯 **Interactive Elements**
- **Editable Labels**: Double-click rectangles and connections to add/edit labels
- **Color Customization**: Choose from 13 preset colors for rectangles and connections
- **Line Styles**: Multiple line styles including solid, dashed, dotted, and thick variations
- **Property Dialogs**: Right-click elements to edit detailed properties

### 💾 **Data Management**
- **Save/Load**: Persistent storage with JSON format
- **Export HTML**: Export your diagrams as standalone HTML files
- **Auto-sync**: Seamless data transfer between sidebar and panel views

### 🖼️ **Flexible Views**
- **Sidebar View**: Integrated into VS Code's activity bar for quick access
- **Panel View**: Full-screen panel for detailed work
- **Smooth Transitions**: Switch between views while preserving your work

### 🎪 **Advanced Features**
- **Pan & Zoom**: Mouse wheel zoom, middle-click drag to pan
- **Context Menus**: Right-click for element-specific options
- **Smart Contrast**: Automatic text contrast for optimal readability
- **Professional Icons**: Modern Font Awesome icon set
- **Tooltips**: Helpful hover information for all tools

## Installation

1. Download the `.vsix` file from the releases
2. Open VS Code
3. Press `Ctrl+Shift+P` and type "Extensions: Install from VSIX"
4. Select the downloaded `.vsix` file
5. Reload VS Code

## Usage

### Getting Started
1. Open the Command Palette (`Ctrl+Shift+P`)
2. Type "Pix" and select "Open in Panel" or look for the Pix icon in the activity bar

### Basic Operations
- **Create Rectangle**: Click and drag on the canvas
- **Move Rectangle**: Drag the rectangle body
- **Resize**: Drag the corner handles (white squares)
- **Connect Rectangles**: Right-click first rectangle → "Start Connection" → Right-click target → "End Connection"
- **Edit Names**: Double-click rectangles to edit labels
- **Edit Properties**: Right-click for detailed property dialogs

### Navigation
- **Zoom**: Mouse wheel
- **Pan**: Hold Shift and drag, or middle-click and drag
- **Reset View**: Click the home icon in the toolbar

## Toolbar Icons

| Icon | Function | Description |
|------|----------|-------------|
| 📂 | Load | Load a saved drawing |
| 💾 | Save | Save current drawing |
| 🗑️ | Clear | Clear all elements |
| 🏠 | Reset View | Reset zoom and pan |
| 🗔 | Panel/Sidebar | Switch between views |
| 📤 | Export | Export as HTML |
| ❓ | Help | Show help dialog |

## File Format

Drawings are saved in `.pix.json` format with the following structure:
- Rectangle data (position, size, colors, labels)
- Connection data (endpoints, styles, labels)
- Portable and readable JSON format

## Requirements

- Visual Studio Code 1.74.0 or higher
- No additional dependencies required

## Development

### Building from Source

```bash
npm install
npm run compile
```

### Creating VSIX Package

```bash
npm run package
```

### Running in Development

1. Open this project in VS Code
2. Press `F5` to open Extension Development Host
3. Test the extension in the new window

## Contributing

This is an open-source project. Contributions are welcome!

## License

MIT License - see LICENSE file for details

## Changelog

### 1.0.0
- Initial release
- Complete drawing functionality
- Sidebar and panel views
- Save/load capabilities
- HTML export
- Professional UI with Font Awesome icons
- Comprehensive help system

---

**Enjoy creating professional diagrams directly in VS Code! 🎨**