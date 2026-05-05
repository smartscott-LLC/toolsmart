/* ============================================================
   Sirens — Main App Module
   Orchestrates all modules, handles global keyboard shortcuts,
   and manages top-level UI state.
   ============================================================ */

import { createEditor, detectDiagramType }    from './editor.js';
import { initPreview, renderDiagram,
         initMermaid, zoomIn, zoomOut,
         resetView, fitDiagram,
         exportSvg, exportPng, exportMmd }    from './preview.js';
import { initSmartBar, openSmartBar,
         closeSmartBar }                       from './smartbar.js';
import { initVault, isVaultAvailable,
         listFiles, saveFile, loadFile,
         deleteFile, getStorageEstimate,
         getAllocationCap, setAllocationCap,
         formatBytes, getLastOpenedFile,
         setLastOpenedFile }                   from './vault.js';
import { APP_THEMES, MERMAID_THEMES,
         applyAppTheme, applyMermaidTheme,
         applyCustomCss, restoreThemeSettings,
         getCurrentAppTheme,
         getCurrentMermaidTheme,
         getCustomCss }                        from './themes.js';

/* ── State ──────────────────────────────────────────────────── */

const state = {
  currentFile: null,        // name without extension, or null
  isDirty: false,
  vaultAvailable: false,
  isWelcomeSeed: false,     // true while the untouched starter seed is showing
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
    state.isWelcomeSeed = true;
    editor.setValue(
`%%{ init: { 'theme': 'base', 'themeVariables': {
  'primaryColor': '#1e3922', 'primaryTextColor': '#ddd0b0',
  'primaryBorderColor': '#c25e07', 'lineColor': '#7b2f00',
  'secondaryColor': '#e1d9c4', 'background': '#e1d9c4'
}}}%%
graph TD
    classDef evergreen fill:#1e3922,stroke:#c25e07,stroke-width:2px,color:#ddd0b0
    classDef caramel   fill:#c25e07,stroke:#7b2f00,stroke-width:2px,color:#fff
    classDef bone      fill:#e1d9c4,stroke:#c8bea4,stroke-width:1px,color:#1e3922
    classDef muted     fill:#ddd0b0,stroke:#c8bea4,stroke-width:1px,color:#6b6560,stroke-dasharray:4 4

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

function handleEditorChange(value) {
  // While the untouched Starter Seed is showing, don't mark it dirty or persist it.
  // The moment the user edits anything, clear the flag and behave normally.
  if (state.isWelcomeSeed) {
    state.isWelcomeSeed = false;
    // Render it but do not save or set dirty
    renderDiagram(value, {
      onError:   (errors) => { editor.setErrors(errors); updateStatus('error', `Parse error on line ${errors[0]?.line || '?'}`); },
      onSuccess: () => { editor.setErrors([]); updateStatus('ok', 'Diagram OK'); },
    });
    return;
  }

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

/* ── SmartBar ────────────────────────────────────────────────── */

function initSmartBarPanel() {
  initSmartBar({
    overlay:   $('smartbar-overlay'),
    input:     $('smartbar-input'),
    results:   $('smartbar-results'),
    onAction:  handleSmartBarAction,
    onSnippet: handleSnippetInsert,
  });
}

function handleSmartBarAction(actionId) {
  switch (actionId) {
    case 'new-file':      newDiagram();                  break;
    case 'save-file':     saveDiagram();                 break;
    case 'open-vault':    openVaultModal();               break;
    case 'export-svg':    exportSvg(`${getFileName()}.svg`); break;
    case 'export-png':    exportPng(`${getFileName()}.png`); break;
    case 'export-mmd':    exportMmd(editor.getValue(), `${getFileName()}.mmd`); break;
    case 'fit-diagram':   fitDiagram();                  break;
    case 'zoom-in':       zoomIn();                      break;
    case 'zoom-out':      zoomOut();                     break;
    case 'reset-view':    resetView();                   break;
    case 'open-themes':   toggleStyleSidebar();          break;
    case 'open-vault-modal': openVaultModal();           break;
  }
}

function handleSnippetInsert(snippet) {
  if (!editor) return;
  editor.setValue(snippet.code);
  // Trigger re-render
  handleEditorChange(snippet.code);
  editor.cm.focus();
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
    $('vault-file-list').innerHTML = `<div class="vault-empty">⚠️ OPFS not available in this browser.<br>Use Chrome, Edge or a Chromium-based browser.</div>`;
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
        <button class="vault-file-btn is-open" data-action="open" data-name="${_escHtml(f.name)}">Open</button>
        <button class="vault-file-btn" data-action="delete" data-name="${_escHtml(f.name)}">Delete</button>
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
      } else if (action === 'delete') {
        if (confirm(`Delete "${name}"? This cannot be undone.`)) {
          await deleteFile(name);
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

async function openDiagramFromVault(name) {
  try {
    const content = await loadFile(name);
    state.currentFile = name;
    state.isDirty = false;
    updateFileNameInput(name);
    setLastOpenedFile(name);
    editor.setValue(content);
    handleEditorChange(content);
    updateDirtyIndicator();
    updateStatus('ok', `Opened "${name}"`);
  } catch (err) {
    alert(`Failed to open "${name}": ${err.message}`);
  }
}

/* ── Save ────────────────────────────────────────────────────── */

async function saveDiagram() {
  if (!state.vaultAvailable) {
    alert('OPFS is not available in this browser. Use Chrome or Edge to enable local storage.');
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
    applyMermaidTheme(select.value, () => {
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
    switch (fmt) {
      case 'svg': exportSvg(`${name}.svg`);  break;
      case 'png': exportPng(`${name}.png`);  break;
      case 'mmd': exportMmd(editor.getValue(), `${name}.mmd`); break;
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
}

/* ── PWA Install Banner ──────────────────────────────────────── */

let _deferredInstallPrompt = null;

function initPwaInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    _deferredInstallPrompt = e;
    const banner = $('install-banner');
    if (banner) {
      setTimeout(() => banner.classList.add('show'), 3000);
    }
  });

  const installBtn = $('btn-install-pwa');
  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!_deferredInstallPrompt) return;
      await _deferredInstallPrompt.prompt();
      _deferredInstallPrompt = null;
      $('install-banner').classList.remove('show');
    });
  }

  const closeInstall = $('btn-close-install-banner');
  if (closeInstall) {
    closeInstall.addEventListener('click', () => {
      $('install-banner').classList.remove('show');
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
    const isMac = navigator.platform.startsWith('Mac');
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

    if (e.key === 'Escape') {
      closeSmartBar();
      closeVaultModal();
      closeExportModal();
    }
  });
}

/* ── Navbar Buttons ──────────────────────────────────────────── */

function initNavbarButtons() {
  $('btn-new').addEventListener('click', newDiagram);
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
  $('btn-vault-save').addEventListener('click', () => { closeVaultModal(); saveDiagram(); });

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

  // Init subsystems
  state.vaultAvailable = await initVault();
  initEditor();
  initPreviewPanel();
  initSmartBarPanel();
  initStyleSidebar();
  initExportModal();
  initResizeHandle();
  initNavbarButtons();
  initKeyboardShortcuts();
  initPwaInstall();

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

// Start the app
boot();
