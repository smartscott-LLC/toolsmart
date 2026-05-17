/* ============================================================
   Sirens — Canvas Edit Mode  v2
   Full-featured canvas editing: select nodes, rename labels,
   change shapes, delete nodes, add nodes, and draw edges.
   All edits patch the Mermaid source and trigger a re-render.
   ============================================================ */

/* ── Module State ───────────────────────────────────────────── */

let _editMode       = false;
let _viewport       = null;
let _canvas         = null;

// Callbacks (set via initCanvasEdit)
let _onLabelChange  = null;   // (nodeId, oldLabel, newLabel) => void
let _onNodeDelete   = null;   // (nodeId, label)              => void
let _onShapeChange  = null;   // (nodeId, label, shapeOpt)    => void
let _onEdgeAdd      = null;   // (fromId, toId, edgeLabel, edgeStyle) => void
let _onNodeSelect   = null;   // (nodeId, label)              => void
let _onNodeDeselect = null;   // ()                           => void

// Selection state
let _selectedNodeEl  = null;
let _selectedNodeId  = null;
let _selectedLabel   = null;

// Connect-mode state
let _connectMode   = false;
let _connectFromId = null;

// Floating UI elements
let _floatingInput   = null;
let _contextMenu     = null;

/* ── Shape catalogue ────────────────────────────────────────── */

export const SHAPE_CATALOGUE = [
  { value: 'rect',          label: '▭ Rectangle',    open: '[',   close: ']'  },
  { value: 'stadium',       label: '⬭ Stadium/Pill',  open: '(',   close: ')'  },
  { value: 'circle',        label: '○ Circle',        open: '((',  close: '))' },
  { value: 'diamond',       label: '◇ Diamond',       open: '{',   close: '}'  },
  { value: 'parallelogram', label: '▱ Parallelogram', open: '[/',  close: '/]' },
  { value: 'cylinder',      label: '🛢 Cylinder',      open: '[(',  close: ')]' },
  { value: 'hexagon',       label: '⬡ Hexagon',       open: '{{',  close: '}}' },
  { value: 'subroutine',    label: '⧠ Subroutine',    open: '[[',  close: ']]' },
  { value: 'asymmetric',    label: '▷ Asymmetric',    open: '>',   close: ']'  },
];

/* ── Public API ─────────────────────────────────────────────── */

/**
 * Wire the canvas edit module to DOM elements and callbacks.
 */
export function initCanvasEdit({
  viewport, canvas,
  onLabelChange, onNodeDelete, onShapeChange, onEdgeAdd,
  onNodeSelect, onNodeDeselect,
}) {
  _viewport       = viewport;
  _canvas         = canvas;
  _onLabelChange  = onLabelChange  || null;
  _onNodeDelete   = onNodeDelete   || null;
  _onShapeChange  = onShapeChange  || null;
  _onEdgeAdd      = onEdgeAdd      || null;
  _onNodeSelect   = onNodeSelect   || null;
  _onNodeDeselect = onNodeDeselect || null;
}

/**
 * Toggle edit mode on/off.
 * @returns {boolean} true if edit mode is now active
 */
export function toggleCanvasEdit() {
  _editMode = !_editMode;
  if (_editMode) {
    _viewport.classList.add('canvas-edit-active');
    _canvas.addEventListener('click',       _handleCanvasClick,      true);
    _canvas.addEventListener('dblclick',    _handleCanvasDoubleClick, true);
    _canvas.addEventListener('contextmenu', _handleContextMenu,       true);
    document.addEventListener('click',      _dismissContextMenu,      false);
    document.addEventListener('keydown',    _handleGlobalKey,         false);
  } else {
    _viewport.classList.remove('canvas-edit-active');
    _canvas.removeEventListener('click',       _handleCanvasClick,      true);
    _canvas.removeEventListener('dblclick',    _handleCanvasDoubleClick, true);
    _canvas.removeEventListener('contextmenu', _handleContextMenu,       true);
    document.removeEventListener('click',      _dismissContextMenu,      false);
    document.removeEventListener('keydown',    _handleGlobalKey,         false);
    _hideInput();
    _dismissContextMenu();
    _clearSelection();
    cancelConnectMode();
  }
  return _editMode;
}

/** @returns {boolean} */
export function isEditMode() { return _editMode; }

/** Force-exit edit mode (e.g. when a new diagram is rendered). */
export function exitCanvasEdit() {
  if (_editMode) toggleCanvasEdit();
}

