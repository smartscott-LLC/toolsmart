/* ============================================================
   Sirens — Preview Module
   Mermaid diagram renderer with:
   - Kinetic zoom / pan
   - Click-to-locate (maps SVG node → source line)
   - Error display
   ============================================================ */

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 5.0;
const ZOOM_STEP = 0.15;
const KINETIC_FRICTION = 0.88;

let _state = {
  zoom: 1,
  panX: 0,
  panY: 0,
  velX: 0,
  velY: 0,
  isPanning: false,
  lastX: 0,
  lastY: 0,
  kineticRaf: null,
};

/** @type {HTMLElement} */
let _viewport = null;
/** @type {HTMLElement} */
let _canvas = null;
/** @type {Function} */
let _onNodeClick = null;
/** @type {string} */
let _lastSource = '';

let _mermaidCounter = 0;
let _renderGeneration = 0;  // incremented on every render; used to discard stale results
let _lastSvg = '';           // last successfully rendered SVG

/* ── Mermaid initialisation ─────────────────────────────────── */

export function initMermaid(theme = 'base') {
  if (!window.mermaid) {
    console.error('[Sirens] Mermaid not loaded — vendor/mermaid/mermaid.min.js missing?');
    return;
  }
  window.mermaid.initialize({
    startOnLoad: false,
    theme,
    themeVariables: theme === 'base' ? getBrandVars() : {},
    securityLevel: 'loose',
    fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
    flowchart: { useMaxWidth: false, htmlLabels: true },
    sequence: { useMaxWidth: false },
    gantt: { useMaxWidth: false },
  });
}

function getBrandVars() {
  return {
    primaryColor:        '#1e3922',
    primaryTextColor:    '#ddd0b0',
    primaryBorderColor:  '#c25e07',
    lineColor:           '#7b2f00',
    secondaryColor:      '#e1d9c4',
    secondaryTextColor:  '#1e3922',
    tertiaryColor:       '#ddd0b0',
    tertiaryTextColor:   '#1e3922',
    background:          '#e1d9c4',
    mainBkg:             '#1e3922',
    nodeBorder:          '#c25e07',
    clusterBkg:          '#ddd0b080',
    edgeLabelBackground: '#e1d9c4',
    titleColor:          '#ddd0b0',
    noteBkgColor:        '#e1d9c4',
    noteTextColor:       '#1e3922',
  };
}

/* ── Render ─────────────────────────────────────────────────── */

/**
 * Render a Mermaid diagram into the preview canvas.
 * @param {string} source   The mermaid source code
 * @param {Object} options
 * @param {Function} options.onError   Called with error info array on failure
 * @param {Function} options.onSuccess Called on successful render
 */
