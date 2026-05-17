# Sirens — Architecture Reference

This document describes the internal architecture of the Sirens PWA in detail. It is intended for contributors who want to understand how the pieces fit together before making changes.

---

## Overview

Sirens is a **zero-build, ES-module Progressive Web App**. There is no bundler, no transpiler, and no framework. The entry point is `index.html`, which bootstraps the application with a single `<script type="module">` tag that dynamically imports `js/app.js`.

```
Browser
  └── index.html
        ├── <script> CodeMirror 5 (UMD global)
        ├── <script> CodeMirror addons (UMD globals)
        ├── <script> Mermaid 10 (UMD global, exposes window.mermaid)
        └── <script type="module">
              └── import('./js/app.js')   ← ES module entry point
                    ├── import './editor.js'
                    ├── import './preview.js'
                    ├── import './smartbar.js'
                    │     └── import './snippets.js'
                    ├── import './themes.js'
                    ├── import './vault.js'
                    ├── import './presets.js'
                    │     └── import './snippets.js'
                    └── import './canvas-edit.js'
```

> CodeMirror and Mermaid are loaded as classic UMD scripts (they predate ESM and expose globals). The app modules are ES modules that reference these globals (`window.CodeMirror`, `window.mermaid`) rather than importing them.

---

## Module Responsibilities

### `js/app.js` — Orchestrator

The top-level module. Responsible for:

- Calling each module's `init*` function in the correct order during `boot()`
- Wiring DOM events (navbar buttons, keyboard shortcuts, modal overlays)
- Managing top-level app state (`state.currentFile`, `state.isDirty`, `state.vaultAvailable`)
- Handling the editor↔preview data flow (`handleEditorChange`)
- SmartBar action dispatch (`handleSmartBarAction`)
- Snippet/preset insertion logic (append vs. replace via Insert Choice modal)

**Boot sequence** (`boot()`)

```
 1. registerServiceWorker()
 2. initMermaid('base')           — configure Mermaid before first render
 3. restoreThemeSettings()        — apply saved theme; may trigger re-render
 4. initVault()                   — open OPFS root handle
 5. initEditor()                  — mount CodeMirror; load last session content
 6. initPreviewPanel()            — bind viewport/canvas, set up zoom/pan
 7. initCanvasEditPanel()         — wire canvas-edit toolbar, add-node modal, callbacks
 8. initInsertChoiceModal()       — wire Append / Replace / Cancel insert-choice modal
 9. initSmartBarPanel()           — wire SmartBar overlay
10. initStyleSidebar()            — build theme cards and Mermaid select
11. initPresetsPanel()            — build accordion Template Library in sidebar
12. initExportModal()             — wire export card clicks and download button
13. initResizeHandle()            — drag-to-resize + keyboard accessibility
14. initNavbarButtons()           — wire all navbar button clicks and modals
15. initKeyboardShortcuts()       — global keydown handler
16. initPwaInstall()              — capture beforeinstallprompt
17. initDragDrop()                — drag-and-drop .mmd / .txt file import
18. syncStyleSidebarState()       — set active cards/selects from restored settings
19. openDiagramFromVault(lastFile) — restore last session file (if any)
20. renderDiagram(initialContent) — first render
21. URL action dispatch           — handle ?action=new from PWA shortcut
```

### `js/editor.js` — CodeMirror Wrapper

- Defines the custom `mermaid` CodeMirror Simple Mode with token rules for: comments, diagram-type declarations, arrows, node shapes, quoted strings, keywords, node IDs, numbers
- Provides `getMermaidHints()` for Ctrl+Space autocomplete and keyup ghost-text hints
- Exports `createEditor(container, options)` — returns `{ cm, setErrors, setValue, getValue, goToLine, undo, redo }`
- Exports `detectDiagramType(source)` — returns a human-readable type label from the first line

**Key design decisions:**
- Ghost text completions appear 200 ms after the user stops typing. They use the same `getMermaidHints` function as explicit Ctrl+Space to avoid duplication.
- Error markers are 0-based internally (CodeMirror) but the `setErrors` API accepts 1-based line numbers (as reported by Mermaid).

### `js/preview.js` — Renderer + Interaction

