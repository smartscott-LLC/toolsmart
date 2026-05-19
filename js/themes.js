/* ============================================================
   Sirens — Themes Module
   Manages app visual themes and Mermaid diagram themes
   ============================================================ */

/** App-level visual themes (applied to <body> class) */
export const APP_THEMES = [
  {
    id: 'corporate',
    label: 'Corporate',
    description: 'Clean professional look using the brand palette',
    bodyClass: '',           // default (CSS vars are the corporate theme)
    mermaidTheme: 'base',
    preview: 'linear-gradient(135deg, #1e3922 0%, #ddd0b0 50%, #c25e07 100%)',
  },
  {
    id: 'sketch',
    label: 'Sketch',
    description: 'Light, warm-parchment feel for brainstorming',
    bodyClass: 'theme-sketch',
    mermaidTheme: 'default',
    preview: 'linear-gradient(135deg, #fffef9 0%, #d4cbb0 50%, #8b5e3c 100%)',
  },
  {
    id: 'midnight',
    label: 'Midnight',
    description: 'Dark evergreen for late-night sessions',
    bodyClass: 'theme-midnight',
    mermaidTheme: 'dark',
    preview: 'linear-gradient(135deg, #0f1a12 0%, #1e3922 50%, #c25e07 100%)',
  },
  {
    id: 'highcontrast',
    label: 'High Contrast',
    description: 'Maximum accessibility and clarity',
    bodyClass: 'theme-highcontrast',
    mermaidTheme: 'base',
    preview: 'linear-gradient(135deg, #000 0%, #333 50%, #ff9800 100%)',
  },
];

/** Mermaid themes available in the select */
export const MERMAID_THEMES = [
  { value: 'base',    label: 'Base (Brand)' },
  { value: 'default', label: 'Default' },
  { value: 'dark',    label: 'Dark' },
  { value: 'forest',  label: 'Forest' },
  { value: 'neutral', label: 'Neutral' },
];

/** Brand-colored Mermaid init variables for 'base' theme */
export const BRAND_MERMAID_VARS = {
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
  titleColor:          '#ddd0b0',
  edgeLabelBackground: '#e1d9c4',
  noteBkgColor:        '#e1d9c4',
  noteTextColor:       '#1e3922',
};

let _currentAppTheme = 'corporate';
let _currentMermaidTheme = 'base';
let _customCss = '';

/**
 * Apply an app-level theme to the document body.
 * @param {string} themeId
 */
export function applyAppTheme(themeId) {
  const theme = APP_THEMES.find((t) => t.id === themeId);
  if (!theme) return;

  // Remove all theme classes
  APP_THEMES.forEach((t) => {
    if (t.bodyClass) document.body.classList.remove(t.bodyClass);
  });

  // Apply the new one
  if (theme.bodyClass) {
    document.body.classList.add(theme.bodyClass);
  }

  _currentAppTheme = themeId;
  localStorage.setItem('sirens-app-theme', themeId);
}

/**
 * Apply a Mermaid diagram theme and re-render.
 * @param {string} mermaidTheme  One of: base | default | dark | forest | neutral
 * @param {Function} rerender    Callback to trigger diagram re-render
 */
export function applyMermaidTheme(mermaidTheme, rerender) {
  _currentMermaidTheme = mermaidTheme;
  localStorage.setItem('sirens-mermaid-theme', mermaidTheme);

  const vars = mermaidTheme === 'base' ? BRAND_MERMAID_VARS : {};

  if (window.mermaid) {
    window.mermaid.initialize({
      startOnLoad: false,
      theme: mermaidTheme,
      themeVariables: vars,
      securityLevel: 'loose',
      fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
      flowchart: { useMaxWidth: false, htmlLabels: true },
      sequence: { useMaxWidth: false },
      gantt: { useMaxWidth: false },
    });
    if (typeof rerender === 'function') rerender();
  }
}

/**
 * Apply custom CSS entered in the CSS Injector field.
 * @param {string} css
 */
export function applyCustomCss(css) {
  _customCss = css;
  let el = document.getElementById('custom-css-injector-style');
  if (!el) {
    el = document.createElement('style');
    el.id = 'custom-css-injector-style';
    document.head.appendChild(el);
  }
  el.textContent = css;
  localStorage.setItem('sirens-custom-css', css);
}

/**
 * Restore theme settings from localStorage.
 * @param {Function} rerender
 */
export function restoreThemeSettings(rerender) {
  const appTheme     = localStorage.getItem('sirens-app-theme')     || 'corporate';
  const mermaidTheme = localStorage.getItem('sirens-mermaid-theme') || 'base';
  const customCss    = localStorage.getItem('sirens-custom-css')    || '';

  applyAppTheme(appTheme);
  applyMermaidTheme(mermaidTheme, rerender);
  if (customCss) applyCustomCss(customCss);

  return { appTheme, mermaidTheme, customCss };
}

/** Returns the current active Mermaid theme id */
export function getCurrentMermaidTheme() { return _currentMermaidTheme; }

/** Returns the current active app theme id */
export function getCurrentAppTheme() { return _currentAppTheme; }

/** Returns stored custom CSS */
export function getCustomCss() { return _customCss; }
