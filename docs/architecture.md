# Architecture

Piw is a Tauri 2 desktop app. Notes are Markdown files in a folder, the **vault**; a Rust core
reads, writes, indexes and watches them, owns the rest of the app's state and the OS
integration, and a React UI renders it in several native windows. There is no server, account or
network access.

```text
 React + TypeScript (one bundle, one view per window label)
 ├── main                  Vault shell: title bar, sidebar tree, tabs (notes, task views, Trash, Settings)
 ├── capture               Quick Capture popup (pre-created, hidden, opened by the global shortcut)
 └── sticky:<kind>:<id>    Sticky windows for a vault note or a task view
          │  typed commands (src/lib/ipc/api.ts)        ▲  piw://changed {changes, origin}
          ▼                                             │
 Rust (src-tauri/src)
 ├── commands/   thin #[tauri::command] handlers: worker thread → vault or service → broadcast
 ├── vault/      paths, atomic files, Markdown parser, index, watcher, task edits, 0.1 import
 ├── services/   settings, capture drafts, stickies and their vault targets, over rusqlite
 ├── domain/     pure types and rules (colours, titles, dates, change sets)
 ├── storage/    Database (single connection, WAL), versioned migrations
 └── platform/   windows, stickies, shortcuts (portal / plugin), tray, lifecycle, CLI, env, UI scale
          │                                   │
          ▼                                   ▼
 The vault: ~/Piw/**/*.md              <app data dir>/piw.sqlite3 (settings, stickies, draft)
 (the source of truth)                 <app data dir>/vaults/<key>/index.sqlite3 (rebuildable index)
```

What Piw reads from a vault and exactly what it writes back is specified in the
[vault format](vault-format.md); how the app got here is in the [redesign plan](redesign.md).
The visual and behaviour rules for every screen live in the [design system](ui-design-system.md).
The stack is Tauri 2.12, Rust (edition 2024, MSRV 1.90, `unsafe_code = deny`), React 19,
TypeScript (strict), Vite, TanStack Query, Zustand, CodeMirror 6 with `@lezer/markdown`,
`pulldown-cmark` and `notify` in Rust, lucide icons and plain CSS with design tokens over the
shared kit. Every dependency version is pinned.

## UI layers

