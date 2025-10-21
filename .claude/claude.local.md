# Pix Extension - Current State Analysis

## Overview
**Pix** is a VS Code extension that provides a professional diagram creation tool for drawing rectangles, connecting them with labeled lines, and creating interactive flowcharts and diagrams. The extension supports `.pix.json` files as a custom document type.

## Project Structure

```
src/
├── extension.ts              (~55 lines)
├── pixEditorProvider.ts      (~343 lines)
└── drawingViewProvider.ts    (~4928 lines) ⚠️ MASSIVE FILE
```

### Current Architecture

#### 1. **extension.ts** (Entry Point)
- Activates the extension
- Registers the `PixEditorProvider` for custom text editing
- Registers `DrawingViewProvider` for sidebar webview
- Registers three commands:
  - `pix.openDrawingView` - Opens panel view
  - `pix.openInSidebar` - Shows in sidebar
  - `pix.openDevTools` - Opens dev tools for debugging

#### 2. **pixEditorProvider.ts** (Custom Text Editor)
**Purpose**: Provides custom editor for `.pix.json` files opened directly from explorer

**Key Responsibilities**:
- Implements `vscode.CustomTextEditorProvider`
- Manages document lifecycle (open, edit, save)
- Handles status bar display for pix files
- Synchronizes webview state with text document
- Tracks active editors via `activeEditors` Set
- Provides export functionality (HTML, SVG)
- Manages bi-directional data flow:
  - Document changes → Webview updates
  - Webview changes → Document updates (marks dirty)
  - Save button → Document save

**Message Handlers**:
- `saveDrawing` - Triggers document save
- `dataChanged` - Updates document (marks dirty)
- `exportToHTML` - Exports to HTML file
- `exportToSVG` - Exports to SVG file
- `copyToClipboard` - Copies payload to clipboard
- `openInSidebar` - Transfers to sidebar view
- `loadDrawing` - Shows info message (not needed for custom editor)

**Key Methods**:
- `resolveCustomTextEditor()` - Main lifecycle method
- `updateTextDocument()` - Updates VSCode document with JSON data
- `exportToHTML()` / `exportToSVG()` - Export functions
- `getHtmlForWebview()` - Delegates to DrawingViewProvider (code smell ⚠️)

**Issues Identified**:
- ⚠️ Accesses private method `_getHtmlForWebview` from DrawingViewProvider (line 286)
- Tight coupling to DrawingViewProvider
- No shared HTML generation abstraction

#### 3. **drawingViewProvider.ts** (⚠️ MONOLITHIC FILE - 4928 lines)
**Purpose**: Provides webview for sidebar and panel views

**Contains Multiple Responsibilities** (Violation of Single Responsibility Principle):

##### A. View Provider Logic (~275 lines)
- Implements `vscode.WebviewViewProvider`
- Manages sidebar and panel webview instances
- Handles view lifecycle and state management
- Static shared state:
  - `currentPanel` - Panel webview instance
  - `currentData` - Shared drawing data
  - `sidebarInstance` - Sidebar webview instance
  - `currentFilePath` - Current file path
  - `lastSaveLocation` / `lastLoadLocation` - File location memory

**Static Methods**:
- `refreshSidebarWithData()` - Updates sidebar with data
- `updateSidebarTitle()` / `updatePanelTitle()` - Title management
- `createOrShow()` - Creates or reveals panel

##### B. File Operations (~180 lines estimated)
- `_saveDrawing()` - Save to file with dialog
- `_loadDrawing()` - Load from file with dialog
- `_exportToHTML()` - Export to HTML file
- `_exportToSVG()` - Export to SVG file
- Manages file location memory

##### C. HTML Generation (~4000+ lines) ⚠️ MASSIVE
- `_getHtmlForWebview()` - Generates complete HTML
- Contains entire application UI inline:
  - Toolbar HTML
  - Canvas setup
  - JavaScript application code
  - CSS styles
  - Event handlers
  - Drawing logic
  - Data models (Rectangle, Connection classes)
  - Grid rendering
  - Bezier curve calculations
  - Context menus
  - Dialogs
  - Color pickers
  - Help system

##### D. SVG Export Logic (~500+ lines estimated)
- `_generateSVG()` - Generates SVG export
- Complex SVG generation with:
  - Rectangle rendering
  - Connection rendering
  - Bezier curve calculations
  - Label positioning
  - Color handling

**Message Handlers** (Duplicated in two places):
- `saveDrawing`
- `loadDrawing`
- `exportToHTML`
- `exportToSVG`
- `copyToClipboard`
- `dataChanged`
- `openInPanel` (sidebar only)
- `openInSidebar` (panel only)
- `clearTitles`

## Data Model

