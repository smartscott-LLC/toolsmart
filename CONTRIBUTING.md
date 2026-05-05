# Contributing to Sirens

Thank you for your interest in improving Sirens! This document explains how to report bugs, suggest features, and contribute code.

---

## Table of Contents

- [Reporting Bugs](#reporting-bugs)
- [Suggesting Features](#suggesting-features)
- [Development Setup](#development-setup)
- [Code Style](#code-style)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Architecture Notes](#architecture-notes)

---

## Reporting Bugs

1. Check the [open issues](https://github.com/smartscott-LLC/toolsmart/issues) to see if the bug has already been reported.
2. If not, open a new issue and include:
   - Browser name and version
   - Steps to reproduce
   - Expected behaviour
   - Actual behaviour
   - Screenshots or screen recordings if helpful

---

## Suggesting Features

Open a GitHub issue with the label **enhancement**. Describe:
- The problem you're trying to solve
- How you imagine the feature working
- Any Mermaid diagram types or editor workflows it relates to

---

## Development Setup

Sirens has **no build step** — there is nothing to install or compile.

```bash
git clone https://github.com/smartscott-LLC/toolsmart.git
cd toolsmart

# Serve with any static file server
npx serve .
# or: python3 -m http.server 8080
```

Open `http://localhost:8080` in Chrome or Edge. Service workers and OPFS require a secure context (`https://` or `localhost`).

---

## Code Style

### General

- **No build tooling** — keep changes to plain HTML, CSS, and vanilla ES-module JavaScript.
- **No new dependencies** — vendor libraries are bundled locally for offline support. Adding a new library means vendoring it.
- **No TypeScript** — JSDoc type annotations are used where helpful (see `editor.js` and `vault.js`).
- **No frameworks** — DOM manipulation is direct; there is no reactive framework.

### JavaScript

- Use `const` by default; `let` when reassignment is necessary.
- Use `async/await` instead of `.then()` chains for Promise-based code.
- Private module-level variables are prefixed with `_` (e.g. `_rootHandle`, `_canvas`).
- DOM helper: use `const $ = (id) => document.getElementById(id)` rather than `querySelector` for ID lookups.
- HTML strings interpolated into `innerHTML` **must** pass through the `_escHtml` / `_escapeHtml` helper to prevent XSS.
- Keep module responsibilities clear — each file in `js/` owns one domain:

  | File | Responsibility |
  |---|---|
  | `app.js` | Boot, orchestration, UI wiring |
  | `editor.js` | CodeMirror, syntax mode, autocomplete |
  | `preview.js` | Mermaid renderer, zoom/pan, export |
  | `smartbar.js` | Command palette |
  | `snippets.js` | Diagram template data |
  | `themes.js` | App and Mermaid theme management |
  | `vault.js` | OPFS file adapter |

### CSS

- All colour tokens are CSS custom properties defined in `:root` inside `css/app.css`. **Never hard-code hex values** outside `:root` or a theme override block.
- Theme overrides follow the `.theme-<name>` body-class pattern already established.
- Use `var(--transition)` (`0.18s ease`) for all interactive transitions.

### HTML

- Every interactive element must have an accessible `aria-label` or be labelled by visible text.
- Modal dialogs use `role="dialog"`, `aria-modal="true"`, and `aria-label`.
- Prefer semantic elements (`<nav>`, `<section>`, `<aside>`, `<footer>`) over generic `<div>` where meaningful.

---

## Submitting a Pull Request

1. **Fork** the repository and create a branch from `main`:
   ```bash
   git checkout -b fix/your-descriptive-name
   ```
2. Make your changes following the code style above.
3. Test in Chrome/Edge with OPFS, and in Firefox to verify the fallback path.
4. Verify the service worker still caches all changed/added files (update `sw.js` `APP_SHELL` if you add new assets).
5. Open a pull request against `main` with a clear description of what changed and why.

### PR checklist

- [ ] Tested in Chrome 86+ (OPFS + PWA install)
- [ ] Tested in Firefox (graceful OPFS fallback)
- [ ] No new external CDN dependencies introduced
- [ ] If new assets added, `sw.js` `APP_SHELL` updated
- [ ] User-interpolated strings escaped with `_escHtml`/`_escapeHtml`
- [ ] No `console.log` left in production paths

---

## Architecture Notes

See [README.md § Architecture Overview](README.md#architecture-overview) for a full breakdown of the module graph and persistence strategy.

Key design constraints to preserve:
- **Offline-first**: every resource needed to render a diagram must be cached or vendored.
- **Privacy-first**: no data may leave the device. No analytics, no telemetry, no server calls for diagram content.
- **Zero-build**: contributors should be able to edit a file and refresh the browser without any compilation step.