- `src/components/ui`: the shared component library (Button, IconButton, Checkbox, Dialog,
  Menu, Segmented, Tabs, TextInput, Toast, DateQuickPicker, EmptyState and others), described in
  [design system §7](ui-design-system.md#7-components-srccomponentsui).
- `src/components/app`: the live Markdown editor (`MarkdownEditor/`: `live-markdown.ts`,
  `wiki-links.ts`, `task-dates.ts`, `selection-action.ts`), the page skeleton used by Settings
  (`Page.tsx`) and the space picker.
- `src/views/vault`: the main window. `VaultApp.tsx` is the shell; `VaultSidebar` (tree),
  `VaultTabs`, `NoteView` and `NotePanel` (the note's tasks and outline), `TasksView`,
  `TrashView`, `VaultSearch` and `SpaceMenu`. `src/views/workspace` keeps the pieces the shell
  shares with other windows: window chrome, the appearance dialog, the database error screen and
  Settings.
- `src/views/capture` and `src/views/sticky`: the Quick Capture popup and the sticky windows.
  `src/views/gallery` is a dev-only component gallery.
- `src/app`: providers, theme, and `window-kind.ts`, which maps the window label to a view.
  `Root.tsx` lazy-loads each view.
- `src/strings`: every user-facing string. `src/styles`: `tokens.css` (Piw's semantic tokens,
  mapped onto the shared kit's), `base.css`, and `tokens.test.ts`, which checks contrast against
  the kit's palette in both themes and every accent.
- The look comes from the shared mnml-tools kit, [`@mnml-tools/ui`](https://github.com/mnml-tools/ui-kit)
  (also used by Zap): `main.tsx` imports its `tokens.css` and `components.css`, and the
  components in `src/components/ui` render the kit's components or class names (`mnml-*`) while
  keeping their own behaviour (Radix menus and dialogs, roving focus).

Views compose components; components never call the backend. Colours come only from tokens, and
everything must be keyboard-operable without colour carrying meaning alone.

## Behaviour and boundaries

- `src/lib/hooks/vault.ts` and `src/lib/hooks/data.ts`: one TanStack Query hook per read
  (`useVaultTree`, `useVaultNote`, `useVaultSearch`, `useVaultTasks`, `useVaultPinned`,
  `useSettings` and others), keyed by `src/lib/query/keys.ts`. Writes go through `api`; the cache
  refreshes from change events, so mutations never patch caches by hand.
- `src/lib/query/sync.ts`: listens for `piw://changed` in every window and invalidates only the
  query roots that depend on the changed entity kinds (`settings`, `sticky`, `file`). Only
  queries on screen refetch.
- `src/state/vault.ts`: the Zustand store for the shell (open tabs, the active one, the space
  filter, expanded folders, the note panel), persisted between launches.
- `useAutosave` and `src/lib/autosave.ts`: debounced, hash-guarded saves with a visible state; a
  file changed elsewhere surfaces as a conflict instead of being overwritten.
- `src/lib/vault/tasks.ts`: reads tasks from a note's text exactly as Rust does and applies the
  same line edits (tick, date, reword), so the editor, the note panel and the task views agree.
  `date-words.ts` turns `@tomorrow`-style words into dates; `capture-space.ts` remembers the last
  capture space on this device.
- `useCapture`: Quick Capture modes, the persisted draft, and closing only after the write is
  confirmed.
- `useHotkeys` and `src/lib/shortcuts`: in-app shortcuts and the global accelerator's validation.

### IPC contract

- Rust DTOs derive `ts_rs::TS`. `pnpm bindings` regenerates `src/lib/ipc/bindings/*.ts`
  (`TS_RS_EXPORT_DIR` in `.cargo/config.toml`); the files are committed and CI fails if they are
  stale.
- The UI calls commands only through the typed functions in `src/lib/ipc/api.ts`, never `invoke`
  directly. `call<T>()` normalises every failure to `IpcError { code, message }`.
- Errors are data: `{ code, message }` with a stable code (`not_found`, `validation`, `conflict`,
  `storage`, `platform`, `internal`). Messages never include note text. If the database cannot be
  opened, `app_status` reports it instead of crashing and the file is left untouched.

## Rust core

- `vault/`: `paths.rs` (validated, NFC relative paths that cannot leave the vault), `files.rs`
  (atomic writes, hashes, the `.piw/trash/` folder), `parse.rs` (tasks, headings, links, tags and
  front matter with `pulldown-cmark`), `index.rs` (the SQLite index: FTS5, tasks, links, tags),
  `watcher.rs` (`notify`, debounced), `tasks.rs` (line edits with the guard) and `import/` (Piw
  0.1's database into files). `fixtures/` holds the shared fixtures both parsers are tested
  against.
- `commands/`: thin handlers. `vault.rs` runs vault work on a worker thread, broadcasts the paths
  it touched as `file` changes and limits a sticky window to its own note or view
  (`check_sticky`). `stickies.rs`, `workspace.rs` (settings, capture drafts, app status) and
  `platform.rs` cover the rest.
- `services/`: settings, capture drafts, stickies and `vault_stickies` (what each vault sticky
  shows). Every write is a function that returns a `ChangeSet`.
- `domain/`: pure types and rules: colours, display titles, dates, change sets.
- `storage/`: the single connection and the migrator.
- `platform/`: windows, sticky placement, global shortcuts, tray, lifecycle, CLI flags
  (`--quick-note`, `--quick-task`, `--hidden`), environment switches, navigation lock and UI
  scale. Each capability either works, degrades with a documented fallback, or reports why it
  is unavailable; a missing native feature is never fatal.

Runtime code has no `unwrap`/`expect` (Clippy warns); errors map to `AppError`, and logs carry
categories and ids, never content.

## Data

### The vault

Notes, tasks, spaces (the top-level folders), links and tags are files; see the
[vault format](vault-format.md). The vault opens at start from `PIW_VAULT`, else the folder saved
in Settings › Data (`vaultPath`), else `vault/` inside `PIW_DATA_DIR` when that is set (so a
test run never touches your notes), else `~/Piw`, created with `Work/` and `Personal/` when
missing.
Every write is atomic and carries the hash it was based on (`conflict` otherwise), and the
watcher brings in edits made by other apps. Opening another folder (Settings › Data › Change
folder…) restarts the vault in place; the window shows the starting state meanwhile.

### The index

`<app data dir>/vaults/<key>/index.sqlite3`, one per vault path: FTS5 search
(`unicode61 remove_diacritics 2`), tasks with their line, due and done dates, links and tags,
and the size, modification time and hash of every note it read. It is a cache: Piw rebuilds it
when it is missing, unreadable or from another `INDEX_VERSION`, and it never syncs with the vault.

### The app database

`piw.sqlite3` holds what belongs to this device. Schema: `src-tauri/migrations/`. A schema change
is a new `NNNN_name.sql` file with an upgrade test; a released migration is never edited.

| Table                       | Holds                                                                         |
| --------------------------- | ----------------------------------------------------------------------------- |
| `settings`                  | Typed settings, the vault path and when Piw 0.1 was imported                  |
| `capture_drafts`            | The Quick Capture draft                                                       |
| `sticky_windows`            | A row means "pinned"; `is_open` means visible; geometry, colour and on-top    |
| `vault_stickies`            | What a vault sticky shows: a note path or a task view (and space) of a vault  |
| `spaces`, `notes`, `tasks`… | Piw 0.1's data, kept read-only for the import (below); nothing else uses them |

**Durability:** WAL, `synchronous=FULL`, `busy_timeout=5000`, `foreign_keys=ON`,
`trusted_schema=OFF`, `CHECK`s and triggers. Migrations use `PRAGMA user_version`, one
transaction each, with a `VACUUM INTO` copy (`piw.sqlite3.v<N>.bak`) before upgrading; a
database newer than the app is refused untouched.

### Importing Piw 0.1

`vault/import/` writes the notes and tasks of a 0.1 database into files, following the
[vault format](vault-format.md): a quick note becomes a note named after its title (tags in front
matter, archived ones in `<Space>/Archive/`); a document becomes one note, with a `## Tab`
heading per tab when it had several, its task references as task lines where they stood and its
remaining tasks under its Tasks tab (or `## Tasks`); a section becomes a note that links its
document and lists its tasks; every other task goes to `<Space>/Inbox.md`. Subtasks nest, and due
and completion dates become `📅` and `✅`. Items in Trash are skipped, existing files are never
overwritten (`Atlas 2.md`), and stickies of imported items move to the new notes with their
geometry and colour.

It runs once, by itself, when the vault has no notes yet and the database still has live notes
or tasks; otherwise Settings › Data offers it. The 0.1 tables stay as they were, next to the
pre-upgrade backup, so nothing is lost if a file comes out wrong; a later version can drop them.
The converter is tested against the 0.1 editor's own golden document
(`fixtures/import/document.json` → `document.md`, byte for byte) and against a small database
built with 0.1's SQL; `PIW_IMPORT_DB=<copy of piw.sqlite3> cargo test -- --ignored real_database
--nocapture` checks a real database (on a copy: opening it runs the migrations).

### Where things are

Settings › Data shows both locations. The app data directory is `~/.local/share/app.piw.Piw/` on
Linux, `%APPDATA%\app.piw.Piw\` on Windows and `~/Library/Application Support/app.piw.Piw/` on
macOS (the last two from Tauri's documentation, not checked by hand); `PIW_DATA_DIR` points Piw
at another one. Back up the vault like any folder; the app database holds only settings, sticky
positions and the draft.

## Windows

| Label                | Created                            | Lifecycle                                                                                                                             |
| -------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `main`               | at startup, hidden with `--hidden` | Closing it hides it to the tray (setting). On macOS the Dock icon follows its visibility                                              |
| `capture`            | at startup, hidden                 | Undecorated, always on top, skip taskbar. Hidden on Esc/close, never destroyed                                                        |
| `sticky:<kind>:<id>` | on pin/open                        | One per target (the label is the identity). Destroyed on hide. Placement is owned by `StickyRegistry` and re-applied after every show |

Sticky kinds are `vault_note` and `vault_tasks`; the id is opaque and `vault_stickies` maps it to
what the sticky shows, so renaming a note in Piw keeps its sticky. Window sizes and behaviour are
in [design system §9–§13](ui-design-system.md#9-layout-and-windows). A single-instance plugin
forwards `piw --quick-note` / `--quick-task` from a second process to the running one.

**Stickies.** Window managers do not keep a window's position or always-on-top state across
hide/show (KWin re-places remapped windows and drops `_NET_WM_STATE_ABOVE`). Piw passes the
position as a hint before mapping, re-applies position and on-top after every show, and clamps
geometry to the monitors connected at that moment. Each sticky is its own webview, about
80–110 MiB on WebKitGTK, so stickies are destroyed on hide and the workspace warns above 8
(`SOFT_LIMIT` in `commands/stickies.rs`).

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
3. **Always available:** the tray menu (Quick Note, Quick Task) and `piw --quick-note` /
   `--quick-task` to bind in the desktop's own keyboard settings.

The status (`pending`, `registered`, `in_use`, `invalid`, `unavailable`, `disabled`) is emitted
on `piw://shortcut/status` and shown in Settings; it is never fatal.

## Events

| Event                            | Sent to      | Meaning                                                                        |
| -------------------------------- | ------------ | ------------------------------------------------------------------------------ |
| `piw://changed`                  | every window | The `ChangeSet` of a committed write or a watched file change; queries refetch |
| `piw://capture/open`             | `capture`    | Open the popup in note or task mode                                            |
| `piw://open`                     | `main`       | "Open in Piw" from a sticky: open its note or task view                        |
| `piw://navigate`                 | `main`       | The tray's Settings                                                            |
| `piw://shortcut/status`          | every window | Global shortcut registration status                                            |
| `piw://stickies/many`            | `main`       | More than `SOFT_LIMIT` stickies are open                                       |
| `piw://lifecycle/hidden-to-tray` | `main`       | The window was closed to the tray (a one-time notice)                          |

## Security boundaries

- **No network.** No account, telemetry or network code in `src/` or `src-tauri/`. The production
  CSP (`tauri.conf.json`) is `default-src 'self'`, `connect-src ipc: http://ipc.localhost`, with
  `object-src`, `base-uri`, `form-action` and `frame-ancestors` set to `'none'`. Every asset is
  bundled (the UI uses the system font, as the shared kit does). `withGlobalTauri` is off and
  `freezePrototype` on; release builds have no devtools.
- **Least privilege.** Every command is listed in `src-tauri/build.rs`, which generates one
  permission per command and fails the build if `capabilities/main.json` misses one. Each window
  label has its own capability: `main` gets the app commands, `capture` only what capture needs,
  and `sticky:*` only commands checked against its own note or view (`check_sticky`). No
  capability has a `remote` section, so other origins get no IPC, and no `plugin:*` JavaScript
  permission is granted: dialogs, links, shortcuts and autostart go through validated Rust
  commands.
- **Paths.** The UI names notes only by vault-relative paths; `vault/paths.rs` rejects absolute
  paths, `.` and `..`, hidden segments, backslashes and control characters, names Piw creates
  must also avoid the characters and names Windows reserves, and symbolic links are not
  followed. The vault folder itself is picked in a native dialog opened by Rust.
- **Navigation lock.** `platform/navigation.rs` allows only Piw's own origins and denies new
  windows. Links open only on Ctrl/⌘+click, through `open_link`, which accepts absolute `http`,
  `https` and `mailto` URLs and hands them to the system browser.
- **Content.** Notes are plain text in CodeMirror; Markdown is drawn with decorations, never
  injected as HTML. There is no `innerHTML`, `eval` or `dangerouslySetInnerHTML`. All SQL is
  parameterised, and search input is quoted token by token before it reaches FTS5.
- **Data at rest.** The data directory is mode 0700 on Unix; neither the vault nor the database
  is encrypted, so full-disk encryption is the answer on shared devices. Logs (2 MiB, 3
  rotations) never contain note text.
- **Supply chain.** Exact versions and committed lockfiles; CI installs with `--frozen-lockfile`
  and `--locked` and runs `pnpm audit --prod`. GitHub Actions are pinned to commit SHAs, default
  to `contents: read`, and check out without persisted credentials; tag builds use no caches.

## Validation

```sh
pnpm verify
```

| Layer              | Where                                       | What                                                                                             |
| ------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Vault and services | `src-tauri/src/**` `#[cfg(test)]`           | Parser and index against `fixtures/`, writes, conflicts, watcher, task edits, import, migrations |
| IPC contract       | `src-tauri/src/commands/tests.rs`           | Real handlers through Tauri's mock runtime: arguments, error codes, events, sticky scope         |
| UI                 | `src/**/*.test.ts(x)` (Vitest, jsdom)       | Components, hooks, the editor, the TS task parser against `fixtures/`, cache invalidation        |
| Native E2E         | `scripts/e2e/*.sh` (Linux/KDE, run by hand) | The release build in a private virtual KWin session, driven by xdotool                           |

The native scenarios run through `scripts/e2e/nested-session.sh` with the production CSP,
capabilities and navigation lock; `scale-probe.sh` renders a window at 96 and 134 dpi to catch
double scaling. They were written for Piw 0.1 and still seed and check its database: they need
porting to the vault before the next release. Debug builds also contain a scripted platform probe
(`PIW_SPIKE_PROBE=report.json`, `commands/spike.rs`) that records what the desktop actually did.

**Last measured** with Piw 0.1 on Linux KDE (XWayland, release build, a fast 16-thread machine):
`piw --quick-note` to a visible popup in 80–104 ms; about 330 MiB for the workspace plus the
hidden popup, plus about 80 MiB per sticky. The vault has not been measured yet.

**Smoke test per platform** before a release: install and start with no network; create a note
with a task and restart; edit the note in another editor and see it update; capture with the
shortcut (or `piw --quick-note`) and find it in `Inbox.md`; pin a note, toggle keep on top, hide
and reopen it, restart; use the tray; uninstall (the vault and the data directory stay).

### Browser preview

`pnpm dev` serves the UI at <http://localhost:1420>. Outside Tauri, `src/dev/` mocks every
command in `src/lib/ipc/api.ts` in memory, with the demo vault (`fixtures/demo/`, read by
`mock-vault.ts`) and change events.
It is dev-only (behind `import.meta.env.DEV`), never part of `pnpm build`, and resets on reload.

- **Windows:** `/` (the vault shell), `?window=capture` (captures into the demo vault's Inbox
  notes), `?window=sticky:vault_note:<title>`, `?window=sticky:vault_tasks:today|upcoming|all`,
  `?window=gallery`.
- **Data and theme:** `mock=empty` (an empty vault), `import=1` (Piw 0.1 data waiting to be
  imported, for Settings › Data), `theme=light|dark`.
- **Shell state** (notes match by path substring; any query string starts from the default
  layout): `note=refactor`, `tasks=today|upcoming|all`, `space=Work`, `open=trash|settings`,
  `panel=0`, `search=1`.
- **Stickies:** "Pin to desktop" logs the sticky's URL; add `popups=1` to open popups that stay
  in sync with their opener.

Example: <http://localhost:1420/?note=refactor&theme=dark>.

### Development switches

| Variable                      | Effect                                                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PIW_DATA_DIR`                | Use another data directory (and, unless `PIW_VAULT` says otherwise, a vault inside it)                                                                 |
| `PIW_VAULT=/some/folder`      | Open this vault instead of the one in Settings › Data (or `~/Piw`)                                                                                     |
| `PIW_DEMO=1`                  | Fill a vault that has no notes with the demo (`fixtures/demo/`, `vault/demo.rs`) and pin its stickies; `pnpm demo` sets it with its own data directory |
| `PIW_WAYLAND_NATIVE=1`        | Run GTK on native Wayland instead of XWayland                                                                                                          |
| `PIW_UI_SCALE=1.25`           | Override the window size factor (XWayland: detected from `Xft.dpi`)                                                                                    |
| `PIW_WEBVIEW_ZOOM=1.25`       | Zoom the webviews by hand, only for a webview that does not apply the OS scale itself                                                                  |
| `PIW_DISABLE_PORTAL=1`        | Linux Wayland: skip the shortcuts portal and use the Tauri plugin                                                                                      |
| `PIW_SPIKE_PROBE=report.json` | Debug builds only: run the platform probe (`PIW_SPIKE_PROBE_EXIT=1` quits afterwards)                                                                  |

Keep pull requests small, describe how you tested them and on which OS and desktop, and add a
line under **Unreleased** in [CHANGELOG.md](../CHANGELOG.md) for user-visible changes. Product
scope stays small on purpose: no accounts, cloud sync, AI, calendars, boards or plugins.