### Drawing Data Structure
```typescript
{
  version: string,
  created: string (ISO date),
  rectangles: Rectangle[],
  connections: Connection[]
}
```

### Rectangle Class (in webview)
```typescript
class Rectangle {
  x, y, width, height,
  name, description, payload,
  color, type ('regular' | 'frame')
}
```

### Connection Class (in webview)
```typescript
class Connection {
  fromRect, fromPoint,
  toRect, toPoint,
  label, description, payload,
  color, lineStyle
}
```

## UI Features (in webview)
- Canvas-based drawing with pan/zoom
- Rectangle creation (click-drag)
- Frame creation (Ctrl+click-drag)
- Connection creation (right-drag)
- Inline text editing (double-click)
- Context menus (right-click)
- Property dialogs
- Color pickers
- Grid snapping (10px)
- Toolbar with icons
- Tooltips
- Help dialog
- Filename display

## Problems & Code Smells Identified

### 1. ⚠️ **Massive Monolithic File**
- `drawingViewProvider.ts` is 4928 lines
- Contains HTML, CSS, JavaScript, TypeScript all mixed
- Violates separation of concerns
- Difficult to maintain and test

### 2. ⚠️ **No Code Reuse**
- HTML generation duplicated (SVG export has similar logic)
- Message handlers duplicated between sidebar and panel
- No shared abstractions

### 3. ⚠️ **Tight Coupling**
- `pixEditorProvider` accesses private method of `drawingViewProvider`
- HTML generation not abstracted

### 4. ⚠️ **Inline Everything**
- All webview code inline in template literals
- No separate HTML/CSS/JS files
- No build process for webview assets

### 5. ⚠️ **State Management Issues**
- Static shared state in DrawingViewProvider
- No clear state management pattern
- Data synchronized via postMessage and timeouts

### 6. ⚠️ **Code Duplication**
- Message handler logic duplicated
- Export logic similar in multiple places
- SVG generation duplicates drawing logic

### 7. ⚠️ **No Type Safety in Webview**
- JavaScript classes in template literals
- No TypeScript compilation for webview code
- Message types not strongly typed

## Refactoring Opportunities

### Phase 1: Extract Abstractions (Preparation)
1. **Extract HTML Generator**
   - Create `WebviewHtmlGenerator` class
   - Move HTML generation logic out of provider
   - Make it reusable by both providers

2. **Extract File Operations**
   - Create `FileOperations` service
   - Handle save/load/export logic
   - Manage file location memory

3. **Extract Message Protocol**
   - Define message types interface
   - Create `MessageHandler` abstraction
   - Remove duplication

4. **Extract Webview Assets** (if desired)
   - Move HTML to separate file
   - Move CSS to separate file
   - Move JavaScript to separate file (or keep inline for now)
   - Add build step (optional)

### Phase 2: Refactor to Use Abstractions
1. Refactor `DrawingViewProvider` to use new abstractions
2. Refactor `PixEditorProvider` to use new abstractions
3. Remove code duplication
4. Clean up static state management

### Phase 3: Further Modularization (Future)
1. Split webview JavaScript into modules
2. Create separate SVG/HTML export modules
3. Improve state management
4. Add proper TypeScript for webview code

## File Size Breakdown (Estimated)
- Total lines: ~5,326
- Actual TypeScript logic: ~600 lines
- HTML/CSS/JavaScript inline: ~4,700 lines
- Ratio: 88% is webview content, 12% is extension logic

## Key Dependencies
- VS Code Extension API (`vscode` module)
- No external npm dependencies for functionality
- Uses VS Code webview API for UI
- Font Awesome icons loaded from CDN in webview

## Configuration
- File extension: `.pix.json`
- Language ID: `pix`
- Custom editor view type: `pix.pixEditor`
- Webview view type: `rectangleDrawerView`
- Activity bar view: `pixView`

## Current Workflow
1. User opens `.pix.json` file → `PixEditorProvider` activates
2. User clicks sidebar icon → `DrawingViewProvider.resolveWebviewView()` activates
3. User runs command → `DrawingViewProvider.createOrShow()` creates panel
4. Drawing changes → `dataChanged` message → Updates shared state
5. Save button → Different behavior based on context:
   - Custom editor: Updates document + saves
   - Sidebar/Panel: Shows save dialog

## Refactoring Strategy Recommendation

**Priority**: Start with **extraction** to create abstractions without changing functionality.

**Goals**:
1. Reduce `drawingViewProvider.ts` from 4928 lines to ~300 lines
2. Create clear separation of concerns
3. Enable code reuse
4. Maintain existing functionality
5. Prepare for future enhancements

**Approach**:
- Extract first, refactor second
- Create abstractions alongside existing code
- Gradually migrate to new abstractions
- Remove old code once migration complete
