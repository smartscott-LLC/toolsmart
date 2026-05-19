/* ============================================================
   Sirens — AI Assistant Module (Siren AI)
   Floating orb/box interface powered by OpenRouter.
   - Orb: 4 vw diameter, brand colours, draggable
   - Box: 20 vw × 30 vh, dark-green bg, rust border, cream text
   - Model: openai/gpt-5.2
   - API key stored in localStorage; user provides their own key
   ============================================================ */

const AI_KEY_STORE   = 'sirens-ai-api-key';
const AI_MODEL_STORE = 'sirens-ai-model';
const AI_POS_STORE   = 'sirens-ai-position';
const DEFAULT_MODEL  = 'openai/gpt-5.2';
const OPENROUTER_API = 'https://openrouter.ai/api/v1/chat/completions';

/* Inline Sirens icon (mermaid / siren branding) */
const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="80" fill="#1e3922"/>
  <text x="256" y="200" font-family="monospace" font-size="160" fill="#ddd0b0"
        text-anchor="middle" dominant-baseline="middle">⬡</text>
  <text x="256" y="340" font-family="monospace" font-size="90" fill="#c25e07"
        text-anchor="middle" dominant-baseline="middle">S</text>
  <circle cx="150" cy="340" r="18" fill="#c25e07"/>
  <circle cx="362" cy="340" r="18" fill="#c25e07"/>
  <line x1="168" y1="340" x2="220" y2="340" stroke="#ddd0b0" stroke-width="6"/>
  <line x1="292" y1="340" x2="344" y2="340" stroke="#ddd0b0" stroke-width="6"/>
</svg>`;

/* ── Module state ────────────────────────────────────────────── */

let _messages         = [];    // [{role, content}, …]
let _getEditorContent = null;
let _setEditorContent = null;  // (code: string) => void
let _updateStatus     = null;  // (level, msg) => void
let _isStreaming      = false;
let _expanded         = false;
let _showingSettings  = false;
let _didDrag          = false;
let _widget           = null;  // the root fixed-position div

/* ── HTML escaping ───────────────────────────────────────────── */

function _esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ── localStorage helpers ────────────────────────────────────── */

function _getApiKey() { return localStorage.getItem(AI_KEY_STORE) || ''; }
function _getModel()  { return localStorage.getItem(AI_MODEL_STORE) || DEFAULT_MODEL; }

function _loadPos() {
  try {
    const p = JSON.parse(localStorage.getItem(AI_POS_STORE) || 'null');
    if (p && typeof p.x === 'number' && typeof p.y === 'number') return p;
  } catch { /* ignore */ }
  return null;
}

function _savePos(x, y) {
  localStorage.setItem(AI_POS_STORE, JSON.stringify({ x, y }));
}

/* ── Position & drag ─────────────────────────────────────────── */

function _clamp(x, y) {
  const w = _widget.offsetWidth;
  const h = _widget.offsetHeight;
  return {
    x: Math.max(0, Math.min(x, window.innerWidth  - w)),
    y: Math.max(0, Math.min(y, window.innerHeight - h)),
  };
}

function _applyPos(x, y) {
  _widget.style.left   = `${x}px`;
  _widget.style.top    = `${y}px`;
  _widget.style.right  = 'auto';
  _widget.style.bottom = 'auto';
}

function _initDrag() {
  let dragging = false;
  let startX = 0, startY = 0;
  let originX = 0, originY = 0;

  _widget.addEventListener('pointerdown', (e) => {
    const tag = e.target.tagName.toLowerCase();
    /* Do not hijack clicks on interactive children */
    if (['button', 'input', 'textarea', 'a', 'select', 'label'].includes(tag)) return;
    if (e.target.closest('.ai-chat-messages')) return;

    dragging = true;
    _didDrag = false;
    startX   = e.clientX;
    startY   = e.clientY;
    originX  = _widget.offsetLeft;
    originY  = _widget.offsetTop;
    _widget.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  _widget.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) _didDrag = true;
    const { x, y } = _clamp(originX + dx, originY + dy);
    _applyPos(x, y);
  });

  _widget.addEventListener('pointerup', () => {
    if (!dragging) return;
    const wasDragging = _didDrag;
    dragging = false;
    _didDrag = false;
    _savePos(_widget.offsetLeft, _widget.offsetTop);
    /* Expand orb on tap/click (no drag occurred) */
    if (!wasDragging && !_expanded) {
      _expand();
    }
  });
}

/* ── OpenRouter API ──────────────────────────────────────────── */

function _buildSystemPrompt() {
  const code = _getEditorContent ? _getEditorContent() : '';
  return `You are Siren, an expert Mermaid diagram AI assistant embedded in Sirens — a local-first PWA Mermaid diagram studio. Help users create, edit, and understand Mermaid diagrams.

