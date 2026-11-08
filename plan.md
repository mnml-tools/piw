# MASTER PLAN — Minimal Notes & Tasks

> Translated from the original European Portuguese on 2026-11-08 at the owner's request; content unchanged.

> **Master document for Claude Code and subagents**  
> **Version:** 1.0 — 06/11/2026  
> **Status:** Product specification approved in principle; execution subject to the technical and quality gates described below  
> **Target platforms:** Linux, Windows, macOS  
> **Mandatory stack:** Tauri 2, Rust, Svelte, TypeScript, SQLite  
> **Nature:** Personal, local-first, free, open-source desktop application

---

# 0. MASTER INSTRUCTION TO CLAUDE CODE

You are the **Tech Lead, Product Engineer and person responsible for quality** on this project. You receive this document as the primary source of product decisions. The mission is to **plan, architect, implement, test, document and prepare the publication** of a desktop application that combines an excellent notepad and an excellent task manager, with an absolute focus on quick capture, minimalism and native desktop integration.

Work with the rigour of production software and with the mindset of an open-source maintainer. **Do not seek merely to produce a lot of code quickly**: prioritise the user's flow, the consistency of the experience, structural simplicity, data reliability and long-term maintenance.

## 0.1 Rules of conduct — mandatory

1. **Read this document in full before implementing.** Review the existing repository and preserve valid work.
2. **Start with a technical inventory and a proof of concept (spike)** of the critical desktop capabilities. Do not begin with a flashy interface that later cannot support global shortcuts or sticky notes.
3. **Keep a living plan in the repository:** `docs/implementation-status.md`, with phases, tasks, blockers, decisions, evidence and next steps. Update it on completing each milestone.
4. **You may make use of subagents**, if the environment provides that capability. Use them for well-delimited, parallelisable tasks; do not assume they can all write to the same files simultaneously.
5. **No subagent may silently change the architecture or the product experience.** Record proposals in ADRs, validate the integration and maintain a single product vision.
6. **Implement vertically:** each phase must produce complete, verifiable flows (UI → logic → persistence → tests), not dozens of unfinished components.
7. **Do not declare a feature complete without evidence.** Distinguish executed tests from planned tests; do not invent results or compatibility for systems you have not had access to.
8. **Prioritise simple, proven solutions.** Do not introduce microservices, servers, authentication, remote databases or unnecessary abstractions.
9. **Before introducing dependencies**, check maintenance, licence, compatibility with Tauri 2 and bundle impact. Prefer the official tools where appropriate.
10. **The design must be minimalist by default**, without removing important features. Advanced functionality should appear when the user requests it — progressive disclosure.
11. **Preserve the user's data above all else.** Never implement destructive operations without protection, nor schema upgrades without migrations and tests.
12. **Do not publish to GitHub, do not create releases and do not change external configurations** without the owner's explicit approval. Prepare the infrastructure; external actions depend on authorisation.
13. When a minor detail is missing, choose the simplest and most consistent option, record the decision and carry on. Ask for clarification only in the face of a genuine product ambiguity, a risk of data loss or an insurmountable blocker.
14. The user writes in **European Portuguese**. Communication, explanations and functional documentation in this language; code, technical names and identifiers may be in English. Prepare the interface for future internationalisation; supporting multiple languages is not required in the first MVP.
15. **Do not add productivity features on your own initiative** (AI, full calendar, Kanban, chat, collaboration, cloud). An idea only goes in if it directly benefits the defined flows and does not compromise the scope.

## 0.2 Recommended subagents (if available)

| Role | Mission | Deliverable | Rules |
|---|---|---|---|
| Platform Researcher | Validate APIs and limitations of Linux/X11/Wayland, Windows and macOS | `docs/platform-capabilities.md` and spike | Do not declare support without proof |
| UX/Product Designer | Flows, wireframes, empty states, shortcuts and consistency | `docs/ux-spec.md`, visual examples and criteria | Protect minimalism and accessibility |
| Rust/Core Engineer | Domain model, business rules, SQLite, migrations | Rust code, service tests | UI never accesses the SQLite file directly |
| Tauri/Desktop Engineer | Windows, tray, global shortcuts, focus, close, autostart | POCs and integration with Tauri APIs | Isolate platform differences |
| Frontend Engineer | Svelte/TypeScript, design system, Notes, Tasks, Docs | Components and UI tests | Coherent UI, keyboard-first |
| Editor Specialist | Choose and integrate a rich editor, tabs and references to tasks | ADR/editor, serialisation tests | Never duplicate tasks through rendering |
| QA/Release Engineer | Tests, CI, packaging, QA and release readiness | Test matrix, workflows, checklist | Do not mask platform failures |
| Security/OSS Reviewer | Licences, permissions, CSP, privacy, supply chain | Audit, policies and documentation | Least privilege |

**Orchestration:** create simple contracts between areas (domain types, commands and events), define file ownership, integrate in small increments, review the changes of all agents and run the tests again. If there are no subagents, follow the same separation of responsibilities in your own work.

---

# 1. PRODUCT VISION

## 1.1 Problem

During work or personal life, ideas, instructions, tasks and reminders come up that need to be recorded **without interrupting the current context**. Many apps are heavy, force you to navigate through too many options, or are excellent for notes but poor for tasks (or vice versa).

## 1.2 Value proposition

> **A single desktop application, minimalist and fast, that combines Notes and Tasks as two equally complete worlds — with Quick Capture, real sticky notes and structured documents when needed.**

