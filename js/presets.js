/* ============================================================
   Sirens — Template Library (Preset Structures)
   Renders an accordion panel inside the Style Sidebar with
   categorised snippet cards the user can click to insert.
   ============================================================ */

import { SNIPPETS } from './snippets.js';

/* ── Category metadata ──────────────────────────────────────── */

const CATEGORY_ORDER = [
  'basic', 'flowchart', 'sequence', 'class', 'state',
  'gantt', 'er', 'pie', 'mindmap', 'timeline', 'git', 'chart', 'c4',
];

const CATEGORY_META = {
  basic:     { label: 'Basic Shapes',       icon: '⬡' },
  flowchart: { label: 'Flowcharts',         icon: '⬇️' },
  sequence:  { label: 'Sequence Diagrams',  icon: '🔄' },
  class:     { label: 'Class Diagrams',     icon: '🏗️' },
  state:     { label: 'State Machines',     icon: '🔀' },
  gantt:     { label: 'Gantt Charts',       icon: '📅' },
  er:        { label: 'ER Diagrams',        icon: '🗃️' },
  pie:       { label: 'Pie Charts',         icon: '🥧' },
  mindmap:   { label: 'Mindmaps',           icon: '🧠' },
  timeline:  { label: 'Timelines',          icon: '⏱️' },
  git:       { label: 'Git Graphs',         icon: '🌿' },
  chart:     { label: 'XY Charts',          icon: '📊' },
  c4:        { label: 'C4 Architecture',    icon: '🏛️' },
};

/* ── Helpers ────────────────────────────────────────────────── */

function _esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ── Public API ─────────────────────────────────────────────── */

/**
 * Render the preset accordion into `container`.
 * @param {{
 *   container: HTMLElement,
 *   onInsert: (snippet: object) => void,
 * }} options
 */
export function initPresets({ container, onInsert }) {
  // Group snippets by tag
  const grouped = {};
  for (const snippet of SNIPPETS) {
    if (!grouped[snippet.tag]) grouped[snippet.tag] = [];
    grouped[snippet.tag].push(snippet);
  }

  const parts = [];
  for (const tag of CATEGORY_ORDER) {
    const items = grouped[tag];
    if (!items || !items.length) continue;
    const meta = CATEGORY_META[tag] || { label: tag, icon: '📋' };

    const cards = items.map((s) => `
      <div class="preset-card" data-id="${_esc(s.id)}" title="${_esc(s.description)}" draggable="true">
        <div class="preset-card-icon">${s.icon}</div>
        <div class="preset-card-label">${_esc(s.label)}</div>
      </div>
    `).join('');

    parts.push(`
      <div class="preset-category">
        <button class="preset-category-header" data-tag="${_esc(tag)}" aria-expanded="false">
          <span class="preset-cat-icon">${meta.icon}</span>
          <span class="preset-cat-label">${_esc(meta.label)}</span>
          <span class="preset-cat-count">${items.length}</span>
          <span class="preset-cat-chevron" aria-hidden="true">▾</span>
        </button>
        <div class="preset-category-items" data-tag-items="${_esc(tag)}" hidden>
          ${cards}
        </div>
      </div>
    `);
  }

  container.innerHTML = parts.join('');

  // Open "Basic Shapes" by default
  _toggleCategory(container.querySelector('[data-tag="basic"]'));

  // Accordion toggle
  container.querySelectorAll('.preset-category-header').forEach((header) => {
    header.addEventListener('click', () => _toggleCategory(header));
  });

  // Click-to-insert
  container.addEventListener('click', (e) => {
    const card = e.target.closest('.preset-card');
    if (!card) return;
    const snippet = SNIPPETS.find((s) => s.id === card.dataset.id);
    if (snippet) onInsert(snippet);
  });

  // Drag-and-drop: drag preset card → drop onto editor or canvas to insert
  container.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.preset-card');
    if (!card) return;
    const snippet = SNIPPETS.find((s) => s.id === card.dataset.id);
    if (!snippet) return;
    e.dataTransfer.setData('text/plain', snippet.code);
    e.dataTransfer.setData('application/sirens-snippet-id', snippet.id);
    e.dataTransfer.effectAllowed = 'copy';
    card.classList.add('dragging');
  });

  container.addEventListener('dragend', (e) => {
    const card = e.target.closest('.preset-card');
    if (card) card.classList.remove('dragging');
  });
}

/* ── Accordion helper ───────────────────────────────────────── */

function _toggleCategory(header) {
  if (!header) return;
  const tag = header.dataset.tag;
  const itemsEl = header.closest('.preset-category')
    .querySelector('.preset-category-items');
  if (!itemsEl) return;

  const isOpen = !itemsEl.hidden;
  itemsEl.hidden = isOpen;
  header.setAttribute('aria-expanded', String(!isOpen));
  header.querySelector('.preset-cat-chevron').textContent = isOpen ? '▾' : '▴';
}