/** @returns {{ nodeId: string, label: string } | null} */
export function getSelectedNodeInfo() {
  if (!_selectedNodeId) return null;
  return { nodeId: _selectedNodeId, label: _selectedLabel };
}

/** Enter connect mode: next node click creates an edge from fromNodeId. */
export function startConnectMode(fromNodeId) {
  _connectMode   = true;
  _connectFromId = fromNodeId;
  _viewport.classList.add('canvas-connect-mode');
}

/** Cancel connect mode. */
export function cancelConnectMode() {
  _connectMode   = false;
  _connectFromId = null;
  _viewport.classList.remove('canvas-connect-mode');
}

/** Programmatically trigger rename on the currently selected node. */
export function renameSelected() {
  if (!_selectedNodeEl || !_selectedNodeId) return;
  _startRename(_selectedNodeEl, _selectedLabel, _selectedNodeId);
}

/* ── Event Handlers ─────────────────────────────────────────── */

const NODE_SELECTOR = '.node, .actor, .entityBox, .statediagram-state, g[id^="flowchart-"]';

function _handleCanvasClick(e) {
  const nodeEl = e.target.closest(NODE_SELECTOR);

  // ── Connect mode: second click picks the target node ────────
  if (_connectMode) {
    if (nodeEl) {
      e.stopPropagation();
      e.preventDefault();
      const toId   = _extractNodeId(nodeEl);
      const fromId = _connectFromId;
      cancelConnectMode();
      if (toId && fromId && toId !== fromId) {
        const edgeLabel = prompt('Edge label (optional, press Enter to skip):', '') ?? '';
        if (typeof _onEdgeAdd === 'function') _onEdgeAdd(fromId, toId, edgeLabel.trim(), '-->');
      }
    } else {
      // Click on empty canvas — cancel connect mode
      cancelConnectMode();
    }
    return;
  }

  // ── Normal mode: select node ─────────────────────────────────
  if (!nodeEl) {
    _clearSelection();
    if (typeof _onNodeDeselect === 'function') _onNodeDeselect();
    return;
  }
  e.stopPropagation();
  e.preventDefault();
  _selectNode(nodeEl);
}

function _handleCanvasDoubleClick(e) {
  const nodeEl = e.target.closest(NODE_SELECTOR);
  if (!nodeEl) return;
  e.stopPropagation();
  e.preventDefault();

  if (!_connectMode) {
    _selectNode(nodeEl);
    _startRename(nodeEl, _selectedLabel, _selectedNodeId);
  }
}

function _handleContextMenu(e) {
  const nodeEl = e.target.closest(NODE_SELECTOR);
  if (!nodeEl) return;
  e.stopPropagation();
  e.preventDefault();
  _selectNode(nodeEl);
  _showContextMenu(e.clientX, e.clientY);
}

function _handleGlobalKey(e) {
  if (e.key === 'Escape') {
    cancelConnectMode();
    _hideInput();
    _dismissContextMenu();
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && _selectedNodeId && document.activeElement === document.body) {
    _deleteSelected();
  }
  if (e.key === 'F2' && _selectedNodeId) {
    renameSelected();
  }
}

/* ── Selection ──────────────────────────────────────────────── */

function _selectNode(nodeEl) {
  // Deselect previous
  if (_selectedNodeEl && _selectedNodeEl !== nodeEl) {
    _selectedNodeEl.classList.remove('canvas-edit-selected');
  }

  _selectedNodeEl = nodeEl;
  const labelEl   = nodeEl.querySelector('span.nodeLabel, .label, foreignObject span, text');
  _selectedLabel  = labelEl ? labelEl.textContent.trim() : '';
  _selectedNodeId = _extractNodeId(nodeEl);

  nodeEl.classList.add('canvas-edit-selected');

  if (typeof _onNodeSelect === 'function') {
    _onNodeSelect(_selectedNodeId, _selectedLabel);
  }
}

function _clearSelection() {
  if (_selectedNodeEl) {
    _selectedNodeEl.classList.remove('canvas-edit-selected');
    _selectedNodeEl = null;
  }
  _selectedNodeId = null;
  _selectedLabel  = null;
  _hideInput();
}

/* ── Delete helper ──────────────────────────────────────────── */

function _deleteSelected() {
  if (!_selectedNodeId) return;
  if (!confirm(`Delete node "${_selectedLabel || _selectedNodeId}" and all its connections?`)) return;
  const nodeId = _selectedNodeId;
  const label  = _selectedLabel;
  _clearSelection();
  if (typeof _onNodeDelete === 'function') _onNodeDelete(nodeId, label);
}