- **Dominant use:** Quick Notes and Quick Tasks.
- **Advanced but secondary use:** long documents with custom tabs, explanations, instructions, code, references and tasks.
- **Integration:** the tasks created inside documents are the **same entities** that appear in the Todo App. Completing in any view updates all the others.
- **Desktop-native:** capture with a global shortcut, independent sticky windows, tray and fast startup.
- **Local-first:** zero accounts, zero mandatory cloud, zero server; the user's data on their own computer.

## 1.3 Product principles (ordered)

1. **Capture in seconds.** The shortcut and the text field are more important than any dashboard.
2. **Notes and Tasks in the same visual language.** Same spaces, typography, sidebar, search behaviour and components.
3. **The simple is simple; the complex is possible.** Do not show the advanced editor to someone who only needs a quick jotting.
4. **A single source of truth.** Never duplicate tasks when presenting them in the document, Tasks and sticky notes.
5. **Keyboard-first, mouse-friendly.** Common actions must work without a mouse, but the UI must be intuitive for those who use one.
6. **A small, respectful application.** Moderate resources, no telemetry by default, no intrusive popups.
7. **Portable, controllable data.** Export, backups, migrations and a readable output format.
8. **Honest cross-platform.** Equivalent functionality wherever feasible, with documented limitations and a useful fallback.

## 1.4 Inspirations — without copying designs

- **Bear:** typographic quality, focus on writing, calm editor, discreet organisation.
- **NotePlan:** closeness between notes, documentation and tasks.
- **Minimalist task managers:** completing tasks with few gestures, clear lists and Today/Upcoming views.

**Do not create** a clone of Bear, NotePlan, Notion or Things. The project's identity is integration with the desktop and the same simplicity across Notes and Tasks.

---

# 2. SCOPE AND FUNCTIONAL RULES

## 2.1 Two pillars, one application

### Notes

- **Quick Note:** optional title, immediate content, simple editing, reliable autosave, search, optional tags, Space, pin to desktop.
- **Document:** structured content, rich text/Markdown-friendly, code blocks, links, internal tabs and the possibility of grouping related notes/tasks.
- A Quick Note can be **converted into a Document** without losing the content or the references. The reverse should only be possible if it does not cause a loss of structure.

### Tasks

- **Quick Task:** short sentence, checkbox, complete/undo, optional description, Space and instant creation.
- **Detailed Task:** subtasks, optional date, link to a document, supporting notes and sticky note.
- **Task views:** All, Today, Upcoming and Completed; filters by Space and, where relevant, by document.
- A task can exist without an associated document, without a date and without a tag.

### Shared experiences

- Sidebar, Spaces, global search, Quick Capture, Pinned/Desktop and design system.
- Any item may appear in more than one **view**, but only one persistent instance exists.
- **Synchronisation** in this plan means *local synchronisation between views and windows*, not cloud synchronisation between devices.

## 2.2 What a Document is

A **Document** is simultaneously:

1. An item in the **Notes** area, with an advanced editor.
2. An optional logical container for related notes and tasks — **there is no need to create a separate Collection/folder with the same name**.
3. An ordered set of **internal tabs**, created and reorganised by the user.

Example: `Refactor 2FA`

- `Overview` — description of the problem and objectives.
- `Implementation` — instructions and code blocks.
- `To-dos` — a real view of the tasks linked to the document.
- `References` — links and additional jottings.

### Tab types

- **Content tab:** a free-content page (text, headings, lists, links, code and, depending on the chosen editor, references to tasks).
- **Tasks tab:** an interactive view of real tasks associated with the document, filterable and synchronised with the global manager.

Several content tabs and one or more tasks tabs with different filters may coexist. Do not force default tabs; when converting a note into a document, create a single tab with the previous content, and allow others to be added.

### Anti-duplication rule

- A task has **one unique identifier**.
- The `To-dos` tab queries and manipulates those tasks, not a copy of strings with a checkbox.
- If a task changes in the Tasks area, the state updates in the document and in any open sticky note.
- If there is a merely editorial checkbox in a text (reading/instructions checklist), the product **must not silently classify it as a global task**. The editor must clearly distinguish `Checklist (conteúdo)` from `Task (ação)` and offer an explicit creation/conversion action. **Every real task created inside a document is mandatorily synchronised.**
- It is not necessary to allow a task to belong to multiple documents in the MVP. Prepare the model for future references, without initial over-engineering.

## 2.3 Organisation: lightweight, consistent and without duplicating concepts

### Spaces

- `Work` and `Personal` as initial examples; the user can rename, create and remove Spaces safely.
- Each note, document or task belongs to a Space; Quick Capture uses a configurable default Space or the last one used.
- `All` is a **global filter**, not a persistent Space.
- A document and its linked items must have clear rules when changing Space (MVP proposal: move the associated items together, with confirmation and preview).

### Documents as groupers

- Instead of adding a separate **Collections** area, a Document groups related items.
- Notes and Tasks not associated with documents continue to exist and to work normally.
- In the global views, discreetly show the name of the source document where applicable.

### Tags

- Optional, cutting across Notes, Tasks and Documents, with no hierarchy in the MVP.
- Do not require tags when capturing. Allow searching by tags, without taking up too much space in the sidebar.

### Inbox

- A view of recent/unorganised captures, not an additional item type.
- **MVP definition:** items with no associated document and not archived, sorted by most recent creation, with the possibility of marking them as organised (its own metadata). Prevent Inbox from becoming a third content base.
- If this rule causes confusion in the UX tests, prefer `Recent` and document the decision in the corresponding ADR.

---

# 3. USER EXPERIENCE (UX)

## 3.1 Main navigation

A **single sidebar** for Notes and Tasks, with coherent elements:

```text
┌───────────────────────────────────────────────────────────────┐
│  App                                            Search   +    │
├─────────────────┬─────────────────────────────────────────────┤
│  Inbox          │                                             │
│  Notes          │  Selected content                           │
│  Tasks          │  (list, editor or document)                 │
│  Pinned         │                                             │
│                 │                                             │
│  SPACES         │                                             │
│  All            │                                             │
│  Work           │                                             │
│  Personal       │                                             │
│                 │                                             │
│  DOCUMENTS      │                                             │
│  Favourites     │                                             │
└─────────────────┴─────────────────────────────────────────────┘
```

- `Notes` and `Tasks` must have **equal visual prominence**; no artificial hierarchies.
- `Pinned` shows the items currently displayed, or prepared to be displayed, on the desktop.
- The Documents section in the sidebar must be **optional/collapsible** and must not become an infinite tree. A document remains accessible in the Notes area.
- Do not add a permanent properties, calendar or metrics panel.

## 3.2 Column policy — closed decision

- **Two columns by default:** sidebar + content.
- **Notes — list:** sidebar + list of notes.
- **Notes — editing:** sidebar + editor; return to the list without losing context.
- **Notes — optional split view:** sidebar + list + editor.
- **Tasks — list:** sidebar + list of tasks, wide enough to read descriptions.
- **Tasks — details:** contextual drawer/panel or lightweight modal, never a mandatory fixed third column.
- **Documents:** focused editor with tabs *inside the document*, not new sections in the sidebar.
- Sidebar and panels can collapse; remember layout preferences separately for Notes and Tasks.
- Narrow windows adapt to a single content region without squashing text.

## 3.3 Quick Capture — main flow

**Goal:** from the global shortcut to saving, with no need for a mouse.

1. The user is in another application (IDE, browser, etc.).
2. Triggers a configurable global shortcut. Initial suggestion: `Ctrl+Shift+Space` on Windows/Linux and `Cmd+Shift+Space` on macOS, **if available and without collision**.
3. A small, centred, discreet popup. Automatic focus on the first field; no lengthy animation.
4. Switch between `Note` and `Task` by keyboard or click. Space and pin optional; title not mandatory for Note.
5. `Ctrl/Cmd+Enter` saves; `Esc` closes; `Tab` navigates; the key combination must be displayed correctly for each system.
6. The popup closes after confirmation **that the data has been persisted**; focus returns to the previous application when the system allows it.
7. A quick reopening must not lose a draft that was closed accidentally.

### Robustness requirements

- If the shortcut is taken/unavailable, inform the user without a fatal error and offer an alternative configuration.
- Avoid shortcuts reserved by the operating system.
- If on Wayland or in an environment that prevents global interception, show a clear alternative route: tray, system launcher/command, a shortcut configured by the desktop environment, or opening capture from the main window.
- If saving fails, do not close silently; preserve the text and show an option to retry.
- The popup must work without opening the main window.
- Do not continuously steal focus or overlay games/fullscreen without the user's intention.

## 3.4 Notes and simple editor

- Creating a note starts with a writing field, not a form.
- The title may be inferred from the first line **for display only**, without altering the text without consent.
- Autosave with discreet feedback; states `Saving`, `Saved`, `Error`, without visual spam.
- Editable content with familiar shortcuts; Markdown-friendly and minimal formatting.
- Search by title and content, highlighting of results and keyboard navigation.
- Empty notes must not pollute the database for every click on `New`.

## 3.5 Tasks

- Aligned checkbox, readable title, discreet metadata.
- Complete without opening the task; possibility to undo and to see completed tasks.
- Open details only when necessary.
- Subtasks with a discreet count/progress; do not turn the app into a project manager.
- Dates are optional; Today and Upcoming show only tasks with applicable dates. `Overdue` can be a small section, not a huge mode.
- If a task belongs to a document, show a link back to it.
- Creation and editing update the associated document and any sticky windows in real time.

## 3.6 Documents and tabs

- Simple horizontal tabs; add, rename, reorder, duplicate if safe, and remove with protection.
- The content of the active tab occupies as much of the editor's width as possible.
- A tab can be `Content` or `Tasks`; the user chooses at creation.
- Content tabs support at least: paragraphs, H1-H3 headings, lists, links, quotes, inline code, fenced code blocks with language, separators and editorial checklists.
- Rich text or Markdown with an excellent experience; export to Markdown without depending on a proprietary format to rescue the data.
- Auto-save per tab; switching tabs must not erase recent changes.
- No gigantic toolbar. Shortcuts, context menu and discreet commands.
- The editor may be based on Tiptap/ProseMirror, CodeMirror or a robust alternative: **write an ADR with proof of serialisation, licences and performance before finalising the choice**. Do not build a rich-text editor from scratch.

## 3.7 Sticky Notes on the desktop — specification

Three different actions (do not confuse them):

- **Pin to Desktop:** displays the item in its own resizable window.
- **Always on Top:** optional, to keep that window above other apps.
- **Hide from Desktop:** closes the sticky window without deleting the item.

Requirements:

- Notes, Tasks and document task views can have a sticky representation, adjusted to the content.
- Small, discreet look, optional soft borders and colours, direct editing when technically feasible.
- Move, resize and reopen; persist position, size and state when the compositor/system allows it.
- Multi-monitor, HiDPI scaling, disconnected monitors, resolution changes and off-screen coordinates: perform a safe recovery to a visible area.
- Multiple windows of the same item must not create copies; avoid duplicates by default.
- Keyboard and focus must work; there is always a way to close/minimise.
- Restore sticky notes on launch **only when the user configures it**, to avoid unexpected exposure of private notes.
- Do not assume that a window can literally stay stuck to the wallpaper on all systems. The goal is native floating windows; the behaviour of workspaces, Wayland and always-on-top varies.

## 3.8 System tray and lifecycle

