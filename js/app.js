/* ============================================================
   Sirens — Main App Module
   Orchestrates all modules, handles global keyboard shortcuts,
   and manages top-level UI state.
   ============================================================ */

import { createEditor, detectDiagramType }    from './editor.js';
import { initPreview, renderDiagram,
         initMermaid, zoomIn, zoomOut,
         resetView, fitDiagram,
         exportSvg, exportPng, exportMmd,
         exportPdf, setThemeOverride }    from './preview.js';
import { initSmartBar, openSmartBar,
         closeSmartBar }                       from './smartbar.js';
import { initVault, isVaultAvailable,
         listFiles, saveFile, loadFile,
         deleteFile, renameFile, getStorageEstimate,
         getAllocationCap, setAllocationCap,
         formatBytes, getLastOpenedFile,
         setLastOpenedFile, getRecentFiles,
         addRecentFile, removeRecentFile }        from './vault.js';
import { APP_THEMES, MERMAID_THEMES,
         applyAppTheme, applyMermaidTheme,
         applyCustomCss, restoreThemeSettings,
         getCurrentAppTheme,
         getCurrentMermaidTheme,
         getCustomCss,
         BRAND_MERMAID_VARS }                from './themes.js';
import { initPresets }                         from './presets.js';
import { initCanvasEdit, toggleCanvasEdit,
         isEditMode, exitCanvasEdit,
         patchNodeLabel, patchDeleteNode,
         patchChangeNodeShape, patchAddNode,
         patchAddEdge, getSelectedNodeInfo,
         startConnectMode, renameSelected,
         SHAPE_CATALOGUE }                     from './canvas-edit.js';
import { initAIAssistant }                    from './ai-assistant.js';

/* ── State ──────────────────────────────────────────────────── */

const state = {
  currentFile: null,        // name without extension, or null
  isDirty: false,
  vaultAvailable: false,
};

/* ── DOM refs ────────────────────────────────────────────────── */

const $ = (id) => document.getElementById(id);

/* ── Editor ─────────────────────────────────────────────────── */

let editor = null;

function initEditor() {
  const container = $('editor-container');
  editor = createEditor(container, {
    onChange: handleEditorChange,
    onDiagramType: (type) => {
      const badge = $('diagram-type-badge');
      if (badge) badge.textContent = type;
    },
    debounceMs: 400,
  });

  // Load last-session content from localStorage
  const saved = localStorage.getItem('sirens-editor-content');
  if (saved) {
    editor.setValue(saved);
  } else {
    // Starter Seed — an elegant welcome flowchart shown on first visit.
    // Uses classDef to apply the brand palette so the diagram is immediately on-brand.
    editor.setValue(
`%%{ init: { 'theme': 'base', 'themeVariables': {
  'primaryColor': '#1e3922', 'primaryTextColor': '#ddd0b0',
  'primaryBorderColor': '#c25e07', 'lineColor': '#7b2f00',
  'secondaryColor': '#e1d9c4', 'secondaryTextColor': '#1e3922',
  'background': '#e1d9c4', 'titleColor': '#ddd0b0'
}}}%%
graph TD
    classDef evergreen fill:#1e3922,stroke:#c25e07,stroke-width:2px,color:#ddd0b0
    classDef caramel   fill:#c25e07,stroke:#7b2f00,stroke-width:2px,color:#fff
    classDef bone      fill:#e1d9c4,stroke:#c8bea4,stroke-width:1px,color:#1e3922
    classDef muted     fill:#ddd0b0,stroke:#c8bea4,stroke-width:1px,color:#1e3922,stroke-dasharray:4 4

    W(["⬡  ToolSmart · Sirens Studio"]):::evergreen

    W --> SM["⚡ SmartBar — press Cmd+K\nChoose from 12 diagram templates"]:::caramel
    W --> ED["✏️  Scripting Bay\nType Mermaid syntax · live hints appear"]:::bone
    W --> VT["🔒 Vault\nDiagrams saved locally — no server"]:::bone
    W --> TH["🎨 Style Studio\n4 themes · custom CSS injector"]:::muted

    SM --> GO(["Start creating — the canvas is yours"]):::evergreen
    ED --> GO
    VT --> GO
    TH --> GO`
    );
  }
}

// handleEditorChange is called by the editor's debounced onChange, which only
// fires for genuine user keystrokes (programmatic setValue() calls are excluded).
function handleEditorChange(value) {
  localStorage.setItem('sirens-editor-content', value);
  state.isDirty = true;
  updateDirtyIndicator();

  renderDiagram(value, {
    onError: (errors) => {
      editor.setErrors(errors);
      updateStatus('error', `Parse error on line ${errors[0]?.line || '?'}`);
    },
    onSuccess: () => {
      editor.setErrors([]);
      updateStatus('ok', 'Diagram OK');
    },
  });
}

/* ── Preview ─────────────────────────────────────────────────── */

function initPreviewPanel() {
  initPreview({
    viewport: $('preview-viewport'),
    canvas: $('preview-canvas'),
    onNodeClick: (lineNumber, nodeId) => {
      // In edit mode, clicks are consumed by canvas-edit — don't jump to line
      if (isEditMode()) return;
      if (lineNumber && editor) {
        editor.goToLine(lineNumber);
        updateStatus('ok', `Located node "${nodeId}" at line ${lineNumber}`);
      }
    },
  });

  $('btn-zoom-in').addEventListener('click', zoomIn);
  $('btn-zoom-out').addEventListener('click', zoomOut);
  $('btn-zoom-reset').addEventListener('click', resetView);
  $('btn-zoom-fit').addEventListener('click', fitDiagram);
}

// Start the app
boot();

