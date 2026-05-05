/* ============================================================
   Sirens — SmartBar Module
   Cmd+K command palette:
   - Snippet insertion
   - File operations (new, open from vault, save)
   - App actions (themes, vault, export)
   ============================================================ */

import { SNIPPETS, searchSnippets } from './snippets.js';

const ACTIONS = [
  { id: 'new-file',     label: 'New Diagram',        description: 'Clear editor and start fresh',                  icon: '📄', tag: 'file'   },
  { id: 'save-file',    label: 'Save to Vault',       description: 'Save current diagram to local OPFS storage',   icon: '💾', tag: 'file'   },
  { id: 'open-vault',   label: 'Open Vault…',         description: 'Browse and open a saved diagram',              icon: '🗃️', tag: 'file'   },
  { id: 'export-svg',   label: 'Export as SVG',       description: 'Download the diagram as SVG vector image',     icon: '🖼️', tag: 'export' },
  { id: 'export-png',   label: 'Export as PNG',       description: 'Download the diagram as PNG (3× resolution)',  icon: '🖼️', tag: 'export' },
  { id: 'export-mmd',   label: 'Export as .mmd',      description: 'Download the raw Mermaid source file',         icon: '📝', tag: 'export' },
  { id: 'fit-diagram',  label: 'Fit Diagram to View', description: 'Auto-scale the preview to fit the panel',     icon: '🔍', tag: 'view'   },
  { id: 'zoom-in',      label: 'Zoom In',             description: 'Increase diagram preview zoom',                icon: '➕', tag: 'view'   },
  { id: 'zoom-out',     label: 'Zoom Out',            description: 'Decrease diagram preview zoom',               icon: '➖', tag: 'view'   },
  { id: 'reset-view',   label: 'Reset View',          description: 'Reset zoom and pan to default',               icon: '🏠', tag: 'view'   },
  { id: 'open-themes',  label: 'Styling Studio…',     description: 'Toggle the theme and CSS panel',              icon: '🎨', tag: 'style'  },
  { id: 'open-vault-modal', label: 'Vault Dashboard…', description: 'Manage storage, allocation and files',       icon: '🔒', tag: 'vault'  },
];

/** @type {HTMLElement} */
let _overlay = null;
/** @type {HTMLInputElement} */
let _input = null;
/** @type {HTMLElement} */
let _resultsList = null;

let _selectedIndex = 0;
let _flatItems = [];

/** @type {Function} */
let _onAction = null;
/** @type {Function} */
let _onSnippet = null;

/* ── Initialise ─────────────────────────────────────────────── */

/**
 * @param {{
 *   overlay: HTMLElement,
 *   input: HTMLInputElement,
 *   results: HTMLElement,
 *   onAction: (actionId: string) => void,
 *   onSnippet: (snippet: object) => void,
 * }} options
 */
export function initSmartBar({ overlay, input, results, onAction, onSnippet }) {
  _overlay = overlay;
  _input = input;
  _resultsList = results;
  _onAction = onAction;
  _onSnippet = onSnippet;

  // Close on overlay backdrop click
  _overlay.addEventListener('click', (e) => {
    if (e.target === _overlay) closeSmartBar();
  });

  // Input handler
  _input.addEventListener('input', () => {
    _selectedIndex = 0;
    _render(_input.value.trim());
  });

  // Keyboard nav
  _input.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        _selectedIndex = Math.min(_selectedIndex + 1, _flatItems.length - 1);
        _updateSelected();
        break;
      case 'ArrowUp':
        e.preventDefault();
        _selectedIndex = Math.max(_selectedIndex - 1, 0);
        _updateSelected();
        break;
      case 'Enter':
        e.preventDefault();
        _activateSelected();
        break;
      case 'Escape':
        e.preventDefault();
        closeSmartBar();
        break;
    }
  });
}

/* ── Open / Close ───────────────────────────────────────────── */

export function openSmartBar() {
  if (!_overlay) return;
  _input.value = '';
  _selectedIndex = 0;
  _render('');
  _overlay.classList.add('open');
  // Focus after transition
  requestAnimationFrame(() => _input.focus());
}

export function closeSmartBar() {
  if (!_overlay) return;
  _overlay.classList.remove('open');
}

export function isSmartBarOpen() {
  return _overlay && _overlay.classList.contains('open');
}

/* ── Rendering ──────────────────────────────────────────────── */

function _render(query) {
  _resultsList.innerHTML = '';
  _flatItems = [];

  const snippets = searchSnippets(query);
  const actions = query
    ? ACTIONS.filter(
        (a) =>
          a.label.toLowerCase().includes(query.toLowerCase()) ||
          a.tag.includes(query.toLowerCase()) ||
          a.description.toLowerCase().includes(query.toLowerCase())
      )
    : ACTIONS;

  if (!query) {
    // Show all actions first, then snippets
    _renderGroup('Actions', actions, 'action');
    _renderGroup('Snippets', snippets, 'snippet');
  } else {
    // Snippets first for query (more likely what the user wants)
    if (snippets.length) _renderGroup('Snippets', snippets, 'snippet');
    if (actions.length) _renderGroup('Actions', actions, 'action');
    if (!snippets.length && !actions.length) {
      _resultsList.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:0.875rem;">No results for "<strong>${_escapeHtml(query)}</strong>"</div>`;
    }
  }

  _updateSelected();
}

function _renderGroup(label, items, type) {
  if (!items.length) return;

  const groupLabel = document.createElement('div');
  groupLabel.className = 'smartbar-group-label';
  groupLabel.textContent = label;
  _resultsList.appendChild(groupLabel);

  items.forEach((item) => {
    const idx = _flatItems.length;
    _flatItems.push({ item, type });

    const el = document.createElement('div');
    el.className = 'smartbar-item';
    el.dataset.index = idx;

    el.innerHTML = `
      <span class="smartbar-item-icon">${_escapeHtml(item.icon)}</span>
      <span class="smartbar-item-info">
        <span class="smartbar-item-label">${_escapeHtml(item.label)}</span>
        <span class="smartbar-item-desc">${_escapeHtml(item.description)}</span>
      </span>
      <span class="smartbar-item-tag">${_escapeHtml(item.tag)}</span>
    `;

    el.addEventListener('click', () => {
      _selectedIndex = idx;
      _activateSelected();
    });

    el.addEventListener('mouseenter', () => {
      _selectedIndex = idx;
      _updateSelected();
    });

    _resultsList.appendChild(el);
  });
}

function _updateSelected() {
  const items = _resultsList.querySelectorAll('.smartbar-item');
  items.forEach((el, i) => {
    el.classList.toggle('selected', i === _selectedIndex);
  });
  // Scroll into view
  const selected = _resultsList.querySelector('.smartbar-item.selected');
  if (selected) {
    selected.scrollIntoView({ block: 'nearest' });
  }
}

function _activateSelected() {
  const entry = _flatItems[_selectedIndex];
  if (!entry) return;
  closeSmartBar();

  if (entry.type === 'snippet') {
    if (typeof _onSnippet === 'function') _onSnippet(entry.item);
  } else {
    if (typeof _onAction === 'function') _onAction(entry.item.id);
  }
}

function _escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
