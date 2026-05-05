/* ============================================================
   Sirens — Editor Module
   CodeMirror 5-based Mermaid editor:
   - Custom Mermaid syntax mode
   - Ghost syntax (inline autocomplete hints)
   - Error gutter with line markers
   - Multi-cursor support (built-in to CodeMirror)
   - Debounced onChange callback
   ============================================================ */

/* ── Mermaid keyword banks ─────────────────────────────────── */

const DIAGRAM_TYPES = [
  'graph', 'flowchart', 'sequenceDiagram', 'classDiagram',
  'stateDiagram', 'stateDiagram-v2', 'erDiagram', 'gantt',
  'pie', 'mindmap', 'timeline', 'gitGraph', 'xychart-beta',
  'C4Context', 'C4Container', 'C4Component', 'C4Dynamic',
];

const FLOW_KEYWORDS = [
  'TD', 'LR', 'RL', 'BT', 'TB',
  'subgraph', 'end', 'style', 'classDef', 'click',
];

const SEQUENCE_KEYWORDS = [
  'participant', 'actor', 'activate', 'deactivate',
  'Note', 'loop', 'alt', 'else', 'opt', 'par',
  'critical', 'break', 'autonumber',
];

const GANTT_KEYWORDS = [
  'title', 'dateFormat', 'section', 'excludes',
  'todayMarker', 'axisFormat', 'tickInterval',
];

const CLASS_KEYWORDS = [
  'class', 'interface', 'abstract', 'enum',
  'link', 'callback', 'note', 'namespace',
];

const STATE_KEYWORDS = [
  'state', 'note', 'concurrency', 'fork', 'join', 'choice',
];

const ALL_KEYWORDS = [
  ...DIAGRAM_TYPES,
  ...FLOW_KEYWORDS,
  ...SEQUENCE_KEYWORDS,
  ...GANTT_KEYWORDS,
  ...CLASS_KEYWORDS,
  ...STATE_KEYWORDS,
];

/* ── Ghost text prefixes ────────────────────────────────────── */

const GHOST_COMPLETIONS = {
  graph:          'graph TD\n    ',
  flowchart:      'flowchart TD\n    ',
  sequenceDiag:   'sequenceDiagram\n    participant ',
  sequenceD:      'sequenceDiagram\n    participant ',
  sequence:       'sequenceDiagram\n    participant ',
  classDiag:      'classDiagram\n    class ',
  stateDiag:      'stateDiagram-v2\n    [*] --> ',
  erDiag:         'erDiagram\n    ENTITY {\n        int id PK\n    }',
  gantt:          'gantt\n    title \n    dateFormat YYYY-MM-DD\n    section ',
  pie:            'pie title \n    "Label A" : 40\n    "Label B" : 60',
  mindmap:        'mindmap\n  root((Topic))\n    Branch 1\n    Branch 2',
  timeline:       'timeline\n    title \n    2024 : Event',
  gitGraph:       'gitGraph\n    commit id: "init"',
  xychart:        'xychart-beta\n    title ""\n    x-axis [A, B, C]\n    y-axis 0 --> 100\n    bar [',
  subgraph:       'subgraph Title\n    ',
  participant:    'participant Name as Display',
  classDef:       'classDef className fill:#color,stroke:#color',
  section:        'section Section Name',
  dateFormat:     'dateFormat YYYY-MM-DD',
};

/* ── CodeMirror Simple Mode definition ─────────────────────── */