/* ── Canvas Edit ─────────────────────────────────────────────── */

/* Auto-incrementing ID counter for new nodes */
let _nodeCounter = 1;
function _nextNodeId() { return `N${_nodeCounter++}`; }

function _rerender(source) {
  localStorage.setItem('sirens-editor-content', source);
  state.isDirty = true;
  updateDirtyIndicator();
  renderDiagram(source, {
    onError:   (errors) => { editor.setErrors(errors); updateStatus('error', `Parse error on line ${errors[0]?.line || '?'}`); },
    onSuccess: () => { editor.setErrors([]); updateStatus('ok', 'Diagram OK'); },
  });
}

function initCanvasEditPanel() {
  // Populate the shape picker in the canvas-edit toolbar
  const shapeSel = $('ce-shape-select');
  if (shapeSel) {
    SHAPE_CATALOGUE.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s.value;
      opt.textContent = s.label;
      shapeSel.appendChild(opt);
    });
  }

  initCanvasEdit({
    viewport: $('preview-viewport'),
    canvas:   $('preview-canvas'),

    // ── Rename label ────────────────────────────────────────────
    onLabelChange: (nodeId, oldLabel, newLabel) => {
      if (!editor) return;
      const source  = editor.getValue();
      const patched = patchNodeLabel(source, nodeId, oldLabel, newLabel);
      if (patched === source) {
        updateStatus('warning', `Could not locate label "${oldLabel}" in source`);
        return;
      }
      editor.setValue(patched);
      _rerender(patched);
      updateStatus('ok', `Renamed "${oldLabel}" → "${newLabel}"`);
    },

    // ── Delete node ──────────────────────────────────────────────
    onNodeDelete: (nodeId) => {
      if (!editor) return;
      const source  = editor.getValue();
      const patched = patchDeleteNode(source, nodeId);
      editor.setValue(patched);
      _rerender(patched);
      updateStatus('ok', `Deleted node "${nodeId}"`);
      _syncCeToolbarSelection(null, null);
    },

    // ── Change shape ─────────────────────────────────────────────
    onShapeChange: (nodeId, label, shapeOpt) => {
      if (!editor) return;
      const source  = editor.getValue();
      const patched = patchChangeNodeShape(source, nodeId, label, shapeOpt);
      if (patched === source) {
        updateStatus('warning', `Could not find node "${nodeId}" to reshape`);
        return;
      }
      editor.setValue(patched);
      _rerender(patched);
      updateStatus('ok', `Changed "${nodeId}" shape to ${shapeOpt.label}`);
    },

    // ── Add edge ─────────────────────────────────────────────────
    onEdgeAdd: (fromId, toId, edgeLabel, edgeStyle) => {
      if (!editor) return;
      const source  = editor.getValue();
      const patched = patchAddEdge(source, fromId, toId, edgeLabel, edgeStyle);
      editor.setValue(patched);
      _rerender(patched);
      updateStatus('ok', `Connected "${fromId}" → "${toId}"`);
    },

    // ── Node selected ────────────────────────────────────────────
    onNodeSelect: (nodeId, label) => {
      _syncCeToolbarSelection(nodeId, label);
    },

    // ── Node deselected ──────────────────────────────────────────
    onNodeDeselect: () => {
      _syncCeToolbarSelection(null, null);
    },
  });

  // ── Canvas-edit toggle button ────────────────────────────────
  const btn = $('btn-canvas-edit');
  const toolbar = $('canvas-edit-toolbar');
  if (btn) {
    btn.addEventListener('click', () => {
      const active = toggleCanvasEdit();
      btn.setAttribute('aria-pressed', String(active));
      btn.textContent = active ? '✏️ Editing' : '✏️ Edit';
      if (toolbar) toolbar.hidden = !active;
      updateStatus('ok', active
        ? 'Canvas Edit ON — click nodes to select, double-click to rename, right-click for menu'
        : 'Canvas Edit OFF');
      if (!active) _syncCeToolbarSelection(null, null);
    });
  }

  // ── Add Node button ──────────────────────────────────────────
  const addNodeBtn = $('btn-ce-add-node');
  if (addNodeBtn) {
    addNodeBtn.addEventListener('click', () => _openAddNodeModal());
  }

  // ── Connect button ───────────────────────────────────────────
  const connectBtn = $('btn-ce-connect');
  if (connectBtn) {
    connectBtn.addEventListener('click', () => {
      const sel = getSelectedNodeInfo();
      if (!sel) { updateStatus('warning', 'Select a node first, then click Connect'); return; }
      startConnectMode(sel.nodeId);
      updateStatus('ok', `Connect mode — click the target node to draw an edge from "${sel.nodeId}"`);
    });
  }

  // ── Rename button ────────────────────────────────────────────
  const renameBtn = $('btn-ce-rename');
  if (renameBtn) {
    renameBtn.addEventListener('click', () => renameSelected());
  }

  // ── Shape select ─────────────────────────────────────────────
  if (shapeSel) {
    shapeSel.addEventListener('change', () => {
      const sel = getSelectedNodeInfo();
      if (!sel) return;
      const shapeOpt = SHAPE_CATALOGUE.find(s => s.value === shapeSel.value);
      if (!shapeOpt || !editor) return;
      const source  = editor.getValue();
      const patched = patchChangeNodeShape(source, sel.nodeId, sel.label, shapeOpt);
      if (patched === source) { updateStatus('warning', `Could not find node to reshape`); return; }
      editor.setValue(patched);
      _rerender(patched);
      updateStatus('ok', `Changed shape to ${shapeOpt.label}`);
      shapeSel.value = '';
    });
  }

  // ── Delete button ─────────────────────────────────────────────
  const deleteBtn = $('btn-ce-delete');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      const sel = getSelectedNodeInfo();
      if (!sel) return;
      if (!confirm(`Delete node "${sel.label || sel.nodeId}" and all its connections?`)) return;
      const source  = editor.getValue();
      const patched = patchDeleteNode(source, sel.nodeId);
      editor.setValue(patched);
      _rerender(patched);
      updateStatus('ok', `Deleted node "${sel.nodeId}"`);
      _syncCeToolbarSelection(null, null);
    });
  }

  // ── Add-node modal confirm ────────────────────────────────────
  $('btn-add-node-ok').addEventListener('click', _confirmAddNode);
  $('btn-add-node-cancel').addEventListener('click', () => {
    $('add-node-modal').classList.remove('open');
  });
  const closeAddNode = $('btn-close-add-node');
  if (closeAddNode) closeAddNode.addEventListener('click', () => $('add-node-modal').classList.remove('open'));
  $('add-node-modal').addEventListener('click', (e) => {
    if (e.target === $('add-node-modal')) $('add-node-modal').classList.remove('open');
  });
  $('add-node-label').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); _confirmAddNode(); }
    if (e.key === 'Escape') $('add-node-modal').classList.remove('open');
  });
  // Populate shape picker in add-node modal
  const addShapeSel = $('add-node-shape');
  if (addShapeSel) {
    SHAPE_CATALOGUE.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s.value;
      opt.textContent = s.label;
      addShapeSel.appendChild(opt);
    });
  }
}