export async function renderDiagram(source, { onError, onSuccess } = {}) {
  if (!_canvas || !window.mermaid) return;

  _lastSource = source;
  const trimmed = source.trim();

  // Track this render; any older in-flight render whose result arrives later will be discarded.
  _renderGeneration++;
  const thisGeneration = _renderGeneration;

  if (!trimmed) {
    // Clear the cached SVG so that future errors in the new (empty) session show the
    // error message rather than the ghost of the previous successful diagram.
    _lastSvg = '';
    _canvas.innerHTML = `
      <div class="preview-empty">
        <svg class="preview-watermark" viewBox="0 0 320 160" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <!-- Hex motif -->
          <polygon points="40,20 70,4 100,20 100,52 70,68 40,52"
                   fill="none" stroke="#1e3922" stroke-width="1.5" opacity="0.18"/>
          <polygon points="42,21 70,6 98,21 98,51 70,66 42,51"
                   fill="none" stroke="#c25e07" stroke-width="0.6" opacity="0.12"/>
          <text x="70" y="42" text-anchor="middle" dominant-baseline="middle"
                font-family="monospace" font-size="18" fill="#1e3922" opacity="0.22">⬡</text>
          <!-- Wordmark -->
          <text x="120" y="32" font-family="'Inter','Segoe UI',system-ui,sans-serif"
                font-size="22" font-weight="700" fill="#1e3922" opacity="0.18"
                letter-spacing="1">ToolSmart</text>
          <text x="120" y="52" font-family="'Inter','Segoe UI',system-ui,sans-serif"
                font-size="11" fill="#c25e07" opacity="0.28" letter-spacing="2"
                font-weight="600">SIRENS STUDIO</text>
          <!-- Divider -->
          <line x1="120" y1="62" x2="300" y2="62" stroke="#1e3922" stroke-width="0.5" opacity="0.12"/>
          <!-- Hint line -->
          <text x="120" y="78" font-family="'Inter','Segoe UI',system-ui,sans-serif"
                font-size="10.5" fill="#6b6560" opacity="0.5">
            Press <tspan font-weight="700" fill="#c25e07">⌘ K</tspan>
            to open the SmartBar and choose a diagram template
          </text>
        </svg>
      </div>`;
    if (typeof onSuccess === 'function') onSuccess([]);
    return;
  }

  _mermaidCounter++;
  const id = `mermaid-svg-${_mermaidCounter}`;

  try {
    const { svg } = await window.mermaid.render(id, trimmed);

    // Discard result if a newer render has already been requested.
    if (thisGeneration !== _renderGeneration) return;

    _lastSvg = svg;
    _canvas.innerHTML = svg;
    const svgEl = _canvas.querySelector('svg');
    if (svgEl) {
      // Remove Mermaid's inline max-width cap.
      svgEl.style.maxWidth = 'none';
      // Mermaid outputs width="100%" by default, which collapses when the parent
      // (#preview-canvas) is absolutely positioned with no explicit width.
      // Setting explicit px dimensions from the viewBox gives the canvas intrinsic size.
      const vb = svgEl.viewBox.baseVal;
      if (vb.width > 0 && vb.height > 0) {
        svgEl.setAttribute('width', vb.width);
        svgEl.setAttribute('height', vb.height);
      }
      // Attach click-to-locate handlers
      _attachNodeClickHandlers(svgEl, trimmed);
    }

    if (typeof onSuccess === 'function') onSuccess([]);
  } catch (err) {
    // Discard result if a newer render has already been requested.
    if (thisGeneration !== _renderGeneration) return;

    const errors = _parseMermaidError(err, trimmed);

    // Preserve the last successful diagram rather than blanking the canvas.
    // The error is surfaced via the status bar and editor gutter.
    if (!_lastSvg) {
      _canvas.innerHTML = `<div class="render-error">${_escapeHtml(err.message || String(err))}</div>`;
    }

    if (typeof onError === 'function') onError(errors);
  }
}

/* ── Click-to-locate ─────────────────────────────────────────── */

/**
 * Attach click handlers to SVG nodes.
 * When a node is clicked, _onNodeClick is called with the 1-based line number.
 */
function _attachNodeClickHandlers(svgEl, source) {
  if (typeof _onNodeClick !== 'function') return;

  // Build a lookup: nodeId → line number (1-based)
  const lineMap = _buildNodeLineMap(source);

  // Select all node groups in the SVG
  const nodeSelectors = [
    '.node', '.actor', '.messageText', '.label-container',
    'g[id^="flowchart-"]', 'g[id^="classGroup-"]',
    '.entityBox', '.statediagram-state',
  ];

  nodeSelectors.forEach((sel) => {
    svgEl.querySelectorAll(sel).forEach((el) => {
      el.style.cursor = 'pointer';
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const nodeId = _extractNodeId(el);
        const line = lineMap[nodeId] || lineMap[_normalise(nodeId)] || null;
        _onNodeClick(line, nodeId);
      });
    });
  });
}

/**
 * Parse source to build { nodeId: lineNumber } map.
 * Looks for patterns like: A[label], A(label), A{label}, A((label)), participant A
 */