- Tray with `Quick Note`, `Quick Task`, `Open Workspace`, `Show/Hide Sticky Notes`, `Settings`, `Quit`.
- Define and explain the difference between **closing the window** and **quitting the application**. Proposal: closing the main window hides it to the tray if the option is enabled, with clear onboarding.
- Option to launch with the system, **off by default**.
- Single instance with predictable behaviour when opened again.
- No unnecessary notifications and no automatic reminders in the first MVP.

## 3.9 Design system

- Aesthetic: calm, clean, readable typography, little noise.
- Light/Dark adapting to the system; manual choice in the settings.
- Components shared between Notes/Tasks: sidebar, rows, modals, input, badge, tab, menu, search.
- Neutral palette; specific colours only for states, Spaces and sticky notes when they add meaning.
- Discreet icons, never relying on colour alone.
- States: loading, empty, error, saved, keyboard focus, disabled, confirmation.
- Accessibility: visible focus, sufficient contrast, keyboard navigation, screen reader labels and zoom support.
- Subtle animations, reduced with `prefers-reduced-motion`.
- Responsiveness to small windows, without trying to reproduce a mobile app.

---

# 4. TECHNICAL ARCHITECTURE

## 4.1 Mandatory stack

| Layer | Technology | Rationale |
|---|---|---|
| Desktop shell | **Tauri 2** | Native windows and cross-platform distribution |
| Local backend | **Rust** | Domain, persistence, events and OS integrations |
| Frontend | **Svelte + TypeScript** | Lightweight, reactive and modular UI |
| UI build | Vite | Conventional integration with Svelte/Tauri |
| Persistence | **SQLite** | Local file, migrations and efficient queries |
| Styles | Modern CSS with tokens; Tailwind optional | Consistency without depending on heavy UI kits |
| Rust tests | `cargo test`, `clippy`, `fmt` | Core rules and quality |
| UI tests | Vitest + Testing Library; e2e suited to the platform | Verifiable behaviour |
| CI/CD | GitHub Actions | Linux, Windows, macOS matrix |

**Versions:** confirm in the official documentation and pin compatible versions at the time of execution. Do not follow Tauri 1 tutorials as if they were Tauri 2. Check the Rust MSRV of the official plugins.

## 4.2 Responsibilities and boundaries

```text
Svelte / TypeScript
 ├── Workspace (sidebar, Notes, Tasks, search)
 ├── Quick Capture (independent window)
 ├── Document Editor (tabs, content, task views)
 └── Sticky Windows (item/view UI)
           │
           ▼  Tauri Commands + Events (typed)
Rust application layer
 ├── Notes / Documents / Tabs services
 ├── Tasks / Subtasks services
 ├── Spaces / Tags / Search services
 ├── Window Manager / Shortcuts / Tray adapters
 └── Validation / Settings / Export / Backup
           │
           ▼
Local SQLite (versioned schema, migrations, indexes)
```

### Architectural rules

- **Rust is the source of truth** for mutations and business rules; do not write arbitrary SQL from the Svelte components.
- Types of `commands`, errors and payloads aligned between Rust and TypeScript; consider generating bindings only if it adds value.
- The UI holds derived state and sends intents; multiple windows subscribe to change events or receive a clear invalidation to refresh data.
- Services testable without initialising the whole Tauri interface.
- Adapters for OS-specific calls, isolating differences and fallbacks.
- Typed errors, local logs without sensitive content, failure handling in the frontend.
- Do not create a local HTTP server if the Tauri commands are sufficient.

## 4.3 Suggested structure (adapt to the official scaffold)

```text
repo/
├── README.md
├── plan.md
├── LICENSE
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── SECURITY.md
├── CHANGELOG.md
├── .editorconfig
├── .github/
│   ├── ISSUE_TEMPLATE/
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── workflows/
│       ├── ci.yml
│       └── release.yml
├── docs/
│   ├── implementation-status.md
│   ├── product-spec.md
│   ├── ux-spec.md
│   ├── platform-capabilities.md
│   ├── testing-matrix.md
│   ├── architecture.md
│   └── adr/
├── src/                     # Svelte / TypeScript
│   ├── lib/components/
│   ├── lib/editor/
│   ├── lib/stores/
│   ├── lib/ipc/
│   ├── lib/shortcuts/
│   ├── routes-or-views/
│   └── styles/
├── src-tauri/
│   ├── src/
│   │   ├── domain/
│   │   ├── application/
│   │   ├── infrastructure/
│   │   │   ├── sqlite/
│   │   │   └── platform/
│   │   ├── commands/
│   │   └── app.rs
│   ├── migrations/
│   ├── capabilities/
│   └── tauri.conf.json
└── tests/
```

Do not turn this suggestion into dozens of empty files. Grow in line with the real code.

## 4.4 Conceptual data model

**Stable identifiers** (preference: UUID) and timestamps in a consistent format (UTC in persistence; local presentation). Use appropriate constraints, foreign keys and indexes.

| Entity | Indicative fields | Notes |
|---|---|---|
| `spaces` | `id`, `name`, `sort_order`, `is_default` | Work/Personal are data, not rigid constants |
| `notes` | `id`, `space_id`, `kind`, `title`, `body/summary`, `parent_document_id?`, `created_at`, `updated_at`, `archived_at?` | `kind` = quick_note/document; avoid a duplicated body when it is a document |
| `document_tabs` | `id`, `document_id`, `title`, `type`, `sort_order`, `content_json?`, `created_at`, `updated_at` | `type` = content/tasks_view; deterministic ordering |
| `tasks` | `id`, `space_id`, `parent_document_id?`, `parent_task_id?`, `title`, `description`, `status`, `due_at?`, `completed_at?`, `sort_order`, timestamps | Same task in all views; subtasks via `parent_task_id` |
| `tags` | `id`, `name` | Normalisation and uniqueness |
| `entity_tags` | `entity_type`, `entity_id`, `tag_id` | Validate references; or separate join tables if safer |
| `sticky_windows` | `id`, `target_type`, `target_id`, `x?`, `y?`, `width`, `height`, `always_on_top`, `visible_on_startup` | One representation for an item/view; data subject to the OS |
| `settings` | `key`, `value`, `updated_at` | Local preferences only |
| `capture_drafts` | `id`, `type`, `content`, `updated_at` | Draft recovery |