## Current diagram in the editor:
\`\`\`mermaid
${code || '(empty — no diagram yet)'}
\`\`\`

## Rules:
- Always wrap complete Mermaid diagrams in a \`\`\`mermaid code block so the user can click "Apply to Editor"
- Be concise and helpful; keep responses focused
- When rewriting a whole diagram provide the full valid Mermaid source
- For partial edits, describe which lines change

## Supported Mermaid diagram types:
flowchart/graph, sequenceDiagram, classDiagram, stateDiagram-v2, erDiagram, gantt, pie, gitGraph, mindmap, journey, quadrantChart, timeline, xychart-beta

## Sirens app features you may reference:
- SmartBar (⌘K / Ctrl+K): command palette for snippets, actions, file operations
- Vault: OPFS local file storage — diagrams never leave the device
- Canvas Edit (✏️ Edit button in preview): click nodes to rename, reshape, delete, or connect
- Style Studio (🎨 Style button): app themes, Mermaid diagram themes, custom CSS injector
- Export: SVG, PNG (3×), B&W PNG, raw .mmd file`;
}

async function _callAPI(userText, onChunk, onDone, onError) {
  const apiKey = _getApiKey();
  if (!apiKey) {
    onError('No API key configured — open settings (⚙️) to enter your OpenRouter key.');
    return;
  }

  _messages.push({ role: 'user', content: userText });

  const payload = {
    model: _getModel(),
    stream: true,
    messages: [
      { role: 'system', content: _buildSystemPrompt() },
      ..._messages,
    ],
  };

  let accumulated = '';

  try {
    const res = await fetch(OPENROUTER_API, {
      method: 'POST',
      headers: {
        'Authorization':  `Bearer ${apiKey}`,
        'Content-Type':   'application/json',
        'HTTP-Referer':   window.location.origin,
        'X-Title':        'Sirens Mermaid Studio',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      let msg;
      try {
        const json = JSON.parse(text);
        msg = json?.error?.message || text.slice(0, 200);
      } catch {
        msg = text.slice(0, 200);
      }
      if (res.status === 401) {
        msg = `OpenRouter 401 Unauthorized: ${msg}`;
      }
      throw new Error(`OpenRouter ${res.status}: ${msg}`);
    }

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();

    let streamError = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const raw   = decoder.decode(value, { stream: true });
      const lines = raw.split('\n');

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') break;
        try {
          const parsed = JSON.parse(data);
          /* Surface any error the API embeds inside the stream */
          if (parsed.error) {
            streamError = parsed.error.message || JSON.stringify(parsed.error);
            break;
          }
          const delta  = parsed.choices?.[0]?.delta?.content || '';
          if (delta) {
            accumulated += delta;
            onChunk(accumulated);
          }
        } catch { /* ignore malformed SSE frames */ }
      }

      if (streamError) break;
    }

    if (streamError) throw new Error(`OpenRouter stream error: ${streamError}`);

    _messages.push({ role: 'assistant', content: accumulated });
    onDone(accumulated);
  } catch (err) {
    /* Roll back the optimistically-added user message */
    _messages.pop();
    onError(err.message);
  }
}

/* ── Message rendering ───────────────────────────────────────── */

/**
 * Parse AI response text into an HTML string.
 * Code fences are wrapped in a block with Apply / Copy buttons.
 * All user-supplied content is HTML-escaped before insertion.
 */
