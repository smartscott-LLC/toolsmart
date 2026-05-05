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
                    └── import './vault.js'
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

**Boot sequence** (`boot()`)

```
1. registerServiceWorker()
2. initMermaid('base')           — configure Mermaid before first render
3. restoreThemeSettings()        — apply saved theme; may trigger re-render
4. initVault()                   — open OPFS root handle
5. initEditor()                  — mount CodeMirror; load last session content
6. initPreviewPanel()            — bind viewport/canvas, set up zoom/pan
7. initSmartBarPanel()           — wire SmartBar overlay
8. initStyleSidebar()            — build theme cards and Mermaid select
9. initExportModal()             — wire export card clicks and download button
10. initResizeHandle()           — drag-to-resize + keyboard accessibility
11. initNavbarButtons()          — wire all navbar button clicks and modals
12. initKeyboardShortcuts()      — global keydown handler
13. initPwaInstall()             — capture beforeinstallprompt
14. syncStyleSidebarState()      — set active cards/selects from restored settings
15. openDiagramFromVault(lastFile)  — restore last session file (if any)
16. renderDiagram(initialContent)   — first render
17. URL action dispatch          — handle ?action=new from PWA shortcut
```

### `js/editor.js` — CodeMirror Wrapper

- Defines the custom `mermaid` CodeMirror Simple Mode with token rules for: comments, diagram-type declarations, arrows, node shapes, quoted strings, keywords, node IDs, numbers
- Provides `getMermaidHints()` for Ctrl+Space autocomplete and keyup ghost-text hints
- Exports `createEditor(container, options)` — returns `{ cm, setErrors, setValue, getValue, goToLine }`
- Exports `detectDiagramType(source)` — returns a human-readable type label from the first line

**Key design decisions:**
- Ghost text completions appear 200 ms after the user stops typing. They use the same `getMermaidHints` function as explicit Ctrl+Space to avoid duplication.
- Error markers are 0-based internally (CodeMirror) but the `setErrors` API accepts 1-based line numbers (as reported by Mermaid).

### `js/preview.js` — Renderer + Interaction

- Wraps `window.mermaid.render()` in `renderDiagram(source, { onError, onSuccess })`
- Manages a module-level `_state` object for zoom, pan, and kinetic velocity
- **Kinetic pan**: on pointer-up, `_startKinetic()` uses `requestAnimationFrame` with a friction constant (`KINETIC_FRICTION = 0.88`) to decay velocity over time
- **Zoom-to-pointer**: wheel events compute the mouse offset relative to the viewport centre and adjust pan to keep the diagram point under the cursor fixed
- **Touch**: single-touch panning and two-finger pinch-to-zoom via `touchstart/move/end`
- **Click-to-locate**: `_buildNodeLineMap(source)` parses the Mermaid source with regex to produce `{ nodeId → lineNumber }` and attaches `click` handlers to SVG node elements
- **Export**: SVG is serialised to a Blob; PNG uses an `<img>` → `<canvas>` pipeline at 3× device scale

### `js/smartbar.js` — Command Palette

- Renders two groups: **Actions** (hardcoded list of 12 app actions) and **Snippets** (from `snippets.js`)
- Search filters both groups simultaneously; snippets appear first when a query is active
- Keyboard navigation tracks `_selectedIndex` across a flat `_flatItems` array built during each `_render()` call
- Dispatches either `_onAction(actionId)` or `_onSnippet(snippet)` when an item is activated

### `js/snippets.js` — Diagram Templates

A pure data module: exports `SNIPPETS` (array of 13 diagram templates) and two helpers:
- `searchSnippets(query)` — filters by label, description, tag, and keywords
- `getSnippetTags()` — returns unique tag strings

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
     currentFile: null,      // string | null
     isDirty: false,         // boolean
     vaultAvailable: false,  // boolean
     isWelcomeSeed: false,   // true while starter diagram is untouched
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
| `sirens-v2` | Cache-first | All same-origin app shell files |
| `sirens-cdn-v1` | Network-first with cache fallback | CDN resources (jsdelivr, cdnjs, unpkg) |

The app shell cache is pre-populated during `install` via `cache.addAll(APP_SHELL)`. Any fetch for a same-origin URL that is not yet cached is fetched from the network and added to the cache on the fly.

**Cache versioning**: update `CACHE_NAME = 'sirens-v2'` (incrementing the number) whenever the app shell files change. The `activate` handler deletes all caches with names not matching the current `CACHE_NAME` or `CDN_CACHE`.

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

- **HTML injection**: all user-controlled strings rendered via `innerHTML` pass through `_escHtml()` (app.js) or `_escapeHtml()` (smartbar.js, preview.js) which encode `&`, `<`, `>`, and `"`.
- **Mermaid `securityLevel: 'loose'`**: enables HTML labels in diagram nodes. Because all diagram content is authored by the local user, this is an acceptable trade-off for richer diagrams. If Sirens is ever extended to render diagrams from untrusted sources, this must be changed to `'strict'` or `'antiscript'`.
- **OPFS sandboxing**: the Origin Private File System is inaccessible to other origins; the browser enforces this at the platform level.
- **No server communication**: there is no backend and no API. The app cannot exfiltrate data even if a XSS payload were injected, because there is no endpoint to send it to.