function _syncCeToolbarSelection(nodeId, label) {
  const info    = $('ce-selection-info');
  const rename  = $('btn-ce-rename');
  const shape   = $('ce-shape-select');
  const del     = $('btn-ce-delete');
  const connect = $('btn-ce-connect');
  const hasNode = !!nodeId;
  if (info)    info.textContent = hasNode ? `Selected: ${label || nodeId}` : 'Click a node to select';
  if (rename)  rename.disabled  = !hasNode;
  if (shape)   { shape.disabled = !hasNode; if (!hasNode) shape.value = ''; }
  if (del)     del.disabled     = !hasNode;
  if (connect) connect.disabled = !hasNode;
}

function _openAddNodeModal() {
  const sel = getSelectedNodeInfo();
  const connectCheck = $('add-node-connect');
  const connectRow   = $('add-node-connect-row');
  if (connectCheck && connectRow) {
    if (sel) {
      connectCheck.checked = true;
      connectRow.hidden    = false;
      const fromLabel = $('add-node-from-label');
      if (fromLabel) fromLabel.textContent = sel.label || sel.nodeId;
    } else {
      connectCheck.checked = false;
      connectRow.hidden    = true;
    }
  }
  const labelInput = $('add-node-label');
  if (labelInput) { labelInput.value = ''; }
  const shapeEl = $('add-node-shape');
  if (shapeEl) shapeEl.value = 'rect';
  $('add-node-modal').classList.add('open');
  requestAnimationFrame(() => labelInput && labelInput.focus());
}

function _confirmAddNode() {
  const labelInput = $('add-node-label');
  const newLabel   = (labelInput ? labelInput.value.trim() : '') || 'New Node';
  const shapeEl    = $('add-node-shape');
  const shapeOpt   = SHAPE_CATALOGUE.find(s => s.value === (shapeEl ? shapeEl.value : 'rect'))
                     || SHAPE_CATALOGUE[0];
  const connectCheck = $('add-node-connect');
  const edgeLabelEl  = $('add-node-edge-label');

  let fromId    = null;
  let edgeLabel = '';
  if (connectCheck && connectCheck.checked) {
    const sel = getSelectedNodeInfo();
    if (sel) { fromId = sel.nodeId; }
  }
  if (edgeLabelEl) edgeLabel = edgeLabelEl.value.trim();

  $('add-node-modal').classList.remove('open');

  if (!editor) return;
  const newId   = _nextNodeId();
  const source  = editor.getValue();
  const patched = patchAddNode(source, newId, newLabel, shapeOpt, fromId, edgeLabel);
  editor.setValue(patched);
  _rerender(patched);
  updateStatus('ok', `Added node "${newLabel}" (${newId})`);
}

/* ── Presets Panel ───────────────────────────────────────────── */