function _renderContent(text) {
  const parts = [];
  const fence  = /```(\w*)\n?([\s\S]*?)```/g;
  let last = 0, m;

  while ((m = fence.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: 'text', content: text.slice(last, m.index) });
    parts.push({ type: 'code', lang: m[1] || '', content: m[2] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ type: 'text', content: text.slice(last) });

  return parts.map((p) => {
    if (p.type === 'text') {
      const html = _esc(p.content)
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/`([^`\n]+)`/g,   '<code class="ai-inline-code">$1</code>')
        .replace(/\n/g, '<br>');
      return `<span class="ai-text-block">${html}</span>`;
    }

    const isMmd = p.lang === 'mermaid';
    const codeEsc = _esc(p.content);
    return `<div class="ai-code-block">
      <div class="ai-code-header">
        <span class="ai-code-lang">${_esc(p.lang || 'code')}</span>
        ${isMmd
          ? `<button class="ai-btn-apply" data-code="${codeEsc}">⬆ Apply to Editor</button>`
          : ''}
        <button class="ai-btn-copy" data-code="${codeEsc}">⎘ Copy</button>
      </div>
      <pre class="ai-code-pre"><code>${codeEsc}</code></pre>
    </div>`;
  }).join('');
}

function _appendMessage(role, text, id) {
  const container = document.getElementById('ai-chat-messages');
  if (!container) return null;

  const el = document.createElement('div');
  el.className = `ai-message ai-message-${role}`;
  if (id) el.id = id;

  if (role === 'assistant') {
    el.innerHTML =
      `<div class="ai-message-avatar">${ICON_SVG}</div>` +
      `<div class="ai-message-body">${_renderContent(text)}</div>`;
  } else {
    el.innerHTML =
      `<div class="ai-message-body ai-message-user-body">${_esc(text).replace(/\n/g, '<br>')}</div>`;
  }

  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
  return el;
}

function _updateStreamEl(el, fullText) {
  if (!el) return;
  const body = el.querySelector('.ai-message-body');
  if (body) body.innerHTML = _renderContent(fullText);
  const container = document.getElementById('ai-chat-messages');
  if (container) container.scrollTop = container.scrollHeight;
}

/* ── Expand / collapse ───────────────────────────────────────── */

function _expand() {
  if (_expanded) return;
  _expanded = true;
  _widget.classList.remove('ai-orb-mode');
  _widget.classList.add('ai-box-mode');
  _widget.querySelector('.ai-orb-face').hidden = true;
  _widget.querySelector('.ai-box').hidden = false;

  requestAnimationFrame(() => {
    const { x, y } = _clamp(_widget.offsetLeft, _widget.offsetTop);
    _applyPos(x, y);
    _savePos(x, y);

    if (!_getApiKey()) {
      _toggleSettings(true);
    } else {
      _toggleSettings(false);
      /* Show welcome message on first expand */
      const msgs = document.getElementById('ai-chat-messages');
      if (msgs && !msgs.querySelector('.ai-message')) {
        _appendMessage('assistant',
          `Hi! I'm Siren AI — your Mermaid diagram assistant. ` +
          `I can see your current diagram and apply changes directly to the editor.\n\n` +
          `Try: *"Convert this to a sequence diagram"* or *"Add an error-handling node"*`
        );
      }
      document.getElementById('ai-chat-input')?.focus();
    }
  });
}

function _collapse() {
  if (!_expanded) return;
  _expanded = false;
  _widget.classList.remove('ai-box-mode');
  _widget.classList.add('ai-orb-mode');
  _widget.querySelector('.ai-orb-face').hidden = false;
  _widget.querySelector('.ai-box').hidden = true;

  requestAnimationFrame(() => {
    const { x, y } = _clamp(_widget.offsetLeft, _widget.offsetTop);
    _applyPos(x, y);
    _savePos(x, y);
  });
}

function _toggleSettings(force) {
  _showingSettings = (force !== undefined) ? force : !_showingSettings;
  const sp = document.getElementById('ai-settings-panel');
  const cp = document.getElementById('ai-chat-panel');
  if (sp) sp.hidden = !_showingSettings;
  if (cp) cp.hidden = _showingSettings;

  if (_showingSettings) {
    const ki = document.getElementById('ai-api-key-input');
    if (ki) ki.value = _getApiKey();
    const mi = document.getElementById('ai-model-input');
    if (mi) mi.value = _getModel();
  }
}

/* ── Send message ────────────────────────────────────────────── */

