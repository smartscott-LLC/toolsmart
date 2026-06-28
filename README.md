# Sirens — Mermaid Studio  A smartscott.com ToolSmart Application

> **A local-first, installable Progressive Web App for creating and managing Mermaid diagrams professionally.**

Sirens is part of the **ToolSmart** suite — a collection of uniquely designed tools that help anyone develop like a pro. No account required, no data ever leaves your device.

---

## Table of Contents

- [Features](#features)
- [Live Demo / Install](#live-demo--install)
- [Getting Started](#getting-started)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Supported Diagram Types](#supported-diagram-types)
- [Architecture Overview](#architecture-overview)
- [Browser Compatibility](#browser-compatibility)
- [Privacy Model](#privacy-model)
- [Contributing](#contributing)
- [License](#license)

---

## Features

### Editor (Scripting Bay)
- **Mermaid-aware syntax highlighting** — custom CodeMirror 5 mode with token colours for diagram types, keywords, arrows, node IDs, and quoted strings
- **Inline autocomplete** — ghost-text hints appear as you type; press `Ctrl+Space` for an explicit list
- **Error gutter** — parse errors appear as red markers in the line-number gutter with hover tooltips; the offending line is highlighted
- **Multi-cursor editing** — `Ctrl+D` selects the next occurrence of the current selection; `Alt+Click` adds cursors (CodeMirror built-in)
- **Comment toggle** — `Ctrl+/` toggles `%% ` Mermaid comments on the selected lines
- **Undo / Redo** — `Ctrl+Z` / `Ctrl+Y` (or `Ctrl+Shift+Z`) — works from anywhere in the UI
- **Debounced live preview** — diagram re-renders automatically 400 ms after you stop typing

### Preview (Living Canvas)
- **Kinetic pan** — click-and-drag with momentum/inertia after release
- **Pinch-to-zoom** on touch devices; scroll-wheel zoom on desktop (zooms towards the pointer)
- **Click-to-locate** — click any diagram node to jump to its source line in the editor
- **Zoom controls** — ±15% steps, reset to 100%, and fit-to-panel
- **Export** — SVG (vector), PNG (3× retina-quality raster), or `.mmd` raw source

### Canvas Edit Mode
- Toggle with the **✏️ Edit** button in the preview toolbar to enter full canvas edit mode
- **Click** any node to select it (orange highlight ring appears)
- **Double-click** or press **F2** to rename a node inline — a floating input appears over the node
- **Right-click** for a context menu: Rename / Connect to… / Delete
- **Canvas Edit Toolbar** — Add Node, Connect, Rename, Shape picker (9 shapes), Delete
- **Add Node modal** — set label, choose shape, optionally auto-connect from the currently selected node
- **Connect mode** — click source → click target → optional edge label prompt
- **Del key** (when body is focused) deletes the selected node and all its edges
- **Shape change** — pick a new shape from the toolbar dropdown; source is patched instantly
- All edits patch the Mermaid source text and trigger a live re-render — the editor always stays in sync

### SmartBar (Command Palette — `⌘K` / `Ctrl+K`)
- **Recent Files** shown at the top — open any of the last 5 diagrams with a single keystroke
- Fuzzy search across recent files, all actions, and 13 built-in diagram snippets
- Keyboard-navigable (`↑↓` + `Enter`) with mouse fallback
- Actions: New diagram, Save, Open Vault, Export (SVG/PNG/mmd), Zoom, Reset, Style Studio

### Template Library
- Collapsible accordion in the Styling Studio sidebar with 13 diagram categories and 25+ preset cards
- **Click** any card to insert it — if the editor already has content, a choice modal appears:
  - **Append** — merges the preset's nodes into the current graph (same-type graphs only)
  - **Replace** — replaces the entire diagram with the preset
  - **Cancel** — does nothing; your work is safe
- **Drag-and-drop** preset cards onto the editor panel to insert without leaving the canvas

### Vault (OPFS Local Storage)
- Diagrams saved to the browser's **Origin Private File System** — completely private, no server involved
- File list with last-modified dates and sizes
- One-click open, **inline rename** (click Rename → type new name → Enter), and delete
- Auto-restores the last opened file on launch
- Configurable soft allocation cap (100 MB – 2 GB slider)
- Storage usage bar and quota display

### Styling Studio
- **4 app themes**: Corporate (default), Sketch, Midnight, High Contrast
- **5 Mermaid diagram themes**: Base (brand), Default, Dark, Forest, Neutral
- **CSS Injector** — paste any custom CSS to override Bulma or diagram styles live

### PWA & Offline
- Fully installable as a desktop or mobile app
- Service worker caches the entire app shell for true offline use
- All vendor libraries (Bulma, CodeMirror, Mermaid) are vendored locally — no CDN dependency at runtime
- **Drag-and-drop import** — drop a `.mmd` or `.txt` file from the desktop onto the app to open it instantly

---

## Live Demo / Install

Open Sirens in a supported browser and click **"Install App"** in the banner, or use your browser's built-in install option from the address bar. Once installed it runs offline.

> **Browser requirement:** Chrome 86+, Edge 86+, or any Chromium-based browser.  
> Firefox and Safari do not support the Origin Private File System API required by the Vault.

---

## Getting Started

Sirens is a static web app — no build step, no bundler, no Node.js required.

### Run locally

```bash
# Clone the repository
git clone https://github.com/smartscott-LLC/toolsmart.git
cd toolsmart

# Serve with any static file server, e.g.:
npx serve .
# or
python3 -m http.server 8080
# or
npx http-server . -p 8080
```

Then open `http://localhost:8080` in Chrome or Edge.

> **Why a server?** Service workers and OPFS require a secure context (`https://` or `localhost`). Opening `index.html` directly via `file://` will disable both features.

### File structure

```
toolsmart/
├── index.html          — App shell, all modals and overlays
├── manifest.json       — PWA manifest
├── sw.js               — Service worker (cache-first app shell)
├── css/
│   └── app.css         — All custom styles and CSS variables
├── js/
│   ├── app.js          — Boot, orchestration, UI wiring
│   ├── editor.js       — CodeMirror initialisation, syntax mode, autocomplete
│   ├── preview.js      — Mermaid renderer, zoom/pan, export helpers
│   ├── smartbar.js     — Command palette (Cmd+K)
│   ├── snippets.js     — 13 built-in Mermaid diagram templates (data only)
│   ├── presets.js      — Template Library accordion UI (Styling Studio sidebar)
│   ├── canvas-edit.js  — Interactive canvas editing: select, rename, connect, delete
│   ├── themes.js       — App and Mermaid theme management
│   └── vault.js        — OPFS file system adapter
├── icons/
│   ├── icon.svg        — Primary app icon
│   ├── icon-192.png    — PWA icon 192×192
│   └── icon-512.png    — PWA icon 512×512
└── vendor/
    ├── bulma/          — Bulma CSS (offline copy)
    ├── codemirror/     — CodeMirror 5 core + addons (offline copy)
    └── mermaid/        — Mermaid 10 UMD build (offline copy)
```

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `⌘K` / `Ctrl+K` | Open SmartBar command palette |
| `⌘S` / `Ctrl+S` | Save current diagram to Vault |
| `⌘N` / `Ctrl+N` | New diagram |
| `⌘E` / `Ctrl+E` | Open Export dialog |
| `Ctrl+Z` | Undo last edit |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo last undone edit |
| `Escape` | Close SmartBar / Vault / Export / modal |
| `Ctrl+Space` | Trigger Mermaid autocomplete |
| `Ctrl+D` | Select next occurrence of selection (multi-cursor) |
| `Ctrl+/` | Toggle `%%` comment on selected lines |
| `Alt+Click` | Add cursor at click position |
| `←` / `→` *(on resize handle)* | Adjust editor/preview split (20 px steps) |
| `Shift+←` / `Shift+→` *(on resize handle)* | Adjust split in 80 px steps |
| Drag `.mmd` file onto window | Open the file in the editor |
| `Enter` *(in Vault rename input)* | Commit rename |
| `Escape` *(in Vault rename input)* | Cancel rename |
| **Canvas Edit mode** | |
| Double-click node | Rename node inline |
| Right-click node | Open context menu (Rename / Connect / Delete) |
| `F2` *(node selected)* | Rename selected node |
| `Del` / `Backspace` *(body focused, node selected)* | Delete selected node |

---

## Supported Diagram Types

| Template | Mermaid keyword |
|---|---|
| Flowchart (Top-Down) | `graph TD` |
| Flowchart (Left-Right) | `graph LR` |
| Sequence Diagram | `sequenceDiagram` |
| Class Diagram | `classDiagram` |
| State Diagram | `stateDiagram-v2` |
| Gantt Chart | `gantt` |
| ER Diagram | `erDiagram` |
| Pie Chart | `pie` |
| C4 Context Diagram | `C4Context` |
| Mindmap | `mindmap` |
| Timeline | `timeline` |
| Git Graph | `gitGraph` |
| XY Chart (Bar + Line) | `xychart-beta` |

All 13 templates are accessible from the SmartBar (`⌘K`) under **Snippets**.

---

## Architecture Overview

Sirens is a **zero-build, ES-module PWA**. There is no bundler, transpiler, or framework — just plain JavaScript modules loaded natively by the browser.

```
index.html
  └── <script type="module"> → js/app.js   (entry point, ES module)
        ├── js/editor.js       (CodeMirror wrapper + Mermaid syntax mode)
        ├── js/preview.js      (Mermaid renderer + zoom/pan/export)
        ├── js/smartbar.js     (Cmd+K palette)
        ├── js/snippets.js     (diagram template data)
        ├── js/presets.js      (Template Library accordion UI)
        ├── js/canvas-edit.js  (interactive canvas editing + source patching)
        ├── js/themes.js       (app + Mermaid theme management)
        └── js/vault.js        (OPFS file adapter)
```

**State management** is intentional simple: a single `state` object in `app.js` tracks `currentFile`, `isDirty`, and `vaultAvailable`. There is no reactive framework — UI is updated by direct DOM manipulation in response to user events.

**Persistence strategy:**

| Data | Storage |
|---|---|
| Diagram files | OPFS (`navigator.storage.getDirectory()`) |
| Current session content | `localStorage` (key: `sirens-editor-content`) |
| Last opened file name | `localStorage` (key: `sirens-last-file`) |
| App theme preference | `localStorage` (key: `sirens-app-theme`) |
| Mermaid theme preference | `localStorage` (key: `sirens-mermaid-theme`) |
| Custom CSS | `localStorage` (key: `sirens-custom-css`) |
| Vault allocation cap | `localStorage` (key: `sirens-vault-allocation-mb`) |

**Offline strategy:** The service worker (`sw.js`) uses a cache-first strategy for all same-origin app shell resources. CDN resources (if any) use a network-first strategy with a cache fallback.

---

## Browser Compatibility

| Feature | Chrome 86+ | Edge 86+ | Firefox | Safari |
|---|---|---|---|---|
| App renders & edits | ✅ | ✅ | ✅ | ✅ |
| PWA install | ✅ | ✅ | ❌ | ⚠️ partial |
| OPFS Vault (save/load) | ✅ | ✅ | ❌ | ❌ |
| Offline use (SW) | ✅ | ✅ | ✅ | ✅ |
| Pinch-to-zoom | ✅ | ✅ | ✅ | ✅ |

Firefox and Safari users can still create, edit, and export diagrams but cannot use the Vault (OPFS is unavailable). The app detects this and shows an appropriate message.

---

## Privacy Model

- **All diagram data lives exclusively in your browser.** Nothing is sent to any server.
- OPFS storage is sandboxed per origin — other websites cannot access it.
- The only external network request made by the app is loading the **Inter** and **JetBrains Mono** fonts from Google Fonts (optional; the app falls back to `system-ui` and `monospace` when offline).
- No analytics, no telemetry, no cookies.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on reporting bugs, submitting pull requests, and the code style expected in this project.

---

## License

This project is part of the **ToolSmart** suite by [smartscott-LLC](https://github.com/smartscott-LLC).  
All rights reserved unless otherwise stated.