function initPresetsPanel() {
  const container = $('preset-panel');
  if (!container) return;
  initPresets({
    container,
    onInsert: (snippet) => handleSnippetInsert(snippet),
  });

  // Allow dragging a preset card and dropping onto the editor panel
  const editorPanel = $('editor-panel');
  if (editorPanel) {
    editorPanel.addEventListener('dragover', (e) => {
      if (e.dataTransfer.types.includes('application/sirens-snippet-id')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        editorPanel.classList.add('drop-target');
      }
    });
    editorPanel.addEventListener('dragleave', () => {
      editorPanel.classList.remove('drop-target');
    });
    editorPanel.addEventListener('drop', (e) => {
      editorPanel.classList.remove('drop-target');
      const snippetId = e.dataTransfer.getData('application/sirens-snippet-id');
      if (!snippetId) return;
      e.preventDefault();
      // Simulate a click on the matching preset card so initPresets' handler runs
      const card = document.querySelector(`.preset-card[data-id="${CSS.escape(snippetId)}"]`);
      if (card) card.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  }
}

function initSmartBarPanel() {
  initSmartBar({
    overlay:        $('smartbar-overlay'),
    input:          $('smartbar-input'),
    results:        $('smartbar-results'),
    onAction:       handleSmartBarAction,
    onSnippet:      handleSnippetInsert,
    getRecentFiles: () => (state.vaultAvailable ? getRecentFiles() : []),
    onRecentFile:   (name) => openDiagramFromVault(name),
  });
}

function handleSmartBarAction(actionId) {
  switch (actionId) {
    case 'new-file':      newDiagram();                  break;
    case 'save-file':     saveDiagram();                 break;
    case 'open-vault':    openVaultModal();               break;
    case 'export-svg':    exportSvg(`${getFileName()}.svg`); break;
    case 'export-png':    exportPng(`${getFileName()}.png`, { onError: (msg) => updateStatus('error', msg) }); break;
    case 'export-png-bw': exportPng(`${getFileName()}.png`, { blackAndWhite: true, onError: (msg) => updateStatus('error', msg) }); break;
    case 'export-pdf':    exportPdf(getFileName()); break;
    case 'export-mmd':    exportMmd(editor.getValue(), `${getFileName()}.mmd`); break;
    case 'fit-diagram':   fitDiagram();                  break;
    case 'zoom-in':       zoomIn();                      break;
    case 'zoom-out':      zoomOut();                     break;
    case 'reset-view':    resetView();                   break;
    case 'open-themes':   toggleStyleSidebar();          break;
  }
}

function handleSnippetInsert(snippet) {
  if (!editor) return;

  // Insert the preset code at the current cursor position.
  // replaceRange with a single position inserts without overwriting any content.
  editor.cm.replaceRange(snippet.code, editor.cm.getCursor());
  editor.cm.focus();
  updateStatus('ok', `Inserted "${snippet.label}"`);
}

let _pendingSnippet = null;

function _getDiagramRootType(code) {
  const first = code.trim().split('\n')[0].trim().toLowerCase();
  if (first.startsWith('graph ') || first.startsWith('flowchart ')) return 'graph';
  return first.split(/[\s{]/)[0];
}

function _canMergeSnippet(existing, snippetCode) {
  return _getDiagramRootType(existing) === 'graph' &&
         _getDiagramRootType(snippetCode) === 'graph';
}

function _appendSnippetNodes(existing, snippetCode) {
  // Skip the first line of the snippet (the "graph TD" header) and append the rest
  const snippetLines = snippetCode.trim().split('\n');
  const body = snippetLines.slice(1).join('\n');
  return existing.trimEnd() + '\n' + body;
}

function _applySnippet(code) {
  editor.setValue(code);
  localStorage.setItem('sirens-editor-content', code);
  state.isDirty = true;
  updateDirtyIndicator();
  renderDiagram(code, {
    onError:   (errors) => { editor.setErrors(errors); updateStatus('error', `Parse error on line ${errors[0]?.line || '?'}`); },
    onSuccess: () => { editor.setErrors([]); updateStatus('ok', 'Diagram OK'); },
  });
  editor.cm.focus();
}

function initInsertChoiceModal() {
  $('btn-insert-append').addEventListener('click', () => {
    $('insert-choice-modal').classList.remove('open');
    if (!_pendingSnippet || !editor) return;
    const merged = _appendSnippetNodes(editor.getValue(), _pendingSnippet.code);
    _applySnippet(merged);
    updateStatus('ok', `Appended "${_pendingSnippet.label}" nodes to diagram`);
    _pendingSnippet = null;
  });

  $('btn-insert-replace').addEventListener('click', () => {
    $('insert-choice-modal').classList.remove('open');
    if (!_pendingSnippet) return;
    _applySnippet(_pendingSnippet.code);
    updateStatus('ok', `Replaced diagram with "${_pendingSnippet.label}"`);
    _pendingSnippet = null;
  });

  $('btn-insert-cancel').addEventListener('click', () => {
    $('insert-choice-modal').classList.remove('open');
    _pendingSnippet = null;
  });

  $('insert-choice-modal').addEventListener('click', (e) => {
    if (e.target === $('insert-choice-modal')) {
      $('insert-choice-modal').classList.remove('open');
      _pendingSnippet = null;
    }
  });
}

/* ── Vault Modal ─────────────────────────────────────────────── */

let _vaultFiles = [];

async function openVaultModal() {
  $('vault-modal').classList.add('open');
  await refreshVaultModal();
}

function closeVaultModal() {
  $('vault-modal').classList.remove('open');
}

async function refreshVaultModal() {
  // Storage stats
  const estimate = await getStorageEstimate();
  $('vault-stat-files').textContent  = '—';
  $('vault-stat-used').textContent   = formatBytes(estimate.used);
  $('vault-stat-quota').textContent  = formatBytes(estimate.quota);
  $('vault-usage-fill').style.width  = `${estimate.percent.toFixed(1)}%`;

  // Allocation slider
  const capMb = getAllocationCap() / (1024 * 1024);
  const slider = $('vault-allocation-slider');
  slider.value = capMb;
  $('vault-allocation-value').textContent = `${capMb} MB`;

  if (!state.vaultAvailable) {
    $('vault-file-list').innerHTML = `<div class="vault-empty">⚠️ OPFS not available in this browser.<br>Use Chrome, Edge, Firefox 111+, or Safari 16.4+.</div>`;
    return;
  }

  // File list
  _vaultFiles = await listFiles();
  $('vault-stat-files').textContent = _vaultFiles.length;
  renderVaultFileList(_vaultFiles);
}

function renderVaultFileList(files) {
  const list = $('vault-file-list');
  if (!files.length) {
    list.innerHTML = `<div class="vault-empty">📭 No diagrams saved yet.<br>Use <strong>Save to Vault</strong> to store your work locally.</div>`;
    return;
  }

  list.innerHTML = files.map((f) => `
    <div class="vault-file-item ${state.currentFile === f.name ? 'active' : ''}" data-name="${_escHtml(f.name)}">
      <span class="vault-file-icon">📄</span>
      <span class="vault-file-name">${_escHtml(f.name)}</span>
      <span class="vault-file-size">${formatBytes(f.size)}</span>
      <span class="vault-file-date">${_formatDate(f.lastModified)}</span>
      <span class="vault-file-actions">
        <button class="vault-file-btn is-open" data-action="open"   data-name="${_escHtml(f.name)}">Open</button>
        <button class="vault-file-btn"          data-action="rename" data-name="${_escHtml(f.name)}">Rename</button>
        <button class="vault-file-btn"          data-action="delete" data-name="${_escHtml(f.name)}">Delete</button>
      </span>
    </div>
  `).join('');

  list.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const name = btn.dataset.name;
      const action = btn.dataset.action;

      if (action === 'open') {
        await openDiagramFromVault(name);
        closeVaultModal();

      } else if (action === 'rename') {
        _startVaultRename(btn.closest('.vault-file-item'), name);

      } else if (action === 'delete') {
        if (confirm(`Delete "${name}"? This cannot be undone.`)) {
          await deleteFile(name);
          removeRecentFile(name);
          if (state.currentFile === name) {
            state.currentFile = null;
            updateFileNameInput('');
          }
          await refreshVaultModal();
        }
      }
    });
  });
}