function _buildNodeLineMap(source) {
  const map = {};
  const lines = source.split('\n');
  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    // Flowchart nodes: ID followed by [ ( { or >
    const nodeMatches = line.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\s*[\[({<>]/g);
    for (const m of nodeMatches) {
      const id = m[1];
      if (!map[id]) map[id] = lineNum;
      if (!map[_normalise(id)]) map[_normalise(id)] = lineNum;
    }
    // Sequence participants
    const participantMatch = line.match(/^\s*(?:participant|actor)\s+([A-Za-z_][A-Za-z0-9_ ]*?)(?:\s+as\s+|$)/);
    if (participantMatch) {
      const id = participantMatch[1].trim();
      if (!map[id]) map[id] = lineNum;
    }
    // ER entities
    const entityMatch = line.match(/^\s*([A-Z_][A-Z0-9_]+)\s*\{/);
    if (entityMatch) {
      const id = entityMatch[1];
      if (!map[id]) map[id] = lineNum;
    }
    // Class diagram
    const classMatch = line.match(/^\s*class\s+([A-Za-z_][A-Za-z0-9_]*)/);
    if (classMatch) {
      const id = classMatch[1];
      if (!map[id]) map[id] = lineNum;
    }
  });
  return map;
}

function _extractNodeId(el) {
  // Try SVG id attribute first (e.g. "flowchart-A-0")
  const svgId = el.id || el.getAttribute('id') || '';
  const flowchartMatch = svgId.match(/^flowchart-([^-]+)/);
  if (flowchartMatch) return flowchartMatch[1];

  const classMatch = svgId.match(/^classGroup-(.+)$/);
  if (classMatch) return classMatch[1];

  // Try data attributes
  const dataN = el.dataset.id || el.dataset.nodeId;
  if (dataN) return dataN;

  // Fallback: text content
  const text = el.querySelector('span, text, .label');
  return text ? text.textContent.trim() : svgId;
}

function _normalise(id) {
  return (id || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/* ── Error parsing ───────────────────────────────────────────── */

function _parseMermaidError(err, source) {
  const msg = err.message || String(err);
  const errors = [];

  // Try to extract line number from error message
  const lineMatch = msg.match(/line[:\s]+(\d+)/i) || msg.match(/position[:\s]+(\d+)/i);
  if (lineMatch) {
    errors.push({ line: parseInt(lineMatch[1], 10), message: msg });
  } else {
    // Try to find the offending token in source
    const tokenMatch = msg.match(/Unexpected token[:\s]+"?([^"'\n]+)"?/i);
    if (tokenMatch) {
      const token = tokenMatch[1].trim();
      const lines = source.split('\n');
      const lineIdx = lines.findIndex((l) => l.includes(token));
      errors.push({ line: lineIdx >= 0 ? lineIdx + 1 : 1, message: msg });
    } else {
      errors.push({ line: 1, message: msg });
    }
  }

  return errors;
}

/* ── Zoom ───────────────────────────────────────────────────── */

export function zoomIn() {
  setZoom(_state.zoom + ZOOM_STEP);
}

export function zoomOut() {
  setZoom(_state.zoom - ZOOM_STEP);
}

export function resetView() {
  _state.zoom = 1;
  _state.panX = 0;
  _state.panY = 0;
  _applyTransform(true);
}

export function fitDiagram() {
  if (!_canvas || !_viewport) return;
  const svg = _canvas.querySelector('svg');
  if (!svg) return;

  const vpRect = _viewport.getBoundingClientRect();
  const bbox = svg.getBoundingClientRect();
  if (!bbox.width || !bbox.height) return;

  // Reset pan first
  _state.panX = 0;
  _state.panY = 0;
  _state.zoom = 1;
  _applyTransform(false);

  // Calculate scale to fit
  const svgNaturalW = svg.viewBox.baseVal.width || bbox.width;
  const svgNaturalH = svg.viewBox.baseVal.height || bbox.height;

  const scaleX = (vpRect.width * 0.9) / svgNaturalW;
  const scaleY = (vpRect.height * 0.9) / svgNaturalH;
  const newZoom = Math.min(Math.min(scaleX, scaleY), MAX_ZOOM);

  setZoom(newZoom, true);
}

export function setZoom(level, animate = true) {
  _state.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, level));
  _applyTransform(animate);
  _updateZoomLabel();
}

export function getZoom() { return _state.zoom; }

function _updateZoomLabel() {
  const el = document.getElementById('zoom-label');
  if (el) el.textContent = `${Math.round(_state.zoom * 100)}%`;
}

/* ── Pan ─────────────────────────────────────────────────────── */

function _applyTransform(animate = false) {
  if (!_canvas) return;
  if (animate) {
    _canvas.classList.add('animating');
    setTimeout(() => _canvas.classList.remove('animating'), 280);
  }
  _canvas.style.transform =
    `translate(calc(-50% + ${_state.panX}px), calc(-50% + ${_state.panY}px)) scale(${_state.zoom})`;
}

function _onPointerDown(e) {
  if (e.button !== 0 && e.button !== 1) return;
  if (e.target.closest('.node, .actor, .entityBox, .statediagram-state')) return;
  _state.isPanning = true;
  _state.lastX = e.clientX;
  _state.lastY = e.clientY;
  _state.velX = 0;
  _state.velY = 0;
  _viewport.classList.add('panning');
  if (_state.kineticRaf) cancelAnimationFrame(_state.kineticRaf);
}

function _onPointerMove(e) {
  if (!_state.isPanning) return;
  const dx = e.clientX - _state.lastX;
  const dy = e.clientY - _state.lastY;
  _state.velX = dx;
  _state.velY = dy;
  _state.panX += dx;
  _state.panY += dy;
  _state.lastX = e.clientX;
  _state.lastY = e.clientY;
  _applyTransform(false);
}

function _onPointerUp() {
  if (!_state.isPanning) return;
  _state.isPanning = false;
  _viewport.classList.remove('panning');
  _startKinetic();
}

function _startKinetic() {
  const step = () => {
    if (Math.abs(_state.velX) < 0.3 && Math.abs(_state.velY) < 0.3) return;
    _state.velX *= KINETIC_FRICTION;
    _state.velY *= KINETIC_FRICTION;
    _state.panX += _state.velX;
    _state.panY += _state.velY;
    _applyTransform(false);
    _state.kineticRaf = requestAnimationFrame(step);
  };
  _state.kineticRaf = requestAnimationFrame(step);
}

function _onWheel(e) {
  e.preventDefault();
  const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;

  // Zoom towards the mouse pointer position
  const rect = _viewport.getBoundingClientRect();
  const mouseX = e.clientX - rect.left - rect.width / 2;
  const mouseY = e.clientY - rect.top - rect.height / 2;

  const prevZoom = _state.zoom;
  const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prevZoom + delta));
  const ratio = newZoom / prevZoom - 1;

  _state.panX -= mouseX * ratio;
  _state.panY -= mouseY * ratio;
  _state.zoom = newZoom;
  _applyTransform(false);
  _updateZoomLabel();
}