async function _handleSend() {
  if (_isStreaming) return;
  const input = document.getElementById('ai-chat-input');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;

  input.value = '';
  input.style.height = '';

  _appendMessage('user', text);

  const streamId = `ai-stream-${Date.now()}`;
  const streamEl = _appendMessage('assistant', '…', streamId);
  const sendBtn  = document.getElementById('ai-btn-send');

  _isStreaming = true;
  if (sendBtn) sendBtn.disabled = true;

  await _callAPI(
    text,
    (full) => { _updateStreamEl(streamEl, full); },
    (full) => {
      _isStreaming = false;
      if (sendBtn) sendBtn.disabled = false;
      _updateStreamEl(streamEl, full);
    },
    (errMsg) => {
      _isStreaming = false;
      if (sendBtn) sendBtn.disabled = false;
      const body = streamEl?.querySelector('.ai-message-body');
      if (body) body.innerHTML = `<span class="ai-error">⚠ ${_esc(errMsg)}</span>`;
    },
  );
}

/* ── Widget DOM ──────────────────────────────────────────────── */

function _buildWidget() {
  const el = document.createElement('div');
  el.id        = 'ai-widget';
  el.className = 'ai-widget ai-orb-mode';
  el.setAttribute('role', 'complementary');
  el.setAttribute('aria-label', 'Siren AI assistant');

  /* Use DOMParser to build the widget safely */
  const tpl = document.createElement('template');
  tpl.innerHTML = `
    <div class="ai-orb-face" title="Open Siren AI (drag to move)">
      <div class="ai-orb-icon">${ICON_SVG}</div>
    </div>

    <div class="ai-box" hidden>

      <!-- Header (drag handle) -->
      <div class="ai-header">
        <div class="ai-header-icon">${ICON_SVG}</div>
        <span class="ai-header-title">Siren AI</span>
        <button class="ai-btn-icon" id="ai-btn-settings" title="Settings" aria-label="Settings">⚙️</button>
        <button class="ai-btn-icon" id="ai-btn-minimize" title="Minimize" aria-label="Minimize">⤡</button>
      </div>

      <!-- Settings panel -->
      <div class="ai-settings-panel" id="ai-settings-panel" hidden>
        <div class="ai-settings-scroll">
          <div class="ai-settings-banner">
            <strong>🔑 OpenRouter API Key required</strong>
            <p>Siren AI uses <a href="https://openrouter.ai" target="_blank" rel="noopener noreferrer">OpenRouter</a> to access AI models. Sign up for a <strong>free</strong> API key — no credit card needed.</p>
            <p>Default model: <code>openai/gpt-5.2</code>&thinsp;— change it below if needed.</p>
          </div>
          <label class="ai-settings-label" for="ai-api-key-input">API Key</label>
          <input type="password" id="ai-api-key-input" class="ai-settings-input" placeholder="sk-or-…" autocomplete="new-password" spellcheck="false" />
          <label class="ai-settings-label" for="ai-model-input" style="margin-top:8px;">Model ID</label>
          <input type="text" id="ai-model-input" class="ai-settings-input" autocomplete="off" spellcheck="false" />
          <button id="ai-btn-save-settings" class="ai-btn-primary">Save &amp; Start Chatting</button>
          <button id="ai-btn-clear-history" class="ai-btn-ghost">Clear Chat History</button>
        </div>
      </div>

      <!-- Chat panel -->
      <div class="ai-chat-panel" id="ai-chat-panel" hidden>
        <div class="ai-chat-messages" id="ai-chat-messages" role="log" aria-live="polite"></div>
        <div class="ai-chat-input-row">
          <textarea
            id="ai-chat-input"
            class="ai-chat-input"
            rows="2"
            placeholder="Ask Siren AI about your diagram…"
            aria-label="Message Siren AI"
            spellcheck="true"
          ></textarea>
          <button id="ai-btn-send" class="ai-btn-send" title="Send (Enter)" aria-label="Send">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
                 aria-hidden="true">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </div>

    </div>
  `;

  el.appendChild(tpl.content);
  return el;
}

/* ── Public init ─────────────────────────────────────────────── */

/**
 * Initialise the Siren AI floating widget.
 *
 * @param {{
 *   getEditorContent : () => string,
 *   setEditorContent : (code: string) => void,
 *   updateStatus?    : (level: string, message: string) => void,
 * }} options
 */