/**
 * Replace the file-name span in a vault row with an inline rename input.
 * @param {HTMLElement} row
 * @param {string} currentName
 */
function _startVaultRename(row, currentName) {
  const nameSpan = row.querySelector('.vault-file-name');
  if (!nameSpan || row.querySelector('.vault-rename-input')) return; // already editing

  const originalText = nameSpan.textContent;
  nameSpan.style.display = 'none';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'vault-rename-input';
  input.value = currentName;
  input.setAttribute('aria-label', 'Rename diagram');
  row.insertBefore(input, nameSpan.nextSibling);
  input.select();

  async function commitRename() {
    const newName = input.value.trim();
    input.remove();
    nameSpan.style.display = '';
    if (!newName || newName === currentName) return;
    try {
      await renameFile(currentName, newName);
      // Update recents and current-file state if needed
      removeRecentFile(currentName);
      addRecentFile(newName);
      if (state.currentFile === currentName) {
        state.currentFile = newName;
        updateFileNameInput(newName);
        setLastOpenedFile(newName);
      }
      updateStatus('ok', `Renamed "${currentName}" → "${newName}"`);
      await refreshVaultModal();
    } catch (err) {
      alert(`Rename failed: ${err.message}`);
      await refreshVaultModal();
    }
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
    if (e.key === 'Escape') { input.remove(); nameSpan.style.display = ''; }
  });
  input.addEventListener('blur', commitRename);
}

async function openDiagramFromVault(name) {
  try {
    const content = await loadFile(name);
    state.currentFile = name;
    state.isDirty = false;
    updateFileNameInput(name);
    setLastOpenedFile(name);
    addRecentFile(name);
    editor.setValue(content);
    // Persist the loaded content and render it directly.
    // setValue() does not trigger the debounced onChange, so we handle it here.
    // Await the render so the canvas is always up-to-date before the caller
    // (e.g. vault modal close) returns — prevents stale-SVG export edge-cases.
    localStorage.setItem('sirens-editor-content', content);
    await renderDiagram(content, {
      onError:   (errors) => { editor.setErrors(errors); updateStatus('error', `Parse error on line ${errors[0]?.line || '?'}`); },
      onSuccess: () => { editor.setErrors([]); updateStatus('ok', 'Diagram OK'); },
    });
    updateDirtyIndicator();
    updateStatus('ok', `Opened "${name}"`);
  } catch (err) {
    alert(`Failed to open "${name}": ${err.message}`);
  }
}

/* ── Save ────────────────────────────────────────────────────── */

async function saveDiagram() {
  if (!state.vaultAvailable) {
    alert('OPFS is not available in this browser. Use Chrome, Edge, Firefox 111+, or Safari 16.4+ to enable local storage.');
    return;
  }

  const name = getFileName();
  if (!name) {
    alert('Please enter a file name in the header bar before saving.');
    $('file-name-input').focus();
    return;
  }

  try {
    await saveFile(name, editor.getValue());
    state.currentFile = name;
    state.isDirty = false;
    setLastOpenedFile(name);
    addRecentFile(name);
    updateDirtyIndicator();
    updateStatus('ok', `Saved "${name}" to Vault`);
  } catch (err) {
    alert(`Save failed: ${err.message}`);
  }
}

/* ── New Diagram ─────────────────────────────────────────────── */

function newDiagram() {
  if (state.isDirty && !confirm('Discard unsaved changes and start a new diagram?')) return;
  state.currentFile = null;
  state.isDirty = false;
  updateFileNameInput('untitled');
  setLastOpenedFile(null);
  editor.setValue('');
  localStorage.removeItem('sirens-editor-content');
  // Render the empty state directly — setValue won't trigger the debounced onChange.
  renderDiagram('', {
    onError:   (errors) => editor.setErrors(errors),
    onSuccess: () => editor.setErrors([]),
  });
  updateDirtyIndicator();
  updateStatus('ok', 'New diagram');
}

/* ── Style Sidebar ───────────────────────────────────────────── */

function toggleStyleSidebar() {
  const sidebar = $('style-sidebar');
  sidebar.classList.toggle('open');
  const btn = $('btn-styles');
  if (btn) btn.setAttribute('aria-pressed', sidebar.classList.contains('open'));
}

