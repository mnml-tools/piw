# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and Piw uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **App icon** (a pen nib) for the packages, the window and the tray; the top bar shows it as a
  one-colour glyph.
- **Minimal top-bar UI:** one top bar with Inbox, Notes, Tasks and Pinned, the space filter,
  search, New, Trash and Settings; no sidebar or status bar.
- **Quick notes and quick tasks** under one minimal top bar, with spaces as a global filter,
  tags, Inbox, Trash with undo, and a search palette with highlighted matches.
- **Tasks:**
  - Today, Upcoming, All and Completed views, with an Overdue section.
  - Subtasks, due dates and manual order.
  - A contextual task inspector.
  - Completed rows stay in place until you leave the view.
- **Documents** with content tabs (rich text, code blocks, editorial checklists) and Tasks tabs
  that show the document's real tasks. Ctrl+T turns a line into a real task.
- **Quick Capture** popup:
  - Opened by the global shortcut: the desktop portal on Wayland, the native API elsewhere.
  - Also reachable from the tray or `piw --quick-note` / `--quick-task`.
  - Drafts survive an accidental close.
- **Sticky notes** for notes, tasks and document task lists:
  - Keep on top, hide and remove.
  - Position and size are remembered and kept on a connected monitor.
  - Optional restore at launch.
- Tray menu, single instance, close to tray, start at login (off by default).
- Light and dark themes, text size, and a configurable shortcut with conflict detection.
- Settings › Data: consistent backup and an open export (Markdown, JSON and CSV).
- Security:
  - Per-window least-privilege capabilities, with per-item scope for stickies.
  - Navigation lock.
  - Validated external links.
  - Third-party licence notices shipped with the app.

### Known limitations

- Verified only on Linux (KDE Plasma 6.7, Wayland through XWayland). Windows, macOS, GNOME and
  X11 sessions build in CI but are untested.
- Native Wayland (`PIW_WAYLAND_NATIVE=1`) cannot position stickies or keep them on top.
- No import or in-app restore yet. Backups are restored by replacing the data file
  ([docs/architecture.md](docs/architecture.md#data-export-and-backup)).
- Builds are unsigned.

### Changed

- **Documentation** follows the layout of its sister project Zap: a shorter README, one
  [architecture guide](docs/architecture.md) that absorbs the former data-format, platform,
  release, security, status, testing and decision records, and the
  [design system](docs/ui-design-system.md). CONTRIBUTING and the Code of Conduct were folded
  into the README and the architecture guide.
- **CI** is now two workflows: **Tauri tests** (`rust.yml`) on pushes and pull requests to `main`,
  and **Desktop builds** (`desktop.yml`), which builds Linux, macOS and Windows packages and
  publishes a GitHub Release with checksums when a version tag is pushed.
