# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and Piw uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **A vault of Markdown notes.** Notes are `.md` files in a folder you pick (default `~/Piw`),
  readable and editable by any app; Piw follows external edits. The
  top-level folders are spaces, and the title bar's space filter scopes the tree, search and
  tasks. The format is specified in [docs/vault-format.md](docs/vault-format.md).
- **A new workspace:** a sidebar with the folder tree (new note or folder, rename,
  drag to move, Trash), Zap-style tabs for notes, task views, Trash and Settings that are
  remembered, search over every note, and a status bar.
- **One live Markdown editor** everywhere (CodeMirror): headings, emphasis, code, quotes, lists
  and clickable task checkboxes, with the markers shown only on the line being edited;
  `[[links]]` (renaming a note rewrites the links to it), `#tags`, and front matter folded into
  a line of `#tags` until you edit it; code blocks hide their fences and blank lines take half
  a line while you are not editing them. Selecting text offers Create sticky from selection, Bold
  and Link.
- **Tasks are lines in notes** (`- [ ]`), with due dates as `📅 YYYY-MM-DD` and `✅` on
  completion. Type `@today`, `@tomorrow`, `@friday` or a date, or
  press Mod+D, to pick a date; dates show as chips.
  - A panel beside each note lists its tasks by heading, with progress and dates, and the
    note's outline.
  - Today (with Overdue), Upcoming and All open as tabs, across notes or one space, with an
    "Add task" row; ticking from a view edits the note's line.
- **Sticky notes** for a note or a task view, with a colour each, keep on top, hide and remove;
  position and size are remembered and kept on a connected monitor, and stickies can reopen at
  launch. Pin a note with Mod+Shift+P. **Create sticky from selection** turns selected text into
  `<Space>/Stickies/<Title>.md`, linked back to its note, and pins it.
- **Quick Capture** popup appends a note or a task to the chosen space's `Inbox.md`:
  - Opened by the global shortcut: the desktop portal on Wayland, the native API elsewhere.
  - Also reachable from the tray or `piw --quick-note` / `--quick-task`.
  - Drafts survive an accidental close; Pin puts that Inbox on the desktop.
- **Import from Piw 0.1:** the notes, documents, sections and tasks of a Piw 0.1 database
  become notes and task lines, on the first start with an empty vault or from Settings › Data;
  stickies follow their notes and the old database stays untouched.
- **Settings › Data** shows the vault folder and lets you open another one.
- **App icon** (a pen nib) for the packages, the window and the tray; the title bar shows it as
  a one-colour glyph.
- Tray menu, single instance, close to tray, start at login (off by default).
- Light and dark themes, five accent colours, text size, and a configurable shortcut with
  conflict detection.
- Security:
  - Per-window least-privilege capabilities; a sticky window reaches only its own note or view.
  - Vault paths validated in Rust; navigation lock; validated external links.
  - Third-party licence notices shipped with the app.

### Known limitations

- Verified only on Linux (KDE Plasma 6.7, Wayland through XWayland). Windows, macOS, GNOME and
  X11 sessions build in CI but are untested.
- The vault, its stickies and the 0.1 import have been tested in Rust and in the browser
  preview, not yet in the packaged app on a desktop.
- Native Wayland (`PIW_WAYLAND_NATIVE=1`) cannot position stickies or keep them on top.
- A note renamed outside Piw loses its sticky (the watcher sees a delete and a create).
- Builds are unsigned.

### Changed

- **The shared mnml-tools UI kit.** Piw now takes its look from
  [`@mnml-tools/ui`](https://github.com/mnml-tools/ui-kit), the kit extracted from Zap: square
  controls, the system font at 12px, warm neutral greys, hairline borders, soft title bar and
  tab strips, and the kit's 1px focus ring. Buttons, icon buttons, dialogs, menus, segmented
  controls, tabs, badges, shortcut hints, empty states, the spinner and the window controls are
  the kit's components or class names. The bundled Inter font is gone (the kit uses the system
  font).
- **Zap's chrome:** the kit's title bar ("piw", the space filter in the centre, the appearance
  palette, Settings and the window controls), the sidebar with Notes | Tasks, a tab strip with
  `+`, and the kit's status bar (`~/Piw / <space>`, the stickies on the desktop, the save state).
- **Accent colour:** the title bar's palette and Settings › Appearance offer the kit's five
  accents (pink, blue, orange, green, purple); purple is the default.
- **Documentation** follows the layout of its sister project Zap: a shorter README, one
  [architecture guide](docs/architecture.md) that absorbs the former data-format, platform,
  release, security, status, testing and decision records, and the
  [design system](docs/ui-design-system.md). CONTRIBUTING and the Code of Conduct were folded
  into the README and the architecture guide.
- **CI** is now two workflows: **Tauri tests** (`rust.yml`) on pushes and pull requests to `main`,
  and **Desktop builds** (`desktop.yml`), which builds Linux, macOS and Windows packages and
  publishes a GitHub Release with checksums when a version tag is pushed.