function initStyleSidebar() {
  // Build theme cards
  const grid = $('theme-card-grid');
  APP_THEMES.forEach((theme) => {
    const card = document.createElement('div');
    card.className = 'theme-card';
    card.dataset.themeId = theme.id;
    card.innerHTML = `
      <div class="theme-card-preview" style="background:${theme.preview}"></div>
      <div class="theme-card-label">${theme.label}</div>
    `;
    card.addEventListener('click', () => {
      applyAppTheme(theme.id);
      grid.querySelectorAll('.theme-card').forEach((c) => c.classList.remove('active'));
      card.classList.add('active');
    });
    grid.appendChild(card);
  });

  // Build mermaid theme select
  const select = $('mermaid-theme-select');
  MERMAID_THEMES.forEach((t) => {
    const opt = document.createElement('option');
    opt.value = t.value;
    opt.textContent = t.label;
    select.appendChild(opt);
  });

  select.addEventListener('change', () => {
    const theme = select.value;
    const vars  = theme === 'base' ? BRAND_MERMAID_VARS : {};
    setThemeOverride(theme, vars);
    applyMermaidTheme(theme, () => {
      const val = editor ? editor.getValue() : '';
      renderDiagram(val, {
        onError: (errors) => editor && editor.setErrors(errors),
        onSuccess: () => editor && editor.setErrors([]),
      });
    });
  });

  // CSS Injector
  const applyBtn = $('btn-apply-css');
  const cssArea  = $('css-injector-area');
  applyBtn.addEventListener('click', () => {
    applyCustomCss(cssArea.value);
    updateStatus('ok', 'Custom CSS applied');
  });
}

function syncStyleSidebarState({ appTheme, mermaidTheme, customCss }) {
  // Mark active theme card
  document.querySelectorAll('.theme-card').forEach((card) => {
    card.classList.toggle('active', card.dataset.themeId === appTheme);
  });
  // Set mermaid theme select
  const select = $('mermaid-theme-select');
  if (select) select.value = mermaidTheme;
  // Set CSS textarea
  const cssArea = $('css-injector-area');
  if (cssArea) cssArea.value = customCss;
}

/* ── Export Modal ────────────────────────────────────────────── */

function openExportModal() {
  $('export-modal').classList.add('open');
  // Reset B&W option
  const bwCheck = $('export-bw-check');
  if (bwCheck) bwCheck.checked = false;
  // Select first card by default
  const first = document.querySelector('.export-card');
  if (first) selectExportCard(first);
}

function closeExportModal() {
  $('export-modal').classList.remove('open');
}

function selectExportCard(card) {
  document.querySelectorAll('.export-card').forEach((c) => c.classList.remove('selected'));
  card.classList.add('selected');
  // Show B&W option only for PNG
  const bwRow = $('export-bw-row');
  if (bwRow) bwRow.style.display = card.dataset.format === 'png' ? '' : 'none';
}

function initExportModal() {
  $('export-modal').querySelectorAll('.export-card').forEach((card) => {
    card.addEventListener('click', () => selectExportCard(card));
  });

  $('btn-do-export').addEventListener('click', () => {
    const selected = document.querySelector('.export-card.selected');
    if (!selected) return;
    const fmt = selected.dataset.format;
    const name = getFileName();
    const bw = $('export-bw-check') ? $('export-bw-check').checked : false;
    switch (fmt) {
      case 'svg': exportSvg(`${name}.svg`);                                                             break;
      case 'png': exportPng(`${name}.png`, { blackAndWhite: bw, onError: (msg) => updateStatus('error', msg) }); break;
      case 'pdf': exportPdf(name);                                                                       break;
      case 'mmd': exportMmd(editor.getValue(), `${name}.mmd`);     break;
    }
    closeExportModal();
  });
}

/* ── Resize handle ───────────────────────────────────────────── */

function initResizeHandle() {
  const handle       = $('resize-handle');
  const editorPanel  = $('editor-panel');
  const appBody      = $('app-body');
  let dragging = false;
  let startX = 0;
  let startWidth = 0;

  handle.addEventListener('pointerdown', (e) => {
    dragging = true;
    startX = e.clientX;
    startWidth = editorPanel.offsetWidth;
    handle.classList.add('dragging');
    handle.setPointerCapture(e.pointerId);
  });

  handle.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const newWidth = Math.max(240, Math.min(startWidth + dx, appBody.offsetWidth - 240));
    editorPanel.style.width = `${newWidth}px`;
  });

  handle.addEventListener('pointerup', () => {
    dragging = false;
    handle.classList.remove('dragging');
  });

  // Keyboard accessibility: arrow keys adjust panel width in 20px steps
  handle.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 80 : 20;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const newWidth = Math.max(240, editorPanel.offsetWidth - step);
      editorPanel.style.width = `${newWidth}px`;
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      const newWidth = Math.min(appBody.offsetWidth - 240, editorPanel.offsetWidth + step);
      editorPanel.style.width = `${newWidth}px`;
    }
  });
}

/* ── PWA Install Banner ──────────────────────────────────────── */

let _deferredInstallPrompt = null;

/**
 * Detect whether the user is on iOS (iPhone/iPad) or macOS Safari.
 * These browsers do not fire `beforeinstallprompt` and require the
 * native "Add to Home Screen" flow instead.
 */
function _isSafari() {
  const ua = navigator.userAgent;
  // iOS Safari (iPhone, iPad, iPod) or macOS Safari (not Chrome/Edge/Firefox)
  return /iP(hone|ad|od)/.test(ua) ||
    (/Safari\//.test(ua) && !/Chrome\/|Chromium\/|EdgA?\/|OPR\/|Firefox\//.test(ua));
}

function _isInStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    navigator.standalone === true;
}

