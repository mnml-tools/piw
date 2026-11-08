# Architecture

Piw is a Tauri 2 desktop app. A Rust core owns all data and OS integration; a React UI renders it
in several native windows. Data lives in one local SQLite file. There is no server, account or
network access.

```text
 React + TypeScript (one bundle, one view per window label)
 ├── main                  Workspace: top bar, Inbox, Notes, Tasks, Pinned, documents, search, Settings, Trash
 ├── capture               Quick Capture popup (pre-created, hidden, opened by the global shortcut)
 └── sticky:<kind>:<id>    Sticky windows for a note, a task or a document's Tasks tab
          │  typed commands (src/lib/ipc/api.ts)        ▲  piw://changed {changes, origin}
          ▼                                             │
 Rust (src-tauri/src)
 ├── commands/   thin #[tauri::command] handlers: worker thread → service → broadcast
 ├── services/   business rules over rusqlite, one transaction per operation
 ├── domain/     pure types and rules (titles, names, dates, change sets)
 ├── storage/    Database (single connection, WAL), versioned migrations
 └── platform/   windows, stickies, shortcuts (portal / plugin), tray, lifecycle, CLI, env, UI scale
          │
          ▼
 SQLite: <app data dir>/piw.sqlite3 (FTS5 search index kept in sync by triggers)
```

The visual and behaviour rules for every screen live in the
[design system](ui-design-system.md). The stack is Tauri 2.12, Rust (edition 2024, MSRV 1.90,
`unsafe_code = deny`), React 19, TypeScript (strict), Vite, TanStack Query, Zustand, Tiptap 3,
lucide icons and plain CSS with design tokens; no UI kit. Every dependency version is pinned.

## UI layers

