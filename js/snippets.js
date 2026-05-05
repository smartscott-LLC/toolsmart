/* ============================================================
   Sirens — Snippet Definitions
   All Mermaid diagram templates with metadata
   ============================================================ */

export const SNIPPETS = [
  /* ── Flowchart ─────────────────────────────────────────── */
  {
    id: 'flowchart-td',
    label: 'Flowchart — Top Down',
    description: 'Classic top-to-bottom flow diagram',
    icon: '⬇️',
    tag: 'flowchart',
    keywords: ['flow', 'graph', 'td', 'top'],
    code: `graph TD
    A([Start]) --> B{Decision}
    B -->|Yes| C[Process A]
    B -->|No| D[Process B]
    C --> E([End])
    D --> E`,
  },
  {
    id: 'flowchart-lr',
    label: 'Flowchart — Left Right',
    description: 'Horizontal left-to-right flow diagram',
    icon: '➡️',
    tag: 'flowchart',
    keywords: ['flow', 'graph', 'lr', 'left', 'right', 'horizontal'],
    code: `graph LR
    A[Input] --> B(Process)
    B --> C{Gate}
    C -->|Pass| D[Output]
    C -->|Fail| E[Error]`,
  },

  /* ── Sequence ──────────────────────────────────────────── */
  {
    id: 'sequence',
    label: 'Sequence Diagram',
    description: 'Interaction between actors over time',
    icon: '🔄',
    tag: 'sequence',
    keywords: ['sequence', 'seq', 'actor', 'message'],
    code: `sequenceDiagram
    participant A as Client
    participant B as Server
    participant C as Database

    A->>B: POST /api/data
    B->>C: SELECT * FROM records
    C-->>B: Result set
    B-->>A: 200 OK (JSON)`,
  },

  /* ── Class ─────────────────────────────────────────────── */
  {
    id: 'class',
    label: 'Class Diagram',
    description: 'OOP class relationships and attributes',
    icon: '🏗️',
    tag: 'class',
    keywords: ['class', 'oop', 'inheritance', 'uml'],
    code: `classDiagram
    class Animal {
        +String name
        +int age
        +speak() String
    }
    class Dog {
        +fetch() void
    }
    class Cat {
        +purr() void
    }
    Animal <|-- Dog
    Animal <|-- Cat`,
  },

  /* ── State ─────────────────────────────────────────────── */
  {
    id: 'statediagram',
    label: 'State Diagram',
    description: 'Finite state machine transitions',
    icon: '🔀',
    tag: 'state',
    keywords: ['state', 'machine', 'fsm', 'transition'],
    code: `stateDiagram-v2
    [*] --> Idle
    Idle --> Running : start
    Running --> Paused : pause
    Paused --> Running : resume
    Running --> [*] : stop`,
  },

  /* ── Gantt ─────────────────────────────────────────────── */
  {
    id: 'gantt',
    label: 'Gantt Chart',
    description: 'Project timeline and task scheduling',
    icon: '📅',
    tag: 'gantt',
    keywords: ['gantt', 'project', 'timeline', 'schedule', 'task'],
    code: `gantt
    title Project Roadmap
    dateFormat  YYYY-MM-DD
    section Planning
    Research           :a1, 2024-01-01, 14d
    Wireframes         :a2, after a1, 7d
    section Development
    Backend API        :b1, after a2, 21d
    Frontend UI        :b2, after a2, 21d
    section Launch
    Testing            :c1, after b1, 10d
    Deployment         :c2, after c1, 3d`,
  },

  /* ── ER ─────────────────────────────────────────────────── */
  {
    id: 'er',
    label: 'ER Diagram',
    description: 'Entity-Relationship database schema',
    icon: '🗃️',
    tag: 'er',
    keywords: ['er', 'entity', 'relationship', 'database', 'schema'],
    code: `erDiagram
    USER {
        int id PK
        string email
        string name
        datetime created_at
    }
    POST {
        int id PK
        int user_id FK
        string title
        text content
    }
    COMMENT {
        int id PK
        int post_id FK
        int user_id FK
        text body
    }
    USER ||--o{ POST : "writes"
    POST ||--o{ COMMENT : "has"
    USER ||--o{ COMMENT : "writes"`,
  },

  /* ── Pie ─────────────────────────────────────────────────── */
  {
    id: 'pie',
    label: 'Pie Chart',
    description: 'Proportional data visualization',
    icon: '🥧',
    tag: 'pie',
    keywords: ['pie', 'chart', 'distribution', 'percentage'],
    code: `pie title Technology Stack
    "Rust" : 40
    "JavaScript" : 25
    "TypeScript" : 20
    "Python" : 10
    "Other" : 5`,
  },

  /* ── C4 Context ─────────────────────────────────────────── */
  {
    id: 'c4context',
    label: 'C4 Context Diagram',
    description: 'System context for architecture docs',
    icon: '🏛️',
    tag: 'c4',
    keywords: ['c4', 'context', 'system', 'architecture'],
    code: `C4Context
    title System Context — Sirens App
    Person(user, "User", "A developer creating diagrams")
    System(sirens, "Sirens", "Local-first Mermaid editor")
    System_Ext(opfs, "OPFS Vault", "Browser private file storage")
    Rel(user, sirens, "Uses")
    Rel(sirens, opfs, "Saves diagrams to")`,
  },

  /* ── Mindmap ────────────────────────────────────────────── */
  {
    id: 'mindmap',
    label: 'Mindmap',
    description: 'Hierarchical idea/topic exploration',
    icon: '🧠',
    tag: 'mindmap',
    keywords: ['mindmap', 'mind', 'map', 'idea', 'brainstorm'],
    code: `mindmap
  root((Sirens App))
    Editor
      Ghost Syntax
      Error Gutter
      Multi-Cursor
    Preview
      Kinetic Zoom
      Click-to-Locate
    Vault
      OPFS Storage
      Privacy Lock
    Themes
      Corporate
      Sketch
      Midnight
      High Contrast`,
  },

  /* ── Timeline ───────────────────────────────────────────── */
  {
    id: 'timeline',
    label: 'Timeline',
    description: 'Chronological event sequence',
    icon: '⏱️',
    tag: 'timeline',
    keywords: ['timeline', 'history', 'events', 'chronological'],
    code: `timeline
    title History of Mermaid
    2014 : First commit by Knut Sveidqvist
    2016 : v0.5 — Sequence Diagrams added
    2018 : v8 — Gantt Chart support
    2021 : v9 — Theme system
    2023 : v10 — Full ESM rewrite
    2024 : Sirens PWA — Local-first era`,
  },

  /* ── Git Graph ──────────────────────────────────────────── */
  {
    id: 'gitgraph',
    label: 'Git Graph',
    description: 'Git branching and merge history',
    icon: '🌿',
    tag: 'git',
    keywords: ['git', 'branch', 'merge', 'commit', 'version'],
    code: `gitGraph
    commit id: "init"
    branch feature/auth
    checkout feature/auth
    commit id: "add login"
    commit id: "add OAuth"
    checkout main
    merge feature/auth
    branch hotfix/bug-42
    checkout hotfix/bug-42
    commit id: "fix null pointer"
    checkout main
    merge hotfix/bug-42`,
  },

  /* ── XY Chart ───────────────────────────────────────────── */
  {
    id: 'xychart',
    label: 'XY Chart (Bar)',
    description: 'Bar or line chart with X/Y axes',
    icon: '📊',
    tag: 'chart',
    keywords: ['chart', 'bar', 'line', 'xy', 'graph', 'data'],
    code: `xychart-beta
    title "Monthly Revenue"
    x-axis [Jan, Feb, Mar, Apr, May, Jun]
    y-axis "Revenue ($K)" 0 --> 100
    bar [42, 58, 71, 65, 83, 91]
    line [42, 58, 71, 65, 83, 91]`,
  },
];

/**
 * Get all unique tags from snippets.
 * @returns {string[]}
 */
export function getSnippetTags() {
  return [...new Set(SNIPPETS.map((s) => s.tag))];
}

/**
 * Search snippets by query text (matches label, description, keywords, tag).
 * @param {string} query
 * @returns {typeof SNIPPETS}
 */
export function searchSnippets(query) {
  if (!query.trim()) return SNIPPETS;
  const q = query.toLowerCase().trim();
  return SNIPPETS.filter(
    (s) =>
      s.label.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.tag.toLowerCase().includes(q) ||
      s.keywords.some((k) => k.startsWith(q))
  );
}