- Wraps `window.mermaid.render()` in `renderDiagram(source, { onError, onSuccess })`
- Manages a module-level `_state` object for zoom, pan, and kinetic velocity
- **SVG insertion**: the raw SVG string from `mermaid.render()` is parsed via `DOMParser` (`text/html`) and inserted into the canvas using `document.importNode` + `replaceChildren`. This ensures `<foreignObject>` HTML labels render correctly and avoids any `innerHTML` assignment with renderer output.
- **`_lastSvg`**: set to `XMLSerializer.serializeToString()` of the live SVG DOM element (not the raw mermaid string), so export functions always work from a clean serialisation.
- **Kinetic pan**: on pointer-up, `_startKinetic()` uses `requestAnimationFrame` with a friction constant (`KINETIC_FRICTION = 0.88`) to decay velocity over time
- **Zoom-to-pointer**: wheel events compute the mouse offset relative to the viewport centre and adjust pan to keep the diagram point under the cursor fixed
- **Touch**: single-touch panning and two-finger pinch-to-zoom via `touchstart/move/end`
- **Click-to-locate**: `_buildNodeLineMap(source)` parses the Mermaid source with regex to produce `{ nodeId → lineNumber }` and attaches `click` handlers to SVG node elements
- **Export**: SVG is serialised to a Blob; PNG uses an `<img>` → `<canvas>` pipeline at 3× device scale

### `js/canvas-edit.js` — Interactive Canvas Editor

- Toggled on/off via `toggleCanvasEdit()` — activates by adding `canvas-edit-active` class to the viewport
- **Node selection**: single click on any node element highlights it with the `.canvas-edit-selected` ring; calls `onNodeSelect` callback
- **Inline rename**: double-click or F2 / Rename button opens a floating `<input>` positioned over the node; commits on Enter/blur, cancels on Escape; calls `onLabelChange` callback
- **Right-click context menu**: Rename / Connect to… / Delete built with `document.createElement`; positions itself and clamps to viewport
- **Connect mode**: activated via `startConnectMode(fromId)`; next node click draws an edge (prompts for optional label) and calls `onEdgeAdd`; Escape cancels
- **Delete**: Del key (when body is focused), toolbar Delete button, or context-menu Delete; confirms via `confirm()` then calls `onNodeDelete`
- **Source-patching utilities** (pure functions — `(source, …) → string`):
  - `patchNodeLabel(source, nodeId, oldLabel, newLabel)` — replaces a label inside its bracket pair
  - `patchDeleteNode(source, nodeId)` — removes the node definition and all edges referencing it
  - `patchChangeNodeShape(source, nodeId, label, shapeOpt)` — replaces the bracket-shape around the label
  - `patchAddNode(source, newId, newLabel, shapeOpt, fromId?, edgeLabel?)` — appends a node (and optional edge)
  - `patchAddEdge(source, fromId, toId, edgeLabel, edgeStyle)` — appends an arrow line
- Exports `SHAPE_CATALOGUE` — array of 9 shape descriptors used in toolbar/modal dropdowns

### `js/smartbar.js` — Command Palette

- Renders three groups when idle: **Recent Files** (up to 5), **Actions** (12 hardcoded actions), **Snippets** (from `snippets.js`)
- Search filters all three groups simultaneously
- Keyboard navigation tracks `_selectedIndex` across a flat `_flatItems` array built during each `_render()` call
- Dispatches `_onAction(actionId)`, `_onSnippet(snippet)`, or `_onRecentFile(name)` when an item is activated

### `js/snippets.js` — Diagram Templates (Data)

A pure data module: exports `SNIPPETS` (array of 13 diagram templates across 13 categories) and two helpers:
- `searchSnippets(query)` — filters by label, description, tag, and keywords
- `getSnippetTags()` — returns unique tag strings

### `js/presets.js` — Template Library UI

- Builds a collapsible accordion panel inside the Styling Studio sidebar from `SNIPPETS`
- Groups snippets by tag using `CATEGORY_ORDER` and `CATEGORY_META`
- Handles click-to-insert and drag-to-editor for each preset card
- `onInsert(snippet)` callback is wired in `app.js` to `handleSnippetInsert()`, which shows the **Insert Choice modal** if the editor is non-empty

### `js/themes.js` — Theme Management

- `APP_THEMES` — array of 4 app-level themes; each specifies a `bodyClass` to toggle on `<body>` and a default `mermaidTheme`
- `MERMAID_THEMES` — array of 5 Mermaid theme values for the sidebar select
- `applyAppTheme(id)` — removes all `.theme-*` classes and adds the new one; persists to `localStorage`
- `applyMermaidTheme(theme, rerender)` — calls `mermaid.initialize()` with the new theme and invokes the rerender callback
- `applyCustomCss(css)` — injects CSS into a `<style id="custom-css-injector-style">` tag in `<head>`; persists to `localStorage`
- `restoreThemeSettings(rerender)` — reads all three settings from `localStorage` and applies them

### `js/vault.js` — OPFS File Adapter

All public functions are `async` and throw on failure (callers in `app.js` wrap them in `try/catch`).