/* ── Rename input ───────────────────────────────────────────── */

function _startRename(nodeEl, currentValue, nodeId) {
  _hideInput();

  const rect  = nodeEl.getBoundingClientRect();
  const input = document.createElement('input');
  input.type  = 'text';
  input.value = currentValue || '';
  input.className = 'canvas-edit-input';
  input.setAttribute('aria-label', 'Edit node label');
  input.style.left   = `${Math.round(rect.left)}px`;
  input.style.top    = `${Math.round(rect.top)}px`;
  input.style.width  = `${Math.max(rect.width, 140)}px`;
  input.style.height = `${Math.max(rect.height, 30)}px`;

  let committed = false;
  const commit = () => {
    if (committed) return;
    committed = true;
    const val = input.value.trim();
    _hideInput();
    if (val && val !== currentValue && typeof _onLabelChange === 'function') {
      _onLabelChange(nodeId, currentValue, val);
    }
  };

  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter')  { ev.preventDefault(); commit(); }
    if (ev.key === 'Escape') { committed = true; _hideInput(); }
    ev.stopPropagation();
  });
  input.addEventListener('blur', commit);

  document.body.appendChild(input);
  _floatingInput = input;
  requestAnimationFrame(() => { input.focus(); input.select(); });
}

function _hideInput() {
  if (_floatingInput) { _floatingInput.remove(); _floatingInput = null; }
}

/* ── Context Menu ───────────────────────────────────────────── */

function _showContextMenu(x, y) {
  _dismissContextMenu();

  const menu = document.createElement('div');
  menu.className  = 'canvas-ctx-menu';
  menu.role       = 'menu';
  menu.setAttribute('aria-label', 'Node actions');

  const items = [
    { icon: '✏️', label: 'Rename',          action: () => renameSelected() },
    { icon: '→',  label: 'Connect to…',     action: () => startConnectMode(_selectedNodeId) },
    { divider: true },
    { icon: '🗑', label: 'Delete Node',     action: () => _deleteSelected(), danger: true },
  ];

  for (const item of items) {
    if (item.divider) {
      const hr = document.createElement('hr');
      hr.className = 'ctx-divider';
      menu.appendChild(hr);
      continue;
    }
    const btn = document.createElement('button');
    btn.className = 'ctx-item' + (item.danger ? ' ctx-item-danger' : '');
    btn.innerHTML = `<span class="ctx-icon">${item.icon}</span>${item.label}`;
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      _dismissContextMenu();
      item.action();
    });
    menu.appendChild(btn);
  }

  document.body.appendChild(menu);
  _contextMenu = menu;

  // Position (clamp to viewport)
  const mRect = menu.getBoundingClientRect();
  let mx = x, my = y;
  if (mx + mRect.width  > window.innerWidth  - 8) mx = window.innerWidth  - mRect.width  - 8;
  if (my + mRect.height > window.innerHeight - 8) my = window.innerHeight - mRect.height - 8;
  menu.style.left = `${Math.max(8, mx)}px`;
  menu.style.top  = `${Math.max(8, my)}px`;
}

function _dismissContextMenu() {
  if (_contextMenu) { _contextMenu.remove(); _contextMenu = null; }
}

/* ── Helpers ────────────────────────────────────────────────── */

function _extractNodeId(el) {
  const svgId = el.id || el.getAttribute('id') || '';
  const flowchartMatch = svgId.match(/^flowchart-([^-]+)/);
  if (flowchartMatch) return flowchartMatch[1];
  const classMatch = svgId.match(/^classGroup-(.+)$/);
  if (classMatch) return classMatch[1];
  const dataN = el.dataset.id || el.dataset.nodeId;
  if (dataN) return dataN;
  const text = el.querySelector('span, text, .label');
  return text ? text.textContent.trim() : svgId;
}

/* ══════════════════════════════════════════════════════════════
   Source-Patching Utilities
   All functions are pure: (source: string, …) → string
   ══════════════════════════════════════════════════════════════ */

/**
 * Patch a Mermaid source string by replacing a node's label text.
 */
export function patchNodeLabel(source, nodeId, oldLabel, newLabel) {
  if (!nodeId || !oldLabel) return source;

  const idEsc  = nodeId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const oldEsc = oldLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const pairs = [
    ['\\(\\(', '\\)\\)'],
    ['\\[\\(', '\\)\\]'],
    ['\\[\\[', '\\]\\]'],
    ['\\[\\/', '\\/\\]'],
    ['\\(\\[', '\\]\\)'],
    ['\\{\\{', '\\}\\}'],
    ['\\[',    '\\]'],
    ['\\(',    '\\)'],
    ['\\{',    '\\}'],
    ['>',      '\\]'],
  ];

  for (const [open, close] of pairs) {
    const re = new RegExp(`(\\b${idEsc}\\s*${open})${oldEsc}(${close})`, 'g');
    const patched = source.replace(re, `$1${newLabel}$2`);
    if (patched !== source) return patched;
  }

  return source.split(oldLabel).join(newLabel);
}