/* ── Touch support ───────────────────────────────────────────── */

let _touchDist = 0;
let _touchZoom0 = 1;

function _onTouchStart(e) {
  if (e.touches.length === 2) {
    _touchDist = _pinchDist(e.touches);
    _touchZoom0 = _state.zoom;
    e.preventDefault();
  } else if (e.touches.length === 1) {
    _state.isPanning = true;
    _state.lastX = e.touches[0].clientX;
    _state.lastY = e.touches[0].clientY;
    _state.velX = 0;
    _state.velY = 0;
    _viewport.classList.add('panning');
  }
}

function _onTouchMove(e) {
  if (e.touches.length === 2) {
    e.preventDefault();
    const dist = _pinchDist(e.touches);
    const scale = dist / _touchDist;
    setZoom(_touchZoom0 * scale, false);
  } else if (e.touches.length === 1 && _state.isPanning) {
    const dx = e.touches[0].clientX - _state.lastX;
    const dy = e.touches[0].clientY - _state.lastY;
    _state.velX = dx;
    _state.velY = dy;
    _state.panX += dx;
    _state.panY += dy;
    _state.lastX = e.touches[0].clientX;
    _state.lastY = e.touches[0].clientY;
    _applyTransform(false);
  }
}

function _onTouchEnd() {
  _state.isPanning = false;
  _viewport.classList.remove('panning');
  _startKinetic();
}