| Function | Description |
|---|---|
| `initVault()` | Opens the OPFS root (`navigator.storage.getDirectory()`); returns `true` on success |
| `isVaultAvailable()` | Returns `true` if `_rootHandle` is set |
| `listFiles()` | Iterates OPFS entries, filters to `.mmd` files, sorts by `lastModified` |
| `saveFile(name, content)` | Creates/overwrites `<sanitiseName(name)>.mmd` via `createWritable()` |
| `loadFile(name)` | Reads and returns file text |
| `deleteFile(name)` | Removes the entry from OPFS |
| `renameFile(old, new)` | Copy (save) + delete — OPFS has no native rename |
| `getStorageEstimate()` | Returns `{ used, quota, percent }` from `navigator.storage.estimate()` |
| `requestPersistence()` | Requests durable OPFS storage via `navigator.storage.persist()` |
| `getAllocationCap()` / `setAllocationCap(mb)` | Read/write the soft cap from `localStorage` |
| `getLastOpenedFile()` / `setLastOpenedFile(name)` | Read/write the last-opened file name from `localStorage` |
| `getRecentFiles()` | Returns up to 5 most-recently-opened file names (array, most-recent first) |
| `addRecentFile(name)` | Pushes a name to the top of the recents list (deduplicates, trims to 5) |
| `removeRecentFile(name)` | Removes a specific name from the recents list (called on delete/rename) |
| `formatBytes(bytes)` | Human-readable byte size string |

**`sanitiseName(name)`** replaces `/\:*?"<>|` with `_` to ensure the name is safe as an OPFS file name.

---

## State Management

There is no reactive state system. All state lives in one of two places:

1. **`state` object in `app.js`** — runtime-only, not persisted:
   ```js
   const state = {
     currentFile: null,      // string | null — name without extension
     isDirty: false,         // boolean — unsaved changes exist
     vaultAvailable: false,  // boolean — OPFS opened successfully
   };
   ```

2. **`localStorage`** — persisted across sessions:

   | Key | Contents |
   |---|---|
   | `sirens-editor-content` | Current editor source (auto-saved on every change) |
   | `sirens-last-file` | Name of the last opened vault file |
   | `sirens-recent-files` | JSON array of up to 5 recently opened file names |
   | `sirens-app-theme` | Active app theme id |
   | `sirens-mermaid-theme` | Active Mermaid diagram theme |
   | `sirens-custom-css` | Custom CSS entered in the CSS Injector |
   | `sirens-vault-allocation-mb` | Soft allocation cap (in MB) |

UI is updated synchronously by direct DOM manipulation whenever state changes.

---

## Service Worker Strategy

`sw.js` uses two named caches:

| Cache | Strategy | Contents |
|---|---|---|
| `sirens-v5` | Cache-first | All same-origin app shell files |
| `sirens-cdn-v1` | Network-first with cache fallback | CDN resources (jsdelivr, cdnjs, unpkg) |

The app shell cache is pre-populated during `install` via `cache.addAll(APP_SHELL)`. Any fetch for a same-origin URL that is not yet cached is fetched from the network and added to the cache on the fly.

**Cache versioning**: update `CACHE_NAME = 'sirens-vN'` (incrementing N) whenever the app shell files change. The `activate` handler deletes all caches with names not matching the current `CACHE_NAME` or `CDN_CACHE`. **Always add newly created `js/*.js` files to the `APP_SHELL` array in `sw.js`** — omitting them breaks offline use of that module.

---

## CSS Architecture

All visual tokens live in the `:root` block of `css/app.css` as CSS custom properties. Theme overrides are scoped to `.theme-<name>` on `<body>`. The cascade means theme properties naturally win over `:root` defaults.

```
:root              — base Corporate theme variables
.theme-midnight    — Dark evergreen overrides
.theme-highcontrast — Accessibility overrides
.theme-sketch      — Light warm-parchment overrides
```

Bulma is imported for its utility classes but most layout and component styling is custom. The CodeMirror stylesheet is scoped with `.CodeMirror` prefixes and overridden in `app.css` using `!important` where specificity battles arise.

---

## Security Notes

- **SVG rendering**: `preview.js` parses the Mermaid SVG string via `DOMParser` (`text/html`) and inserts the result using `document.importNode` + `replaceChildren` — there is no `innerHTML` assignment of renderer output. This handles `<foreignObject>` HTML labels correctly and avoids XSS taint chains flagged by static analysis.
- **HTML injection**: all user-controlled strings rendered via `innerHTML` pass through `_escHtml()` (app.js) or `_escapeHtml()` (smartbar.js, presets.js) which encode `&`, `<`, `>`, and `"`.
- **Mermaid `securityLevel: 'loose'`**: enables HTML labels in diagram nodes. Because all diagram content is authored by the local user, this is an acceptable trade-off for richer diagrams. If Sirens is ever extended to render diagrams from untrusted sources, this must be changed to `'strict'` or `'antiscript'`.
- **OPFS sandboxing**: the Origin Private File System is inaccessible to other origins; the browser enforces this at the platform level.
- **No server communication**: there is no backend and no API. The app cannot exfiltrate data even if a payload were injected, because there is no endpoint to send it to.