function initPwaInstall() {
  // Already installed — don't show the banner
  if (_isInStandaloneMode()) return;

  const banner     = $('install-banner');
  const bannerText = banner ? banner.querySelector('.install-banner-text') : null;
  const installBtn = $('btn-install-pwa');
  const closeBtn   = $('btn-close-install-banner');

  if (_isSafari()) {
    // Safari (iOS + macOS) doesn't fire beforeinstallprompt.
    // Show Add-to-Home-Screen guidance after a short delay.
    if (banner && bannerText) {
      const isIos = /iP(hone|ad|od)/.test(navigator.userAgent);
      bannerText.innerHTML = isIos
        ? '<strong>Install Sirens</strong>Tap <strong>Share ⎙</strong> then <em>Add to Home Screen</em>'
        : '<strong>Install Sirens</strong>Open <strong>File → Add to Dock</strong> in Safari';
      // Hide the native install button — there's nothing to prompt
      if (installBtn) installBtn.style.display = 'none';
      setTimeout(() => banner.classList.add('show'), 4000);
    }
  } else {
    // Chrome, Edge, Samsung Internet, Android WebView — use the deferred prompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      _deferredInstallPrompt = e;
      if (banner) setTimeout(() => banner.classList.add('show'), 3000);
    });

    if (installBtn) {
      installBtn.addEventListener('click', async () => {
        if (!_deferredInstallPrompt) return;
        await _deferredInstallPrompt.prompt();
        _deferredInstallPrompt = null;
        if (banner) banner.classList.remove('show');
      });
    }

    // Hide install button on successful install
    window.addEventListener('appinstalled', () => {
      if (banner) banner.classList.remove('show');
      _deferredInstallPrompt = null;
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      if (banner) banner.classList.remove('show');
    });
  }
}

/* ── Service Worker ──────────────────────────────────────────── */

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // SW registration is optional — app works without it
    });
  }
}

/* ── Status Bar ──────────────────────────────────────────────── */

function updateStatus(level, message) {
  const dot  = $('status-dot');
  const text = $('status-text');
  if (!dot || !text) return;
  dot.className = 'status-dot' + (level === 'error' ? ' error' : level === 'warning' ? ' warning' : '');
  text.textContent = message;
}

function updateDirtyIndicator() {
  const indicator = $('dirty-indicator');
  if (indicator) {
    indicator.textContent = state.isDirty ? '●' : '';
    indicator.title = state.isDirty ? 'Unsaved changes' : '';
  }
}

function updateFileNameInput(name) {
  const input = $('file-name-input');
  if (input) input.value = name || '';
}

function getFileName() {
  const input = $('file-name-input');
  return (input ? input.value.trim() : '') || state.currentFile || 'untitled';
}

/* ── Global Keyboard Shortcuts ───────────────────────────────── */

function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    const isMac = /Mac/.test(navigator.userAgent) && !/iPhone|iPad|iPod/.test(navigator.userAgent);
    const ctrl  = isMac ? e.metaKey : e.ctrlKey;

    if (ctrl && e.key === 'k') {
      e.preventDefault();
      openSmartBar();
      return;
    }

    if (ctrl && e.key === 's') {
      e.preventDefault();
      saveDiagram();
      return;
    }

    if (ctrl && e.key === 'n') {
      e.preventDefault();
      newDiagram();
      return;
    }

    if (ctrl && e.key === 'e') {
      e.preventDefault();
      openExportModal();
      return;
    }

    // Undo / Redo — handled by CodeMirror when the editor is focused;
    // this fallback fires when the editor does not have focus.
    if (ctrl && e.key === 'z' && !e.shiftKey) {
      const active = document.activeElement;
      if (!active || !active.closest('.CodeMirror')) {
        e.preventDefault();
        if (editor) editor.undo();
        return;
      }
    }

    if (ctrl && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
      const active = document.activeElement;
      if (!active || !active.closest('.CodeMirror')) {
        e.preventDefault();
        if (editor) editor.redo();
        return;
      }
    }

    if (e.key === 'Escape') {
      closeSmartBar();
      closeVaultModal();
      closeExportModal();
      $('insert-choice-modal').classList.remove('open');
      $('add-node-modal').classList.remove('open');
      _pendingSnippet = null;
    }
  });
}

/* ── Navbar Buttons ──────────────────────────────────────────── */

function initNavbarButtons() {
  $('btn-new').addEventListener('click', newDiagram);
  $('btn-undo').addEventListener('click', () => editor && editor.undo());
  $('btn-redo').addEventListener('click', () => editor && editor.redo());
  $('btn-save').addEventListener('click', saveDiagram);
  $('btn-export').addEventListener('click', openExportModal);
  $('btn-smartbar').addEventListener('click', openSmartBar);
  $('btn-vault').addEventListener('click', openVaultModal);
  $('btn-styles').addEventListener('click', toggleStyleSidebar);

  $('file-name-input').addEventListener('change', () => {
    state.currentFile = $('file-name-input').value.trim() || null;
  });

  // Vault modal buttons
  $('btn-close-vault').addEventListener('click', closeVaultModal);
  $('btn-vault-new').addEventListener('click', () => { closeVaultModal(); newDiagram(); });
  $('btn-vault-save').addEventListener('click', async () => { await saveDiagram(); closeVaultModal(); });

  // Vault allocation slider
  $('vault-allocation-slider').addEventListener('input', (e) => {
    const mb = parseInt(e.target.value, 10);
    $('vault-allocation-value').textContent = `${mb} MB`;
    setAllocationCap(mb);
  });

  // Export modal
  $('btn-close-export').addEventListener('click', closeExportModal);
  $('export-modal').addEventListener('click', (e) => {
    if (e.target === $('export-modal')) closeExportModal();
  });
  $('vault-modal').addEventListener('click', (e) => {
    if (e.target === $('vault-modal')) closeVaultModal();
  });
}