export function initAIAssistant({ getEditorContent, setEditorContent, updateStatus }) {
  _getEditorContent = getEditorContent;
  _setEditorContent = setEditorContent;
  _updateStatus     = updateStatus || null;

  /* Build and attach widget */
  _widget = _buildWidget();
  document.body.appendChild(_widget);

  /* Set initial position */
  const saved = _loadPos();
  if (saved) {
    _applyPos(saved.x, saved.y);
  } else {
    requestAnimationFrame(() => {
      const x = window.innerWidth  - _widget.offsetWidth  - 24;
      const y = window.innerHeight - _widget.offsetHeight - 80;
      _applyPos(x, y);
      _savePos(x, y);
    });
  }

  /* Drag (orb tap-to-expand handled in _initDrag pointerup) */
  _initDrag();

  /* Minimize */
  document.getElementById('ai-btn-minimize').addEventListener('click', (e) => {
    e.stopPropagation();
    _collapse();
  });

  /* Settings toggle */
  document.getElementById('ai-btn-settings').addEventListener('click', (e) => {
    e.stopPropagation();
    _toggleSettings();
  });

  /* Save settings */
  document.getElementById('ai-btn-save-settings').addEventListener('click', () => {
    const k = (document.getElementById('ai-api-key-input').value || '').trim();
    const m = (document.getElementById('ai-model-input').value  || '').trim() || DEFAULT_MODEL;
    // Storing the user-supplied API key in localStorage is intentional: this is a
    // browser-only PWA with no backend. The key is scoped to this origin and never
    // sent anywhere other than openrouter.ai. Users are informed they provide their
    // own key. lgtm[js/clear-text-storage-of-sensitive-data]
    if (k) localStorage.setItem(AI_KEY_STORE, k);
    localStorage.setItem(AI_MODEL_STORE, m);
    _toggleSettings(false);

    /* Welcome message on first setup */
    const msgs = document.getElementById('ai-chat-messages');
    if (msgs && !msgs.querySelector('.ai-message')) {
      _appendMessage('assistant',
        `All set! I'm Siren AI — ask me to create or modify your Mermaid diagrams.\n\n` +
        `Any code I produce includes an **Apply to Editor** button to load it instantly.`
      );
    }
    document.getElementById('ai-chat-input')?.focus();
  });

  /* Clear history */
  document.getElementById('ai-btn-clear-history').addEventListener('click', () => {
    _messages = [];
    const msgs = document.getElementById('ai-chat-messages');
    if (msgs) msgs.innerHTML = '';
    _toggleSettings(false);
    _appendMessage('assistant', 'Chat history cleared. How can I help with your diagram?');
    document.getElementById('ai-chat-input')?.focus();
  });

  /* Send button */
  document.getElementById('ai-btn-send').addEventListener('click', (e) => {
    e.stopPropagation();
    _handleSend();
  });

  /* Enter to send (Shift+Enter = newline) */
  document.getElementById('ai-chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      _handleSend();
    }
  });

  /* Auto-grow textarea */
  document.getElementById('ai-chat-input').addEventListener('input', (e) => {
    e.target.style.height = '';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 80)}px`;
  });

  /* Event delegation for Apply / Copy buttons inside messages */
  document.getElementById('ai-chat-messages').addEventListener('click', (e) => {
    const applyBtn = e.target.closest('.ai-btn-apply');
    const copyBtn  = e.target.closest('.ai-btn-copy');

    if (applyBtn) {
      const code = applyBtn.dataset.code;
      if (_setEditorContent) {
        _setEditorContent(code);
        if (_updateStatus) _updateStatus('ok', 'AI diagram applied to editor');
      }
      return;
    }

    if (copyBtn) {
      navigator.clipboard.writeText(copyBtn.dataset.code).then(() => {
        copyBtn.textContent = '✓ Copied';
        setTimeout(() => { copyBtn.innerHTML = '⎘ Copy'; }, 1600);
      }).catch(() => {
        copyBtn.textContent = '✗ Failed';
        setTimeout(() => { copyBtn.innerHTML = '⎘ Copy'; }, 1600);
      });
    }
  });

  /* Recalculate position on window resize to keep widget inside viewport */
  window.addEventListener('resize', () => {
    const { x, y } = _clamp(_widget.offsetLeft, _widget.offsetTop);
    _applyPos(x, y);
    _savePos(x, y);
  });
}