**Do not blindly copy this table into production:** produce a diagram/ADR, validate cardinalities, integration constraints and migration strategy. Do not confuse the conceptual entities with the final physical implementation.

### Integrity rules

1. A task associated with a document **always keeps the same `id`** in the global view and in the tabs.
2. Deleting/archiving documents must not delete tasks accidentally: choose an explicit rule (proposal: soft delete with recovery, plus an option to unlink items).
3. Renaming/moving a Space or document propagates the changes through relations, never by copying strings.
4. Autosave does not create divergent versions between windows; manage local concurrency and simultaneous changes predictably (rev/updated_at and a conflict strategy).
5. Filters, searches and counters are computed from the same persistence.
6. Changes that affect several tables are transactional.

## 4.5 SQLite and data safeguarding

- Database stored in the operating system's appropriate **app data** folder, not alongside the distributed binary.
- Versioned migrations with upgrade tests from previous versions; transactions where feasible.
- Consider `WAL`, `foreign_keys=ON`, `busy_timeout` and a recovery/backup plan suited to the needs.
- Backups must be consistent with SQLite (backup API or checkpoint/safe copy, not blind copying during a write).
- Asynchronous writing without freezing the UI; confirm persistence at critical moments.
- **MVP export:** notes/documents in Markdown and tasks in readable JSON/CSV, with IDs/associations preservable where possible. Consider a full export in a versioned format.
- **Import:** may be left for a post-MVP phase, but document from the start the strategy for re-importing exported backups; an export must not be sold as a full restore without proof.
- Test long text, Unicode, emojis, empty files, crashes during saving, schema updates and reinstallation.

## 4.6 Advanced editor and serialisation

Run a spike comparing 2–3 mature editors (e.g. Tiptap, CodeMirror, Milkdown/Lexical if compatible). Evaluate:

- Writing and keyboard experience, Svelte integration, size and maintenance.
- Modelling of rich content and editorial checklists.
- Code blocks and language selection.
- Deterministic serialisation and high-fidelity Markdown export.
- A `task_reference` node/element or a safe representation of real tasks without copying data.
- Compatibility with multiple windows and autosave.
- OSS licences for all the features actually used.

**Conscious choice:** prefer storing a structured canonical editor format **if** necessary to preserve features, but guarantee an open export. Document the trade-offs in the ADR `docs/adr/0002-editor.md`.

## 4.7 Security and privacy

- No login, account, analytics, tracking, network calls or telemetry in the MVP.
- Do not expose unnecessary filesystem/shell/OS privileges to the UI; limit Tauri capabilities per window.
- An appropriate CSP policy, sanitised pasted HTML content and external links opened safely.
- Avoid SQL injection (parameterised queries) and arbitrary code in the editor.
- Never store user secrets in logs; error logs must not contain the full text of notes/tasks.
- Check dependency licences, vulnerabilities and permissions before publishing.
- The auto-updater remains optional/post-MVP; if it is added, require signed updates and correct configuration.

---

# 5. CROSS-PLATFORM: REQUIREMENTS AND LIMITATIONS

## 5.1 Policy

Linux, Windows and macOS are **MVP targets**, not future ports. But there is a difference between **compiling** and offering the same real experience. Create `docs/platform-capabilities.md` with the test results per platform/environment.

### Initial validation matrix

| Area | Linux/X11 | Linux/Wayland | Windows | macOS |
|---|---|---|---|---|
| Main window and editor | Test | Test | Test | Test |
| Popup and focus | Test | Test restrictions | Test | Test |
| Global shortcut | Test | **High risk; verify fallback** | Test collisions | Test collisions and permissions |
| Sticky windows | Test | Check compositor | Test | Test Spaces/fullscreen |
| Always on Top | Test | May vary | Test | Test |
| Position and multiple monitors | Test | May be restricted | Test | Test |
| System tray | Test environment | Test environment | Test | Test menu bar |
| Autostart | Test | Test | Test | Test |
| Installer/signatures | .deb/AppImage/etc. | Ditto | MSI/NSIS | .app/DMG and notarisation |

**Wayland:** applications may not be able to freely control global shortcuts, positioning and focus; do not work around the compositor's security in a fragile way. Evaluate appropriate APIs/portals and document a manual alternative via a launcher shortcut or tray. Promise only what has been validated in the supported environments.

## 5.2 Mandatory spike — before the core

Build the smallest Tauri 2 app that can:

1. Open the workspace, the capture popup and **two independent sticky windows**.
2. Register and unregister a global shortcut; handle unavailability and conflicts.
3. Toggle Always on Top, hide and reopen a sticky, preserve the reference to the item.
4. Save and restore dimensions/position when supported.
5. Close the workspace without killing the tray/sticky, and quit correctly.
6. Receive events and update the UI across several windows.
7. Record evidence per system and list limitations/fallbacks.

**Gate:** if any behaviour is not feasible on a system, discuss a fallback design **before moving forward**, and never hide the problem until the end.

---

# 6. EXECUTION ROADMAP

Use the following statuses in `docs/implementation-status.md`: `TODO`, `IN_PROGRESS`, `BLOCKED`, `DONE_VERIFIED`. Each phase has concrete deliverables and a completion gate.