function defineMermaidMode() {
  if (!window.CodeMirror || !window.CodeMirror.defineSimpleMode) return;

  CodeMirror.defineSimpleMode('mermaid', {
    start: [
      // Comments
      { regex: /%%.*/, token: 'mermaid-comment' },
      // Diagram type declarations
      { regex: new RegExp(`(?:${DIAGRAM_TYPES.join('|')})(?=\\s|$|-v2)`), token: 'mermaid-type', indent: true },
      // Arrow operators
      { regex: /-->|-->>|->|->>|--[ox]|===>|===|~~~/,    token: 'mermaid-arrow' },
      { regex: /\|.*?\|/,                                  token: 'mermaid-string' },
      // Node shapes: [text], (text), {text}, ([text]), [[text]], [(text)]
      { regex: /\[\[|\]\]|\[\/|\[\\|\(\(|\)\)|<\[|\[>/, token: 'mermaid-bracket' },
      { regex: /[\[\](){}]/, token: 'mermaid-bracket' },
      // Quoted strings
      { regex: /"(?:[^"\\]|\\.)*"/, token: 'mermaid-string' },
      // Keywords
      { regex: new RegExp(`\\b(?:${[...FLOW_KEYWORDS, ...SEQUENCE_KEYWORDS, ...GANTT_KEYWORDS, ...CLASS_KEYWORDS, ...STATE_KEYWORDS].join('|')})\\b`), token: 'mermaid-keyword' },
      // Node IDs (alphanumeric identifiers before brackets or arrows)
      { regex: /\b[A-Za-z_][A-Za-z0-9_]*(?=\s*[\[({<])/, token: 'mermaid-node-id' },
      // Numbers (dates, percentages)
      { regex: /\b\d{4}-\d{2}-\d{2}\b/, token: 'mermaid-string' },
      { regex: /\b\d+(?:\.\d+)?[d]?\b/, token: 'mermaid-string' },
      // Operators
      { regex: /[:+\-*<>]/, token: 'mermaid-arrow' },
    ],
    meta: {
      lineComment: '%%',
    },
  });
}

/* ── Ghost hint helper ──────────────────────────────────────── */

function getMermaidHints(cm) {
  const cursor = cm.getCursor();
  const token = cm.getTokenAt(cursor);
  const word = token.string.trim().toLowerCase();
  if (!word || word.length < 2) return null;

  const matches = ALL_KEYWORDS.filter(
    (k) => k.toLowerCase().startsWith(word) && k.toLowerCase() !== word
  );

  if (!matches.length) return null;

  return {
    list: matches.map((m) => ({
      text: m,
      displayText: m,
      hint: (editor, _data, completion) => {
        const from = { line: cursor.line, ch: token.start };
        const to = { line: cursor.line, ch: token.end };
        editor.replaceRange(completion.text, from, to);
        // If there's a ghost completion, expand it
        const ghost = GHOST_COMPLETIONS[m.toLowerCase().substring(0, 10)];
        if (ghost && cm.lineCount() === 1 && cm.getValue().trim() === m) {
          cm.setValue(ghost);
          cm.setCursor(cm.lineCount() - 1, cm.getLine(cm.lineCount() - 1).length);
        }
      },
    })),
    from: CodeMirror.Pos(cursor.line, token.start),
    to: CodeMirror.Pos(cursor.line, token.end),
  };
}

/* ── Error gutter helpers ───────────────────────────────────── */

const ERROR_GUTTER = 'gutter-errors';

function clearErrorGutter(cm) {
  cm.clearGutter(ERROR_GUTTER);
  // Also clear error line backgrounds
  for (let i = 0; i < cm.lineCount(); i++) {
    cm.removeLineClass(i, 'background', 'cm-error-line');
  }
}

function markErrorLine(cm, lineNum, message) {
  if (lineNum < 0 || lineNum >= cm.lineCount()) return;
  const marker = document.createElement('div');
  marker.className = 'gutter-error-marker';
  marker.title = message;
  marker.textContent = '●';
  cm.setGutterMarker(lineNum, ERROR_GUTTER, marker);
  cm.addLineClass(lineNum, 'background', 'cm-error-line');
}

/* ── Detect diagram type from source ───────────────────────── */

export function detectDiagramType(source) {
  const first = source.trim().split('\n')[0].toLowerCase();
  if (first.startsWith('graph') || first.startsWith('flowchart')) return 'Flowchart';
  if (first.startsWith('sequencediagram'))                          return 'Sequence';
  if (first.startsWith('classdiagram'))                             return 'Class';
  if (first.startsWith('statediagram'))                             return 'State';
  if (first.startsWith('erdiagram'))                                return 'ER';
  if (first.startsWith('gantt'))                                    return 'Gantt';
  if (first.startsWith('pie'))                                      return 'Pie';
  if (first.startsWith('mindmap'))                                  return 'Mindmap';
  if (first.startsWith('timeline'))                                 return 'Timeline';
  if (first.startsWith('gitgraph'))                                 return 'Git Graph';
  if (first.startsWith('xychart'))                                  return 'XY Chart';
  if (first.startsWith('c4'))                                       return 'C4';
  return 'Mermaid';
}

/* ── Main Editor initialiser ────────────────────────────────── */

/**
 * @param {HTMLElement} container
 * @param {{
 *   onChange: (value: string) => void,
 *   onDiagramType: (type: string) => void,
 *   debounceMs?: number
 * }} options
 * @returns {{ cm: CodeMirror.Editor, setErrors: Function, setValue: Function, getValue: Function }}
 */
export function createEditor(container, { onChange, onDiagramType, debounceMs = 350 }) {
  if (!window.CodeMirror) {
    throw new Error('CodeMirror not loaded');
  }

  defineMermaidMode();

  const cm = CodeMirror(container, {
    mode: 'mermaid',
    lineNumbers: true,
    lineWrapping: true,
    autofocus: true,
    tabSize: 4,
    indentWithTabs: false,
    matchBrackets: true,
    autoCloseBrackets: false,
    theme: 'default',
    gutters: [ERROR_GUTTER, 'CodeMirror-linenumbers'],
    extraKeys: {
      'Ctrl-Space': (editor) => {
        CodeMirror.showHint(editor, getMermaidHints, { completeSingle: false });
      },
      // Multi-cursor: Alt+Click is built-in; add Ctrl+D for next occurrence
      'Ctrl-D': (editor) => {
        const selection = editor.getSelection();
        if (!selection) return;
        const cursor = editor.getCursor('to');
        const searchCursor = editor.getSearchCursor(selection, cursor);
        if (searchCursor.findNext()) {
          editor.addSelection(searchCursor.from(), searchCursor.to());
        }
      },
      // Quick comment toggle
      'Ctrl-/': (editor) => {
        const selections = editor.listSelections();
        editor.operation(() => {
          selections.forEach(({ anchor, head }) => {
            const from = Math.min(anchor.line, head.line);
            const to = Math.max(anchor.line, head.line);
            for (let l = from; l <= to; l++) {
              const text = editor.getLine(l);
              if (text.startsWith('%% ')) {
                editor.replaceRange(text.slice(3), { line: l, ch: 0 }, { line: l, ch: text.length });
              } else {
                editor.replaceRange('%% ' + text, { line: l, ch: 0 }, { line: l, ch: text.length });
              }
            }
          });
        });
      },
    },
    placeholder: 'Start typing Mermaid syntax…\nTry: graph TD\n    A --> B',
    styleActiveLine: true,
  });

  // ── Ghost text via auto-hint on keystroke ──────────────────
  let ghostTimeout = null;
  cm.on('keyup', (editor, event) => {
    // Skip for navigation keys
    const skip = [
      'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
      'Escape', 'Tab', 'Enter', 'Backspace', 'Delete',
      'Home', 'End', 'PageUp', 'PageDown',
    ];
    if (skip.includes(event.key) || event.ctrlKey || event.metaKey) return;

    clearTimeout(ghostTimeout);
    ghostTimeout = setTimeout(() => {
      if (cm.state.completionActive) return;
      CodeMirror.showHint(cm, getMermaidHints, {
        completeSingle: false,
        alignWithWord: true,
      });
    }, 200);
  });

  // ── Debounced onChange — only fires for genuine user edits ───
  // CodeMirror sets change.origin = 'setValue' for programmatic cm.setValue() calls.
  // Skipping those prevents the debounce from treating initial loads as user edits.
  let changeTimeout = null;
  cm.on('change', (editor, change) => {
    if (change.origin === 'setValue') return; // programmatic change, ignore
    clearTimeout(changeTimeout);
    changeTimeout = setTimeout(() => {
      const value = editor.getValue();
      if (typeof onDiagramType === 'function') {
        onDiagramType(detectDiagramType(value));
      }
      if (typeof onChange === 'function') {
        onChange(value);
      }
    }, debounceMs);
  });

  // ── Public API ─────────────────────────────────────────────

  /**
   * Display parse errors in the gutter.
   * @param {Array<{line?: number, message: string}>} errors
   */
  function setErrors(errors) {
    clearErrorGutter(cm);
    if (!errors || !errors.length) return;
    errors.forEach(({ line, message }) => {
      // Mermaid error lines are 1-based; CodeMirror is 0-based
      const l = line != null ? line - 1 : 0;
      markErrorLine(cm, l, message);
    });
  }

  function setValue(text) {
    cm.setValue(text || '');
    cm.clearHistory();
    cm.setCursor(cm.lineCount() - 1, 0);
  }

  function getValue() {
    return cm.getValue();
  }

  /** Move cursor to a specific 1-based line number */
  function goToLine(lineNumber) {
    const l = Math.max(0, lineNumber - 1);
    cm.setCursor(l, 0);
    cm.scrollIntoView({ line: l, ch: 0 }, 80);
    cm.focus();
  }

  /** Undo the last edit and refocus the editor */
  function undo() {
    cm.undo();
    cm.focus();
  }

  /** Redo the last undone edit and refocus the editor */
  function redo() {
    cm.redo();
    cm.focus();
  }

  return { cm, setErrors, setValue, getValue, goToLine, undo, redo };
}