/**
 * Remove a node definition and all edges that reference it.
 */
export function patchDeleteNode(source, nodeId) {
  if (!nodeId) return source;
  const idEsc = nodeId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const edgeRe = new RegExp(`\\b${idEsc}\\b`);
  // Detect Mermaid edge syntax (-->, --x, --o, -.-> , ==>, ~~~)
  // Written without the literal '-->' sequence to avoid html-comment lint rules.
  const hasMermaidEdge = (t) =>
    (t.includes('--') && (t.includes('->') || t.includes('--x') || t.includes('--o'))) ||
    t.includes('==>') || t.includes('~~~') || t.includes('-.-');

  const lines = source.split('\n');
  const kept  = lines.filter((line) => {
    const t = line.trim();
    // Node definition: starts with the nodeId followed by bracket/paren/brace or EOL
    if (new RegExp(`^${idEsc}\\s*[\\[\\(\\{>]|^${idEsc}\\s*$`).test(t)) return false;
    // Edge lines that reference this nodeId
    if (edgeRe.test(t) && hasMermaidEdge(t)) return false;
    // style/classDef/class lines that reference this nodeId
    if (/^style\s/.test(t) && edgeRe.test(t)) return false;
    if (/^class\s/.test(t) && edgeRe.test(t)) return false;
    return true;
  });
  return kept.join('\n');
}

/**
 * Change the bracket-shape of a node in Mermaid source.
 * @param {string} source
 * @param {string} nodeId
 * @param {string} currentLabel
 * @param {{ open: string, close: string }} shapeOpt  From SHAPE_CATALOGUE
 */
export function patchChangeNodeShape(source, nodeId, currentLabel, shapeOpt) {
  if (!nodeId || !shapeOpt) return source;
  const idEsc    = nodeId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const labelEsc = currentLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Match any current bracket pair around the label
  const anyBracket = [
    ['\\(\\(', '\\)\\)'],
    ['\\[\\(', '\\)\\]'],
    ['\\[\\[', '\\]\\]'],
    ['\\[\\/', '\\/\\]'],
    ['\\{\\{', '\\}\\}'],
    ['\\[',    '\\]'],
    ['\\(',    '\\)'],
    ['\\{',    '\\}'],
    ['>',      '\\]'],
  ];

  const newOpen  = shapeOpt.open.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const newClose = shapeOpt.close.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  for (const [open, close] of anyBracket) {
    const re = new RegExp(`(\\b${idEsc}\\s*)${open}(${labelEsc})${close}`);
    if (re.test(source)) {
      return source.replace(re, `$1${shapeOpt.open}$2${shapeOpt.close}`);
    }
  }
  return source;
}

/**
 * Append a new node (and optional edge from an existing node) to the source.
 * Tries to detect graph direction and indent style.
 * @param {string} source
 * @param {string} newId
 * @param {string} newLabel
 * @param {{ open: string, close: string }} shapeOpt
 * @param {string|null} fromId  If provided, also adds an edge from fromId → newId
 * @param {string}      edgeLabel
 */
export function patchAddNode(source, newId, newLabel, shapeOpt, fromId, edgeLabel) {
  const open  = shapeOpt ? shapeOpt.open  : '[';
  const close = shapeOpt ? shapeOpt.close : ']';
  const nodeLine = `    ${newId}${open}${newLabel}${close}`;
  let result = source.trimEnd() + '\n' + nodeLine;
  if (fromId) {
    const label  = edgeLabel ? `|${edgeLabel}| ` : '';
    result += `\n    ${fromId} --> ${label}${newId}`;
  }
  return result;
}

/**
 * Append an edge (arrow) between two existing nodes.
 */
export function patchAddEdge(source, fromId, toId, edgeLabel, edgeStyle) {
  const arrow = edgeStyle === 'dashed' ? '-.->': edgeStyle === 'thick' ? '==>' : '-->';
  const label = edgeLabel ? `|${edgeLabel}| ` : '';
  return source.trimEnd() + `\n    ${fromId} ${arrow} ${label}${toId}`;
}