- `src/components/ui`: the shared component library (Button, IconButton, Checkbox, Dialog,
  Drawer, Menu, Segmented, Tabs, TextInput, Toast, DateQuickPicker, EmptyState and others),
  described in [design system §7](ui-design-system.md#7-components-srccomponentsui).
- `src/components/app`: the page skeleton (`Page.tsx`: view header, columns, groups), the space
  menu and scroll helpers shared by every area.
- `src/views/workspace`: the main window. `WorkspaceApp.tsx` and `TopBar.tsx` form the shell;
  one folder per area (`inbox`, `notes`, `tasks`, `pinned`, `trash`, `settings`) plus
  `document`, `search` and `spaces`.
- `src/views/capture` and `src/views/sticky`: the Quick Capture popup and the sticky windows.
  `src/views/gallery` is a dev-only component gallery.
- `src/app`: providers, theme, and `window-kind.ts`, which maps the window label to a view.
  `Root.tsx` lazy-loads each view, so the capture popup never loads the document editor.
- `src/strings`: every user-facing string. `src/styles`: `tokens.css` (the design tokens),
  `base.css`, and `tokens.test.ts`, which checks contrast and that both themes define the same
  tokens.

Views compose components; components never call the backend. Colours come only from tokens, and
everything must be keyboard-operable without colour carrying meaning alone.

## Behaviour and boundaries

- `src/lib/hooks/data.ts`: one TanStack Query hook per read (`useNotes`, `useTasks`,
  `useDocument`, `useInbox`, `useSearch`, `usePinned`, `useTrash` and others), keyed by
  `src/lib/query/keys.ts`. Writes go through `api`; the cache refreshes from change events, so
  mutations never patch caches by hand.
- `src/lib/query/sync.ts`: listens for `piw://changed` in every window and invalidates only the
  query roots that depend on the changed entity kinds. Only queries on screen refetch.
- `src/state/workspace.ts`: the Zustand store for navigation and layout (area, open item, space
  filter, split view, task view, last tab per document), persisted between launches.
- `useAutosave` and `src/lib/autosave.ts`: debounced, rev-guarded saves with a visible state; a
  stale save surfaces as a conflict instead of overwriting.
- `useNoteSession`, `useNotesView` and `useNoteActions`: the notes area, from an unsaved draft
  (created on the first character) to archive and Trash with undo.
- `src/views/workspace/tasks`: sections (Overdue, Today, Upcoming), keep-in-place for completed
  rows until you leave the view, the inspector drawer and task commands.
- `useCapture`: Quick Capture modes, the persisted draft, and closing only after the save is
  confirmed.
- `useHotkeys` and `src/lib/shortcuts`: in-app shortcuts and the global accelerator's validation.
- `src/lib/export/build.ts`: builds the export files (Markdown, JSON, CSV) that Rust writes.

### IPC contract

- Rust DTOs derive `ts_rs::TS`. `pnpm bindings` regenerates `src/lib/ipc/bindings/*.ts`
  (`TS_RS_EXPORT_DIR` in `.cargo/config.toml`); the files are committed and CI fails if they are
  stale. `i64` maps to `number`, since revisions, counts and orders stay far below 2^53.
- The UI calls commands only through the typed functions in `src/lib/ipc/api.ts`, never `invoke`
  directly. `call<T>()` normalises every failure to `IpcError { code, message }`.
- Errors are data: `{ code, message }` with a stable code (`not_found`, `validation`, `conflict`,
  `storage`, `platform`, `internal`). Messages never include note or task text. If the database
  cannot be opened, `app_status` reports it instead of crashing and the file is left untouched.

## Rust core

- `commands/`: thin handlers. Each runs its service on a worker thread inside `Database::write`
  (a `BEGIN IMMEDIATE` transaction) and, after commit, broadcasts the `ChangeSet` it touched.
  `scope.rs` limits sticky windows to their own item.
- `services/`: business rules (notes, documents, tasks, inbox, search, spaces, tags, settings,
  drafts, stickies, trash, export) with their tests in `services/tests.rs`. Every write is a
  service function that returns a `ChangeSet`.
- `domain/`: pure types and rules: titles and size limits, dates, change sets.
- `storage/`: the single connection and the migrator.
- `platform/`: windows, sticky placement, global shortcuts, tray, lifecycle, CLI flags
  (`--quick-note`, `--quick-task`, `--hidden`), environment switches, navigation lock and UI
  scale. Each capability either works, degrades with a documented fallback, or reports why it
  is unavailable; a missing native feature is never fatal.

Runtime code has no `unwrap`/`expect` (Clippy warns); errors map to `AppError`, and logs carry
categories and ids, never content.

## Data model

Schema: `src-tauri/migrations/`. A schema change is a new `NNNN_name.sql` file with an upgrade
test; a released migration is never edited.

| Table                            | Holds                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------ |
| `spaces`                         | Work, Personal and user spaces. Every item belongs to exactly one                                |
| `notes`                          | Quick notes and documents (`kind`). Converting keeps the id; a document's text lives in its tabs |
| `document_tabs`                  | Ordered Content tabs (ProseMirror JSON + derived plain text) and Tasks tabs (validated filters)  |
| `tasks`                          | Tasks with an optional document link and one level of subtasks (`parent_task_id`)                |
| `tags`, `note_tags`, `task_tags` | Flat tags with real foreign keys; unused tags are removed                                        |
| `sticky_windows`                 | A row means "pinned"; `is_open` means visible; geometry and on-top                               |
| `settings`, `capture_drafts`     | Typed settings; the Quick Capture draft                                                          |
| `search_index`                   | FTS5 (`unicode61 remove_diacritics 2`), kept in sync by triggers                                 |

- **Ids** are UUIDv7 text; timestamps are UTC ISO-8601; task dates are all-day `YYYY-MM-DD`, so
  Today and Upcoming use the local calendar with no time-zone bugs.
- **One entity, many views.** A task is one row however many views show it (Tasks, Inbox,
  document Tasks tabs, search, stickies). Subtasks inherit space and document; moving a document
  moves its tasks.
- **Deletion** is soft (`deleted_at`, Trash) with archive for notes (`archived_at`) and no
  automatic purge. "Delete forever" removes the row and `secure_delete` overwrites its text.
- **`rev`** increases only on text edits. Autosave sends `expectedRev`; a stale save returns
  `conflict`. Discrete actions (complete, move, dates) never cause false conflicts.
- **Inbox** is a query, not a table: top-level notes and tasks with no document, not archived,
  not completed and not triaged (`triaged_at`).
- **Durability:** WAL, `synchronous=FULL`, `busy_timeout=5000`, `foreign_keys=ON`,
  `trusted_schema=OFF`, `CHECK`s and integrity triggers. Migrations use `PRAGMA user_version`,
  one transaction each, with a `VACUUM INTO` copy before upgrading; a database newer than the app
  is refused untouched.

## Documents and the editor

Content tabs use Tiptap 3 (`src/lib/editor`). One schema, built by `createEditorExtensions()`,
serves the editor, paste, export and tests: headings H1–H3, lists, quotes, code blocks
(lowlight), safe links, editorial checklists (`checklist`/`checklistItem`) and `taskRef`.

- **Canonical format.** `document_tabs.content_json` stores ProseMirror JSON validated by the
  schema, deterministic and equal to `editor.getJSON()`. Content that does not validate (e.g.
  from a newer version) is shown read-only with a warning and never re-saved.
- **Checklist vs task.** An editorial checklist item is content. A real task inside a tab is a
  `taskRef` node holding only a lowercase UUID `taskId`; title and status always come from the
  task store, and completing it calls the real task's command. `Mod+T` creates the task and
  inserts the reference.
- **Markdown** (`serialization.ts`, private `marked` instance): deterministic GFM; checklists
  are `- [ ]` / `- [x]`; a task reference is `[[task:<uuid>]]`; code fences are always longer
  than any backtick run inside. Canonical Markdown round-trips byte for byte, checked by golden
  tests, because `@tiptap/markdown` is an early release.
- **Plain text** (`jsonToPlainText`) feeds the search index; task references add no text since
  tasks have their own index entry.
- The original editor comparison (Tiptap vs CodeMirror) is archived in `spikes/editor/`.

## Windows

| Label                | Created                            | Lifecycle                                                                                                                             |
| -------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `main`               | at startup, hidden with `--hidden` | Closing it hides it to the tray (setting). On macOS the Dock icon follows its visibility                                              |
| `capture`            | at startup, hidden                 | Undecorated, always on top, skip taskbar. Hidden on Esc/close, never destroyed                                                        |
| `sticky:<kind>:<id>` | on pin/open                        | One per target (the label is the identity). Destroyed on hide. Placement is owned by `StickyRegistry` and re-applied after every show |

Window sizes and behaviour are in [design system §9–§13](ui-design-system.md#9-layout-and-windows).
A single-instance plugin forwards `piw --quick-note` / `--quick-task` from a second process to
the running one.

**Stickies.** Window managers do not keep a window's position or always-on-top state across
hide/show (KWin re-places remapped windows and drops `_NET_WM_STATE_ABOVE`). Piw passes the
position as a hint before mapping, re-applies position and on-top after every show, and clamps
geometry to the monitors connected at that moment. Each sticky is its own webview, about
80–110 MiB on WebKitGTK, so stickies use a lightweight route without the editor, are destroyed
on hide, and the workspace warns above 8 (`SOFT_LIMIT` in `commands/stickies.rs`).

### Linux window backend

Native Wayland does not let GTK clients position windows or keep them above others, and the
capture popup gets no focus there. On a Wayland session with XWayland available, Piw therefore
sets `GDK_BACKEND=x11` at startup (`should_force_x11` in `platform/env.rs`) unless the launcher
already chose a backend or `PIW_WAYLAND_NATIVE=1` is set. Native Wayland stays available without
sticky positioning or on-top.

### Display scaling

With fractional scaling, KWin lets X11 apps scale themselves: XWayland reports scale 1 and
publishes `Xft.dpi` (134 at 140 %). WebKitGTK already applies that DPI to CSS px and renders
sharply, so Piw only **sizes windows** by `Xft.dpi/96` (`platform/ui_scale.rs`) and never zooms
the webview, which would scale twice. CSS never uses `zoom`; the Text size setting scales the
`rem` tokens. Windows and macOS use factor 1 and the system's own scaling (untested).

### Global shortcut

The default is `CommandOrControl+Shift+Space`, configurable in Settings › Shortcuts.

1. **Wayland session:** the XDG `GlobalShortcuts` portal via `ashpd`. It needs a desktop entry
   named after the app id, `app.piw.Piw.desktop`, which the packages install hidden;
   `scripts/dev-desktop-entry.sh` installs one for development builds.
2. **X11, Windows, macOS,** or no portal: the Tauri global-shortcut plugin.
3. **Always available:** the tray menu (Quick Note, Quick Task), **New** in the window, and
   `piw --quick-note` / `--quick-task` to bind in the desktop's own keyboard settings.

The status (`pending`, `registered`, `in_use`, `invalid`, `unavailable`, `disabled`) is emitted
on `piw://shortcut/status` and shown in Settings; it is never fatal.

## Events

| Event                            | Sent to      | Meaning                                                                |
| -------------------------------- | ------------ | ---------------------------------------------------------------------- |
| `piw://changed`                  | every window | The `ChangeSet` of a committed write, with its origin; queries refetch |
| `piw://capture/open`             | `capture`    | Open the popup in note or task mode                                    |
| `piw://open`, `piw://navigate`   | `main`       | Show an item ("Open in Piw" from a sticky) or an area (from the tray)  |
| `piw://shortcut/status`          | every window | Global shortcut registration status                                    |
| `piw://stickies/many`            | `main`       | More than `SOFT_LIMIT` stickies are open                               |
| `piw://lifecycle/hidden-to-tray` | `main`       | The window was closed to the tray                                      |

## Security boundaries

- **No network.** No account, telemetry or network code in `src/` or `src-tauri/`. The production
  CSP (`tauri.conf.json`) is `default-src 'self'`, `connect-src ipc: http://ipc.localhost`, with
  `object-src`, `base-uri`, `form-action` and `frame-ancestors` set to `'none'`. Fonts (Inter)
  and every other asset are bundled. `withGlobalTauri` is off and `freezePrototype` on;
  release builds have no devtools.
- **Least privilege.** Every command is listed in `src-tauri/build.rs`, which generates one
  permission per command and fails the build if `capabilities/main.json` misses one. Each window
  label has its own capability: `main` gets the app commands, `capture` only what capture needs,
  and `sticky:*` only commands scoped to its own item (`commands/scope.rs`). No capability has a
  `remote` section, so other origins get no IPC, and no `plugin:*` JavaScript permission is
  granted: dialogs, links, shortcuts and autostart go through validated Rust commands.
- **Navigation lock.** `platform/navigation.rs` allows only Piw's own origins and denies new
  windows. Links open only on Ctrl/⌘+click, through `open_link`, which accepts absolute `http`,
  `https` and `mailto` URLs and hands them to the system browser.
- **Content.** Pasted HTML and Markdown are rebuilt from the editor schema, which drops scripts,
  handlers, styles and unknown elements. There is no `innerHTML`, `eval` or
  `dangerouslySetInnerHTML`. All SQL is parameterised, and search input is quoted token by token
  before it reaches FTS5.
- **No paths from the UI.** Export folders and backup files are picked in native dialogs opened
  by Rust; export paths are validated (no `..`, reserved names or control characters) and files
  are created without overwriting.
- **Data at rest.** The data directory is mode 0700 on Unix; the database is not encrypted, so
  full-disk encryption is the answer on shared devices. Logs (2 MiB, 3 rotations) never contain
  note or task text.
- **Supply chain.** Exact versions and committed lockfiles; CI installs with `--frozen-lockfile`
  and `--locked` and runs `pnpm audit --prod`. GitHub Actions are pinned to commit SHAs, default
  to `contents: read`, and check out without persisted credentials; tag builds use no caches.

## Data, export and backup

Data lives in `piw.sqlite3` in the app-data directory (Settings › Data shows the path):
`~/.local/share/app.piw.Piw/` on Linux, `%APPDATA%\app.piw.Piw\` on Windows and
`~/Library/Application Support/app.piw.Piw/` on macOS (the last two from Tauri's documentation,
not checked by hand). WAL files sit next to it while Piw runs, and a schema upgrade leaves a
`piw.sqlite3.v<N>.bak` copy. `PIW_DATA_DIR` points Piw at another directory.

**Backup** writes a complete, consistent copy with `VACUUM INTO` (`piw-backup-YYYY-MM-DD.sqlite3`),
safe while Piw runs. There is no in-app restore yet. To restore: quit Piw from the tray, move
`piw.sqlite3`, `-wal` and `-shm` aside, copy the backup in as `piw.sqlite3`, and start Piw.

**Export** writes a new `Piw export YYYY-MM-DD HH-MM` folder and never overwrites. Items in Trash
are skipped.

| Path                                       | Content                                                                                  |
| ------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `Notes/<space>/<title>.md`                 | One file per quick note, with YAML front matter (id, title, space, tags, dates)          |
| `Documents/<space>/<document>/NN <tab>.md` | One file per tab in order; Tasks tabs list the document's tasks as `- [ ]` / `- [x]`     |
| `tasks.json`, `tasks.csv`                  | Every task and subtask. CSV is UTF-8 with a BOM; formula-like cells are prefixed `'`     |
| `data.json`                                | Everything (`ExportData`) with canonical editor JSON, ids and links, for a future import |
| `manifest.json`, `README.md`               | `formatVersion` (1), app version, export time, counts; what each file is                 |

`formatVersion` changes only when the layout or meaning of these files changes. The export is not
a restore mechanism; use Backup for that.

## Validation

```sh
pnpm verify
```

| Layer               | Where                                       | What                                                                                      |
| ------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Domain and services | `src-tauri/src/**` `#[cfg(test)]`           | Rules, migrations, integrity, concurrency and acceptance scenarios against real SQLite    |
| IPC contract        | `src-tauri/src/commands/tests.rs`           | Real handlers through Tauri's mock runtime: arguments, error codes, events, origin checks |
| UI                  | `src/**/*.test.ts(x)` (Vitest, jsdom)       | Components, hooks, cache invalidation, keyboard behaviour, editor golden files, tokens    |
| Native E2E          | `scripts/e2e/*.sh` (Linux/KDE, run by hand) | The release build in a private virtual KWin session, driven by xdotool                    |

The native scenarios (`capture`, `document`, `sticky`, `workspace`, `perf`) run through
`scripts/e2e/nested-session.sh` with the production CSP, capabilities and navigation lock.
`visual-qa.sh` and `presentation.sh` take screenshots; `scale-probe.sh` renders a window at 96
and 134 dpi to catch double scaling. Debug builds also contain a scripted platform probe
(`PIW_SPIKE_PROBE=report.json`, `commands/spike.rs`) that records what the desktop actually did.

**Last measured** on Linux KDE (XWayland, release build, a fast 16-thread machine, not modest
hardware): `piw --quick-note` to a visible popup in 80–104 ms; about 330 MiB for the workspace
plus the hidden popup, plus about 80 MiB per sticky. On 10,000 items, FTS5 searches take under
9 ms and task lists under 10 ms (`cargo test --release --manifest-path src-tauri/Cargo.toml bench
-- --ignored --nocapture`). `pnpm test:editor-perf` loads a 5,000-paragraph document in about
380 ms. The editor chunk (about 196 kB gzip) loads only when a document opens. One capture run in
six lost its first keystrokes under heavy load; look into it before a release.

**Smoke test per platform** before a release: install and start with no network; create a note
and a task and restart; capture with the shortcut (or `piw --quick-note`); pin a task, toggle
keep on top, hide and reopen it, restart; use the tray; export and back up; uninstall (the data
directory stays).

### Browser preview

`pnpm dev` serves the UI at <http://localhost:1420>. Outside Tauri, `src/dev/` mocks every
command in `src/lib/ipc/api.ts` in memory, with demo data and change events. It is dev-only
(behind `import.meta.env.DEV`), never part of `pnpm build`, and resets on reload.

- **Windows:** `/` (workspace), `?window=capture`, `?window=sticky:<note|task|tasks_tab>:<id or title>`
  (e.g. `sticky:task:totp`, `sticky:tasks_tab:to-dos`), `?window=gallery`.
- **Data and theme:** `mock=empty` (default spaces only, for empty states), `theme=light|dark`.
- **Workspace state** (items match by title substring; any query string starts from the default
  layout): `area=inbox|notes|tasks|pinned|trash|settings`, `doc=refactor&tab=impl`,
  `note=supplier`, `split=1`, `task=weekly`, `filter=today|upcoming|all|completed`, `search=1`.
- **Stickies:** "Pin to desktop" logs the sticky's URL; add `popups=1` to open popups that stay
  in sync with their opener.

Example: <http://localhost:1420/?area=tasks&filter=today&task=weekly&theme=dark>.

### Development switches

| Variable                      | Effect                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| `PIW_DATA_DIR`                | Use another data directory, so your real notes are never touched while testing        |
| `PIW_WAYLAND_NATIVE=1`        | Run GTK on native Wayland instead of XWayland                                         |
| `PIW_UI_SCALE=1.25`           | Override the window size factor (XWayland: detected from `Xft.dpi`)                   |
| `PIW_WEBVIEW_ZOOM=1.25`       | Zoom the webviews by hand, only for a webview that does not apply the OS scale itself |
| `PIW_DISABLE_PORTAL=1`        | Linux Wayland: skip the shortcuts portal and use the Tauri plugin                     |
| `PIW_SPIKE_PROBE=report.json` | Debug builds only: run the platform probe (`PIW_SPIKE_PROBE_EXIT=1` quits afterwards) |

Keep pull requests small, describe how you tested them and on which OS and desktop, and add a
line under **Unreleased** in [CHANGELOG.md](../CHANGELOG.md) for user-visible changes. Product
scope stays small on purpose: no accounts, cloud sync, AI, calendars, boards or plugins.