## Phase 0 — Discovery and quality foundation

- [ ] Inspect the repository, tool versions and available dependencies.
- [ ] Create `docs/product-spec.md` consistent with this plan.
- [ ] Create `docs/architecture.md` and the initial stack ADR.
- [ ] Define rules for code, lint, format, tests and commits.
- [ ] Prepare reproducible development and build scripts.
- [ ] Create initial design tokens and a UX guide, without an excess of components.

**Gate:** everyone can understand how to run, test and contribute, even from a clean clone.

## Phase 1 — Cross-platform spike (CRITICAL)

- [ ] Tauri 2 + Rust + Svelte/TS with a main window.
- [ ] Capture in a separate window; reliable focus/close.
- [ ] Configurable global shortcut or documented fallback.
- [ ] 2+ sticky windows, Always on Top, hide/show and state.
- [ ] Tray, single instance, lifecycle and events between windows.
- [ ] Limitations matrix with reproduction steps.

**Gate:** capability demonstrated, spike code reusable or consciously discarded, risks known per OS.

## Phase 2 — Domain, SQLite and integration

- [ ] Migrations: Spaces, Notes, Documents/Tabs, Tasks/Subtasks, Settings, Sticky.
- [ ] Rust services and typed commands for CRUD.
- [ ] `task ↔ document` association rules, without duplication.
- [ ] Search by title and content (FTS5 if justified, with appropriate indexes).
- [ ] Events to keep windows synchronised.
- [ ] Integrity, migration and concurrency tests.

**Gate:** an automated test demonstrates that changing a task updates the same entity in any view/query.

## Phase 3 — Essential Notes and Tasks

- [ ] Common sidebar and two-column layout.
- [ ] Create/edit/delete/archive Quick Note.
- [ ] Create/complete/undo/edit Quick Task.
- [ ] Subtasks, Space and basic filters.
- [ ] Consistent search and listing; empty states.
- [ ] Autosave, draft recovery and persistence feedback.
- [ ] Keyboard shortcuts and basic accessibility.

**Gate:** it is possible to use the application **daily** just for notes and tasks without opening any document.

## Phase 4 — Quick Capture (reference flow)

- [ ] Global shortcut/fallback opens capture in an external context.
- [ ] Switch Note/Task and Space without a mouse.
- [ ] Save with the keyboard and close **after** confirmation.
- [ ] Recover the draft and handle a persistence error.
- [ ] Capture when the workspace is hidden.
- [ ] Focus, conflict and quick-reopening tests.

**Gate:** `atalho → escrever → guardar → regressar ao trabalho` without data loss, at least in the viable test environments.

## Phase 5 — Documents with tabs and synchronised tasks

- [ ] Choose the editor after ADR/POC.
- [ ] Convert Quick Note to Document without losing content.
- [ ] Create/rename/reorder/remove tabs safely.
- [ ] Content tabs with Markdown-friendly rich text and code.
- [ ] Tasks tabs query/create associated global tasks.
- [ ] A document can group other notes/tasks, without duplicated Collections.
- [ ] Navigation Tasks → document and document → Task.
- [ ] Multi-window event synchronization and tests.

**Gate:** in the `Refactor 2FA` example, a task created in `To-dos` appears in Tasks; completing it anywhere updates both, without copies.

## Phase 6 — Productive Sticky Notes

- [ ] Pin/Hide/Always on Top clearly separated.
- [ ] Open a sticky from a Note/Task/Document task view.
- [ ] Editing/completion in the sticky synchronised with the workspace.
- [ ] Resizing, positioning and restoration with fallback.
- [ ] Per-sticky preferences and recovery of invisible windows.
- [ ] Private/predictable behaviour on startup and after quit.

**Gate:** editing/completing in the sticky is immediately reflected in other views and survives a restart; per-OS degradation documented.

## Phase 7 — Polish, export and security

- [ ] Light/dark; configurable preferences and shortcuts.
- [ ] Open export (and testing of the files produced).
- [ ] Consistent backup and restore documentation; do not promise import if absent.
- [ ] Performance, keyboard, accessibility and security audit.
- [ ] Migration/upgrade tests; window and monitor issues.
- [ ] Verification of OSS licences and dependencies.

**Gate:** no known data-loss failure; a clean interface in normal and error flows.

## Phase 8 — GitHub and open-source release candidate

