/* ============================================================
   Sirens — Canvas Edit Mode
   Allows the user to rename node labels directly on the preview
   canvas. When edit mode is active, clicking a node shows a
   floating text-input; on confirm the source is patched and
   re-rendered via the provided callback.
   ============================================================ */

let _editMode = false;
let _viewport  = null;
let _canvas    = null;
let _onLabelChange = null;  // (nodeId, oldLabel, newLabel) => void
let _floatingInput = null;

/* ── Public API ─────────────────────────────────────────────── */

/**
 * Wire the canvas edit module to DOM elements.
 * @param {{
 *   viewport: HTMLElement,
 *   canvas:   HTMLElement,
 *   onLabelChange: (nodeId: string, oldLabel: string, newLabel: string) => void
 * }} options
 */
export function initCanvasEdit({ viewport, canvas, onLabelChange }) {
  _viewport = viewport;
  _canvas   = canvas;
  _onLabelChange = onLabelChange;
}

/**
 * Toggle edit mode on/off.
 * @returns {boolean} true if edit mode is now active
 */
export function toggleCanvasEdit() {
  _editMode = !_editMode;
  if (_editMode) {
    _viewport.classList.add('canvas-edit-active');
    _canvas.addEventListener('click', _handleCanvasClick, true);
  } else {
    _viewport.classList.remove('canvas-edit-active');
    _canvas.removeEventListener('click', _handleCanvasClick, true);
    _hideInput();
  }
  return _editMode;
}

/** @returns {boolean} */
export function isEditMode() { return _editMode; }

/**
 * Force-exit edit mode (e.g. when a new diagram is rendered).
 */
export function exitCanvasEdit() {
  if (_editMode) toggleCanvasEdit();
}

/* ── Private ────────────────────────────────────────────────── */

function _handleCanvasClick(e) {
  // Find the nearest node element
  const nodeEl = e.target.closest(
    '.node, .actor, .entityBox, .statediagram-state, g[id^="flowchart-"]'
  );
  if (!nodeEl) return;

  e.stopPropagation();
  e.preventDefault();

  // Extract the current visible label text
  const labelEl = nodeEl.querySelector(
    'span.nodeLabel, .label, foreignObject span, text'
  );
  const currentLabel = labelEl ? labelEl.textContent.trim() : '';

  // Extract node ID from the SVG element id (e.g. "flowchart-A-0" → "A")
  const nodeId = _extractNodeId(nodeEl);

  _showInput(nodeEl, currentLabel, (newLabel) => {
    if (newLabel && newLabel !== currentLabel && typeof _onLabelChange === 'function') {
      _onLabelChange(nodeId, currentLabel, newLabel);
    }
  });
}

function _showInput(nodeEl, currentValue, onConfirm) {
  _hideInput(); // dismiss any previous

  const rect = nodeEl.getBoundingClientRect();

  const input = document.createElement('input');
  input.type  = 'text';
  input.value = currentValue;
  input.className = 'canvas-edit-input';
  input.setAttribute('aria-label', 'Edit node label');
  input.style.left   = `${Math.round(rect.left)}px`;
  input.style.top    = `${Math.round(rect.top)}px`;
  input.style.width  = `${Math.max(rect.width, 120)}px`;
  input.style.height = `${Math.max(rect.height, 28)}px`;

  let committed = false;

  const commit = () => {
    if (committed) return;
    committed = true;
    const val = input.value.trim();
    onConfirm(val);
    _hideInput();
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter')  { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { committed = true; _hideInput(); }
  });
  input.addEventListener('blur', commit);

  document.body.appendChild(input);
  _floatingInput = input;

  // Focus + select all after paint so position is accurate
  requestAnimationFrame(() => { input.focus(); input.select(); });
}

function _hideInput() {
  if (_floatingInput) {
    _floatingInput.remove();
    _floatingInput = null;
  }
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

/**
 * Patch a Mermaid source string by replacing a node's label text.
 * Handles the common bracket styles: [], (), {}, (()), [()], [()] etc.
 *
 * @param {string} source   The current Mermaid source
 * @param {string} nodeId   The node ID extracted from the SVG
 * @param {string} oldLabel The label text currently shown
 * @param {string} newLabel The new label text
 * @returns {string} The patched source
 */
export function patchNodeLabel(source, nodeId, oldLabel, newLabel) {
  if (!nodeId || !oldLabel) return source;

  // Escape both for regex use
  const idEsc  = nodeId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const oldEsc = oldLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Try bracket pairs from most-specific to least
  const pairs = [
    ['\\(\\(', '\\)\\)'],   // (( ))
    ['\\[\\(', '\\)\\]'],   // [( )]
    ['\\[\\[', '\\]\\]'],   // [[ ]]
    ['\\[\\/', '\\/\\]'],   // [/ /]
    ['\\(\\[', '\\]\\)'],   // ([ ])  — not standard but defensive
    ['\\[',   '\\]'],       // [ ]
    ['\\(',   '\\)'],       // ( )
    ['\\{',   '\\}'],       // { }
    ['>',     '\\]'],       // > ]
  ];

  for (const [open, close] of pairs) {
    const re = new RegExp(
      `(\\b${idEsc}\\s*${open})${oldEsc}(${close})`,
      'g'
    );
    const patched = source.replace(re, `$1${newLabel}$2`);
    if (patched !== source) return patched;
  }

  // Fallback: bare string replacement (safe last resort)
  return source.split(oldLabel).join(newLabel);
}