function _pinchDist(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

/* ── Main initialiser ────────────────────────────────────────── */

/**
 * Bind the preview to DOM elements and set up all event listeners.
 * @param {{
 *   viewport: HTMLElement,
 *   canvas: HTMLElement,
 *   onNodeClick: (lineNumber: number|null, nodeId: string) => void
 * }} options
 */
export function initPreview({ viewport, canvas, onNodeClick }) {
  _viewport = viewport;
  _canvas = canvas;
  _onNodeClick = onNodeClick;

  // Mouse events
  viewport.addEventListener('pointerdown', _onPointerDown);
  window.addEventListener('pointermove', _onPointerMove);
  window.addEventListener('pointerup', _onPointerUp);
  viewport.addEventListener('wheel', _onWheel, { passive: false });

  // Touch events
  viewport.addEventListener('touchstart', _onTouchStart, { passive: false });
  viewport.addEventListener('touchmove', _onTouchMove, { passive: false });
  viewport.addEventListener('touchend', _onTouchEnd);

  _updateZoomLabel();
}

/* ── Export helpers ──────────────────────────────────────────── */

/**
 * Export the current diagram SVG as a downloadable file.
 * Uses the last successfully rendered SVG string so the export is never stale.
 * @param {string} filename
 */
export function exportSvg(filename = 'diagram.svg') {
  // Prefer _lastSvg (the raw Mermaid output) so the export is never stale due
  // to an in-flight async render. Parse it and re-apply explicit pixel dimensions
  // from the viewBox so the downloaded file has correct intrinsic size.
  if (_lastSvg) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(_lastSvg, 'image/svg+xml');
    const svgEl = doc.documentElement;
    if (svgEl && svgEl.tagName.toLowerCase() === 'svg') {
      const vb = svgEl.viewBox && svgEl.viewBox.baseVal;
      if (vb && vb.width > 0 && vb.height > 0) {
        svgEl.setAttribute('width',  vb.width);
        svgEl.setAttribute('height', vb.height);
      }
      const blob = new Blob([new XMLSerializer().serializeToString(svgEl)], { type: 'image/svg+xml' });
      _download(blob, filename);
      return;
    }
  }
  // Fallback: read directly from the live DOM canvas.
  const svg = _canvas && _canvas.querySelector('svg');
  if (!svg) return;
  const blob = new Blob([svg.outerHTML], { type: 'image/svg+xml' });
  _download(blob, filename);
}

/**
 * Export the current diagram as a PNG (via canvas).
 * @param {string} filename
 * @param {{ blackAndWhite?: boolean, onError?: (msg: string) => void }} [options]
 */