/* ── Boot ────────────────────────────────────────────────────── */

async function boot() {
  registerServiceWorker();

  // Initialise Mermaid (before editor so first render has correct theme)
  initMermaid('base');

  // Restore theme settings
  const savedThemeSettings = restoreThemeSettings(() => {
    if (editor) {
      renderDiagram(editor.getValue(), {
        onError: (errors) => editor.setErrors(errors),
        onSuccess: () => editor.setErrors([]),
      });
    }
  });

  // Apply the saved Mermaid theme override so any %%{init}%% block in the source
  // is overridden by the user's theme selection from the very first render.
  {
    const mt = savedThemeSettings.mermaidTheme || 'base';
    setThemeOverride(mt, mt === 'base' ? BRAND_MERMAID_VARS : {});
  }

  // Init subsystems
  state.vaultAvailable = await initVault();
  initEditor();
  initPreviewPanel();
  initCanvasEditPanel();
  initInsertChoiceModal();
  initSmartBarPanel();
  initStyleSidebar();
  initPresetsPanel();
  initExportModal();
  initResizeHandle();
  initNavbarButtons();
  initKeyboardShortcuts();
  initPwaInstall();
  initDragDrop();

  /* AI Assistant — floating orb/box */
  initAIAssistant({
    getEditorContent: () => editor ? editor.getValue() : '',
    setEditorContent: (code) => {
      if (!editor) return;
      editor.setValue(code);
      localStorage.setItem('sirens-editor-content', code);
      state.isDirty = true;
      updateDirtyIndicator();
      renderDiagram(code, {
        onError:   (errors) => { editor.setErrors(errors); updateStatus('error', `Parse error on line ${errors[0]?.line || '?'}`); },
        onSuccess: () => { editor.setErrors([]); updateStatus('ok', 'Diagram OK'); },
      });
    },
    updateStatus,
  });

  // Sync sidebar UI with restored settings
  syncStyleSidebarState(savedThemeSettings);

  // Load last file from vault if available
  if (state.vaultAvailable) {
    const lastFile = getLastOpenedFile();
    if (lastFile) {
      try {
        await openDiagramFromVault(lastFile);
      } catch (_) {
        // Ignore — file may have been deleted
      }
    }
  }

  // Initial render
  const initialContent = editor.getValue();
  if (initialContent.trim()) {
    renderDiagram(initialContent, {
      onError: (errors) => editor.setErrors(errors),
      onSuccess: () => editor.setErrors([]),
    });
  }

  // Update storage status in status bar
  if (state.vaultAvailable) {
    const est = await getStorageEstimate();
    const storageEl = $('status-storage');
    if (storageEl) storageEl.textContent = `Vault: ${formatBytes(est.used)} used`;
  }

  updateStatus('ok', state.vaultAvailable ? 'Vault ready — all data is local' : 'Running without Vault (OPFS unavailable)');

  // Handle URL action parameters (e.g. PWA shortcut: ?action=new)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('action') === 'new') {
    newDiagram();
    // Replace URL without the query string to keep the address bar clean
    history.replaceState(null, '', window.location.pathname);
  }
}

/* ── Drag-and-Drop Import ────────────────────────────────────── */

function initDragDrop() {
  const overlay = $('drop-overlay');

  // Prevent browser from navigating to the file on drop
  document.addEventListener('dragover', (e) => {
    if ([...e.dataTransfer.types].includes('Files')) {
      e.preventDefault();
      if (overlay) overlay.classList.add('active');
    }
  });

  document.addEventListener('dragleave', (e) => {
    // Only hide overlay when the pointer truly leaves the window
    if (!e.relatedTarget && overlay) {
      overlay.classList.remove('active');
    }
  });

  document.addEventListener('drop', async (e) => {
    e.preventDefault();
    if (overlay) overlay.classList.remove('active');

    const files = [...e.dataTransfer.files];
    const mmdFile = files.find(
      (f) =>
        f.name.toLowerCase().endsWith('.mmd') ||
        f.name.toLowerCase().endsWith('.txt') ||
        f.type === 'text/plain'
    );
    if (!mmdFile) {
      updateStatus('warning', 'Drop a .mmd or .txt file to open it');
      return;
    }

    if (state.isDirty && !confirm('Discard unsaved changes and open the dropped file?')) return;

    try {
      const text = await mmdFile.text();
      const nameWithoutExt = mmdFile.name.replace(/\.(mmd|txt)$/i, '');
      state.currentFile = null;           // dropped files aren't vault-managed yet
      state.isDirty = false;              // content hasn't been modified yet
      updateFileNameInput(nameWithoutExt);
      editor.setValue(text);
      // Persist and render directly — setValue won't trigger the debounced onChange.
      localStorage.setItem('sirens-editor-content', text);
      renderDiagram(text, {
        onError:   (errors) => { editor.setErrors(errors); updateStatus('error', `Parse error on line ${errors[0]?.line || '?'}`); },
        onSuccess: () => { editor.setErrors([]); updateStatus('ok', 'Diagram OK'); },
      });
      updateDirtyIndicator();
      updateStatus('ok', `Opened "${mmdFile.name}" from disk`);
    } catch (err) {
      updateStatus('error', `Drop failed: ${err.message}`);
    }
  });
}

/* ── Helpers ─────────────────────────────────────────────────── */

function _escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _formatDate(ts) {
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}


