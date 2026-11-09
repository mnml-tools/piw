# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and Piw uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **App icon** (a pen nib) for the packages, the window and the tray; the top bar shows it as a
  one-colour glyph.
- **Minimal chrome:** a title bar, the Inbox, Notes, Tasks and Pinned tabs, and a status bar;
  no sidebar.
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

- **The shared mnml-tools UI kit.** Piw now takes its look from
  [`@mnml-tools/ui`](https://github.com/mnml-tools/ui-kit), the kit extracted from Zap: square
  controls, the system font at 12px, warm neutral greys, hairline borders, soft title bar and
  tab strips, and the kit's 1px focus ring. Buttons, icon buttons, dialogs, menus, segmented
  controls, tabs, badges, shortcut hints, empty states, the spinner and the window controls are
  the kit's components or class names. The bundled Inter font is gone (the kit uses the system
  font).
- **Zap's chrome:** the kit's title bar (the "piw" brand with its note, the space filter in the
  centre, the appearance palette, "Local workspace" and the window controls) over a tab strip
  with Inbox, Notes, Tasks and Pinned, and search, New (it opens the Quick Capture popup),
  Trash and Settings at its end, and the
  kit's status bar at the window's foot (`PIW / <space>`, the Inbox count, where the data
  lives). The areas no longer fold into a menu in narrow windows.
- **Accent colour:** the title bar's palette and Settings › Appearance offer the kit's five
  accents (pink, blue, orange, green, purple); blue is the default.
- **Documentation** follows the layout of its sister project Zap: a shorter README, one
  [architecture guide](docs/architecture.md) that absorbs the former data-format, platform,
  release, security, status, testing and decision records, and the
  [design system](docs/ui-design-system.md). CONTRIBUTING and the Code of Conduct were folded
  into the README and the architecture guide.
- **CI** is now two workflows: **Tauri tests** (`rust.yml`) on pushes and pull requests to `main`,
  and **Desktop builds** (`desktop.yml`), which builds Linux, macOS and Windows packages and
  publishes a GitHub Release with checksums when a version tag is pushed.