export function exportPng(filename = 'diagram.png', options = {}) {
  const svg = _canvas && _canvas.querySelector('svg');
  if (!svg) return;

  // Clone so we don't mutate the live SVG
  const svgClone = svg.cloneNode(true);

  // Ensure the xmlns attribute is present for correct blob serialization
  if (!svgClone.getAttribute('xmlns')) {
    svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  }

  // Strip <foreignObject> elements: Chrome/Firefox refuse to draw SVGs containing
  // <foreignObject> onto a canvas (they taint it, causing toBlob() to return null).
  // Replace each one with a plain SVG <text> centred in the same bounding box so
  // labels still appear in the PNG output.
  svgClone.querySelectorAll('foreignObject').forEach((fo) => {
    const x  = parseFloat(fo.getAttribute('x')      || '0');
    const y  = parseFloat(fo.getAttribute('y')      || '0');
    const w  = parseFloat(fo.getAttribute('width')  || '0');
    const h  = parseFloat(fo.getAttribute('height') || '0');
    const label = fo.textContent.trim();
    if (label) {
      const textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      textEl.setAttribute('x', x + w / 2);
      textEl.setAttribute('y', y + h / 2);
      textEl.setAttribute('text-anchor', 'middle');
      textEl.setAttribute('dominant-baseline', 'middle');
      textEl.setAttribute('font-family', "Inter,'Segoe UI',system-ui,sans-serif");
      textEl.setAttribute('font-size', '14');
      textEl.setAttribute('fill', 'currentColor');
      textEl.textContent = label;
      fo.parentNode.replaceChild(textEl, fo);
    } else {
      fo.remove();
    }
  });

  // Derive explicit pixel dimensions — fall back to viewBox, then safe defaults.
  // naturalWidth/naturalHeight on the Image can be 0 when the SVG has no units,
  // so we record the intended size here and use it as a fallback below.
  const vb = svg.viewBox.baseVal;
  const svgW = parseFloat(svg.getAttribute('width'))  || vb.width  || 800;
  const svgH = parseFloat(svg.getAttribute('height')) || vb.height || 600;
  svgClone.setAttribute('width',  svgW);
  svgClone.setAttribute('height', svgH);

  const svgStr  = new XMLSerializer().serializeToString(svgClone);
  const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const url     = URL.createObjectURL(svgBlob);

  const img = new Image();
  img.onerror = () => {
    URL.revokeObjectURL(url);
    const msg = 'PNG export failed: could not render diagram to image.';
    console.error('[Sirens] exportPng:', msg);
    if (typeof options.onError === 'function') options.onError(msg);
  };
  img.onload = () => {
    const SCALE = 3; // 3× for high-DPI
    // naturalWidth may be 0 when the browser can't infer SVG intrinsic size
    const naturalW = img.naturalWidth  || svgW;
    const naturalH = img.naturalHeight || svgH;

    const canvas = document.createElement('canvas');
    canvas.width  = naturalW * SCALE;
    canvas.height = naturalH * SCALE;
    const ctx = canvas.getContext('2d');
    ctx.scale(SCALE, SCALE);

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, naturalW, naturalH);
    ctx.drawImage(img, 0, 0, naturalW, naturalH);

    // Optional grayscale / B&W conversion (pixel-level, reliable cross-browser)
    if (options.blackAndWhite) {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
        data[i] = data[i + 1] = data[i + 2] = gray;
      }
      ctx.putImageData(imageData, 0, 0);
    }

    URL.revokeObjectURL(url);

    canvas.toBlob((blob) => {
      if (!blob) {
        const msg = 'PNG export failed: canvas could not be converted (possible security restriction).';
        console.error('[Sirens] exportPng:', msg);
        if (typeof options.onError === 'function') options.onError(msg);
        return;
      }
      _download(blob, filename);
    }, 'image/png');
  };
  img.src = url;
}

/**
 * Export the mermaid source as a .mmd text file.
 * @param {string} source
 * @param {string} filename
 */
export function exportMmd(source, filename = 'diagram.mmd') {
  const blob = new Blob([source], { type: 'text/plain' });
  _download(blob, filename);
}

function _download(blob, filename) {
  if (!blob) {
    console.error('[Sirens] _download: blob is null — download aborted');
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  // Appending to the document guarantees click() triggers a download in all
  // major browsers (including Firefox which ignores detached-anchor clicks).
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

function _escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