- [ ] README with real screenshots, features, installation, build and limitations.
- [ ] MIT `LICENSE` (confirm the rights holder's approval), CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, CHANGELOG.
- [ ] Issue and PR templates; review checklist.
- [ ] GitHub Actions: Rust fmt/clippy/test, TS typecheck/lint/test, Linux/Windows/macOS build.
- [ ] Per-platform artefacts; release workflows **manual or conditional on approval**.
- [ ] Signing/notarization strategy documented and rehearsed according to the available credentials.
- [ ] Test installation, launch, upgrade and uninstallation on each relevant OS.
- [ ] Prepare release notes, known limitations and a smoke-test checklist.

**Gate:** release candidate documented, traceable and installable on the platforms actually verified. **Do not publish automatically.**

---

# 7. ACCEPTANCE CRITERIA — REAL SCENARIOS

These scenarios are product tests; turn the critical ones into automated tests and keep the rest in the manual matrix.

### CA-01 — Instant note

**Given** that I am in another application, **when** I use the configured shortcut, type `Ligar ao fornecedor` and save, **then** the note is persisted, appears in Notes and I can return to the previous app. If the shortcut is not available, there is a clear alternative method.

### CA-02 — Instant task

Create `Comprar café` as a Quick Task with no date, description or document. It must appear in the Tasks list, be completable with one click and remain completed after restarting.

### CA-03 — Note converted into Document

Create Quick Note `Refactor 2FA` with an initial paragraph. Convert it into a Document. The initial text is kept, with one Content tab. Add `Implementation` and `To-dos` without unintended changes to the original.

### CA-04 — Mandatory task synchronisation

In the `To-dos` tab of `Refactor 2FA`, create `Adicionar testes unitários`. The task appears automatically in the Tasks area, filterable by Work. Completing it in Tasks updates the document and the open sticky. **The ID is the same; the database contains one task, not three.**

### CA-05 — Editorial checklist vs real task

A checklist with reading steps in a Content tab does not inadvertently appear in Tasks. Explicitly creating/associating a real task makes it appear in Tasks and in all related views.

### CA-06 — Sticky on the desktop

Pin a note and a task. Move/resize, enable Always on Top on only one of them, hide one without deleting it and reopen it. Restart the app and verify the recovery of preferences, respecting the OS capabilities.

### CA-07 — Multiple monitors

Move a sticky to a secondary monitor, disconnect that monitor, open it again. The window must not become unrecoverable; fallback to a visible area.

### CA-08 — Draft and error

Create a note, simulate a save failure/sudden close and come back. Do not lose text silently; present recovery or an understandable error.

### CA-09 — Global search

Searching `2FA` finds the relevant document, note and tasks, shows type and context and allows each result to be opened in the right place.

### CA-10 — Adaptive layout

Notes uses two columns by default, optionally three; Tasks uses two, with contextual details. Switching between Notes and Tasks does not modify the sidebar nor cause an abrupt change in the visual language.

### CA-11 — Offline and privacy

Install, launch, create, edit and search with the network disconnected. Verify the absence of unexpected telemetry/remote service calls.

### CA-12 — Cross-platform and permissions

If a native feature is not available, the application does not terminate abruptly. It shows a documented alternative and records the state in the capabilities matrix.

---

# 8. TESTING, QUALITY AND DEFINITION OF DONE

## 8.1 Test pyramid

- **Rust unit:** services, state, ordering, associations, dates, removal/conversion rules, failures.
- **Rust + SQLite integration:** migrations, integrity, transactions, concurrency, searches and backups.
- **Svelte unit/component:** forms, tabs, checkboxes, filters, navigation, keyboard and accessibility.
- **UI E2E:** capture flow, notes, tasks, documents and synchronisation; distinguish web testing of the shell from native testing.
- **Native smoke tests:** windows, tray, shortcuts, always-on-top, multiple monitors, reinstallation and distribution.
- **Compatibility matrix:** tests on X11 and Wayland when available, Windows and macOS, with evidence per OS/compositor version.

**Never claim that a test executed only in a browser validates the Tauri global shortcut or system tray integration.**

## 8.2 Code quality

- `cargo fmt --check`, `cargo clippy` (zero relevant warnings), `cargo test`.
- TypeScript strict, typecheck, lint and Vitest.
- CI scripts easy to reproduce locally.
- Errors handled; no irresponsible `unwrap` in runtime paths.
- No abandoned dependencies, secrets, tokens or local files pushed to Git.
- Typed events; contracts and tests for states across windows.
- Review of diffs, prudent refactoring, readable code and succinct documentation.

## 8.3 Performance (targets to measure, not promises)

- A responsive, focused popup with no perceptible slowness after the shortcut.
- Fluid typing in long documents and lists with hundreds of tasks.
- Fast search in a realistic local database.
- Reasonable memory/CPU with several sticky notes open.
- Define metrics and a baseline on modest hardware, record measurements in `docs/performance.md`.

## 8.4 Definition of Done for a feature

Only mark `DONE_VERIFIED` when:

1. The complete flow works and has error handling.
2. The data persists and remains correct after a restart.
3. The UI is consistent with the design system and accessible by keyboard.
4. The relevant tests pass, with commands/results documented.
5. The impacts on other windows and platforms have been verified or explicitly flagged as not verified.
6. Documentation and acceptance criteria are up to date.
7. There are no known regressions nor log messages with sensitive information.

---

# 9. OPEN-SOURCE AND GITHUB STRATEGY

## 9.1 Principles

- Clean repository, clear description, **real** screenshot(s), build instructions and a public roadmap.
- **Proposed licence: MIT**, subject to confirmation by the owner and verification of the dependencies (including fonts, icons and assets).
- Contributions welcomed with clear guidelines, small issues and useful labels (`good first issue`, `bug`, `enhancement`, `platform/linux`, etc.).
- Avoid an unstable internal API without documentation when it is relevant to contributors.
- Keep the relevant decisions in `docs/adr/`.

## 9.2 Essential files

- `README.md`: vision, features, requirements, installation, development, screenshots, Wayland FAQ, privacy and roadmap.
- `LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `CHANGELOG.md`.
- `.editorconfig`, `.gitignore`, scripts and test matrix.
- Issue/PR templates and CI workflows.
- `docs/architecture.md`, `docs/ux-spec.md`, `docs/platform-capabilities.md`, ADRs.

## 9.3 Releases and builds

- CI on PR and main, build/test on the target platforms; do not enable automatic publication of releases without authorisation.
- Initially candidate packaging: Linux AppImage/.deb, Windows NSIS/MSI, macOS .app/DMG; choose the formats actually tested.
- Code signing/notarisation depend on the platforms' credentials and policies. If these are missing, **document clearly** the limits and installation steps — without pretending to have certified builds.
- Release artefacts with checksums and verification instructions where feasible.
- Semantic versioning and a readable changelog.

---

# 10. DEFINED MVP AND FUTURE FEATURES

## 10.1 MVP v0.1 — mandatory

- Notes and Tasks with the same navigation, sidebar and Spaces.
- Quick Notes, Quick Tasks, description, subtasks, complete/undo.
- Global search; basic filters; optional dates and relevant Tasks views.
- Quick Capture via global shortcut **where supported**, with an accessible fallback.
- Documents with free content tabs and task views.
- Tasks inside the document synchronised bidirectionally with the Todo App.
- Documents can also group related notes/tasks, without extra Collections.
- Real Sticky Notes: pin/hide, optional always-on-top and reasonable persistence.
- Tray, clear lifecycle, light/dark theme, local SQLite data.
- Tests, documentation, export, CI and builds evaluated for the three systems.

## 10.2 Post-MVP — only after stabilising

- Links between notes/documents, backlinks and a lightweight graph (not mandatory).
- Recurring tasks and configurable local reminders.
- Full import/restore; attachments/images if there is a safe model.
- Document templates.
- Universal Command Palette (may be brought forward if it simplifies real navigation).
- More search and filtering options; advanced drag & drop.
- Synchronisation between devices, **only following a later product decision**.
- Auto-updater with correct signing/infrastructure.
- Internationalisation, additional themes and plugins — evaluate later.

## 10.3 Out of scope by default

- Accounts and login; SaaS or a remote backend.
- AI, transcription, automatic task generation.
- Real-time collaboration.
- Complex calendar, Kanban, Gantt, MMR/statistics or enterprise project management.
- A page editor at the level of a Notion clone.
- Infinite subfolders, dozens of properties or dashboards by default.

---

# 11. PRODUCT DECISIONS: CLOSED VS. OPEN

## Closed by the owner

- Desktop for **Linux + Windows + macOS from the start**.
- **Tauri 2 + Rust** instead of Wails/Go; Svelte/TypeScript for the UI in this plan.
- **Two applications in one:** complete Notes and Tasks, but visually integrated.
- Quick Notes/Quick Tasks dominate usage; Documents are optional and more advanced.
- Documents with free tabs and the possibility of Tasks tabs.
- **All real tasks created in Documents appear synchronised in Tasks.**
- Sticky notes on the desktop, pin, global shortcut and quick creation are essential.
- Coherent, minimalist sidebar; two columns by default, a third optional/contextual.
- Organise with Spaces and documents that also serve as groupers; avoid redundant Collections.
- Local-first, open-source, GitHub.

## To be validated by ADR or spike (without blocking work unnecessarily)

- Concrete editor library and canonical serialisation.
- Exact interaction for inserting a real task in a content tab vs a Tasks tab.
- Availability of shortcuts/positioning per Linux/Wayland environment, and fallbacks.
- Best editor experience in small-sized sticky notes.
- Final removal/archiving policy for documents with associated tasks.
- Export and full backup/reimport strategy.
- Name, icon, branding and final MIT licence.
- Distribution formats and signing.

Record the compromises in ADRs, with the alternatives considered, the decision and the impact, without confusing them with requirements already approved.

---

# 12. CLAUDE CODE'S FIRST WORK CYCLE

Carry out these steps, in this order:

1. **Analyse this `plan.md`** and report succinctly any contradictions or dependencies that compromise the product.
2. **Inspect the repository** and create or update `docs/implementation-status.md` with phases, owners, criteria and risks.
3. **Confirm the current official versions** of the stack and Tauri plugins; document sources and decisions.
4. **Prepare the Tauri 2 + Rust + Svelte/TypeScript scaffold**, with good repo practices, without superfluous frameworks.
5. **Run the cross-platform spike (Phase 1)** before building the editor or the final interface.
6. In parallel, if there are subagents: delegate platform research, UX spec, editor evaluation and OSS/QA; integrate the results into the architecture.
7. **Present a short report after each gate**, with what was implemented, the test commands actually run, results, risks and next steps.
8. After the spike, proceed phase by phase autonomously, without waiting for approval on trivial technical details. **Ask for a decision only when a relevant product change or an external action justifies it.**
9. Prepare GitHub/CI, but **do not push or publish a release without authorisation**.
10. **Never declare the application ready just because the build passed.** The definition of done is the user experience, data persistence, tests and evidence of compatibility.

### Recommended format for execution reports

```text
PHASE: Phase N — [name]
STATUS: DONE_VERIFIED / IN_PROGRESS / BLOCKED
IMPLEMENTED: [features actually available]
TESTS RUN: [commands + real results]
PLATFORM CHECKS: [tested / not tested / limitations]
RISKS: [blockers and alternatives]
FILES / ADRS: [relevant artefacts]
NEXT: [next vertical increment]
```

---

# 13. STARTING TECHNICAL REFERENCES

Consult the current official documentation and confirm version compatibility before installing:

- Tauri 2: https://v2.tauri.app/
- Global Shortcut plugin: https://v2.tauri.app/plugin/global-shortcut/
- Official plugins (incl. SQL, autostart, window-state, single-instance): https://v2.tauri.app/plugin/
- Distribution and packaging: https://v2.tauri.app/distribute/
- GitHub Actions for Tauri: https://github.com/tauri-apps/tauri-action
- Svelte: https://svelte.dev/docs
- Rust: https://doc.rust-lang.org/
- SQLite: https://www.sqlite.org/docs.html

These references **do not replace real tests**, especially for desktop integrations that depend on the operating system/compositor.

---

## EXPECTED OUTCOME

The final outcome must be an application that the owner **wants to open every day**: simple enough to save `Comprar café` in seconds, rich enough to document `Refactor 2FA` with instructions and synchronised tasks, and sufficiently integrated into the desktop to keep small pieces of information in view **without visual noise**.

**If a decision makes the application more complex without improving one of these flows, simplify it.**
