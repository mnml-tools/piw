# Piw design system

The single design and behaviour reference for every window of Piw: the shell, the components,
the views and their keyboard and window rules. The look comes from the shared mnml-tools kit,
[`@mnml-tools/ui`](https://github.com/mnml-tools/ui-kit), extracted from Zap and shared by every
mnml-tools app: `src/main.tsx` imports its `tokens.css` and `components.css`. Piw's semantic
tokens live in [`src/styles/tokens.css`](../src/styles/tokens.css), mapped onto the kit's, and
global defaults in [`src/styles/base.css`](../src/styles/base.css). Both are guarded by
[`src/styles/tokens.test.ts`](../src/styles/tokens.test.ts): WCAG contrast against the kit's
palette in both modes and every accent, unknown tokens, and raw colours outside `tokens.css`.
When this page and `tokens.css` disagree, `tokens.css` wins. Live examples of every component
and state: `pnpm dev`, then `/?window=gallery`.

**In one sentence:** one soft title bar over a white canvas; square controls with hairline
borders; warm neutral greys and one accent, used sparingly; the system font at 12px.

**Conventions:** **Mod** = ⌘ on macOS, Ctrl on Windows and Linux. "Item" = a note or a task
(a `- [ ]` line in a note). Sizes are CSS px unless stated.

**Provenance:** the visual language is Zap's, shared through `@mnml-tools/ui` so that every
mnml-tools app looks the same. Piw's own behaviour (capture first, autosave, keyboard-first, the
grid, stickies) comes from Apple-platform note apps (**Bear**, **Minimal**, **NotePlan**), whose
principles only were studied: no assets, code or values were taken from them.

## 1. Principles

1. **Capture first.** Nothing may slow `shortcut → type → save → back to work`.
2. **Quiet chrome.** Zap's shell: the title bar, the sidebar, the tab strip, the canvas, the
   status bar. Hairlines separate them, panes from each other, and groups.
3. **The kit's look, everywhere.** Use the kit's components or class names (`mnml-*`) before
   writing new CSS; when Piw needs a control the kit lacks, build it from the same parts (1px
   hairlines, square corners, the soft fill, 10–12px type).
4. **Square geometry.** No radii, except dots and swatches. Selection is the accent tint with a
   2px accent bar on the leading edge, as in Zap's sidebar.
5. **Calm colour.** White canvas, near-black text, warm greys (secondary, muted, faint), one
   accent the user picks among the kit's five. Space colours are small squares only.
6. **One grid** (§4). Every left edge sits on the glyph column or the text column.
7. **Keyboard-first, mouse-friendly.** Every action works from the keyboard; shortcuts are shown
   in menus and tooltips; anything revealed on hover is also revealed on focus.
8. **Predictable and safe.** Everything autosaves. Destructive actions have undo or a
   confirmation. Rows never jump under the pointer.
9. **Honest about the platform.** When the OS limits something (Wayland shortcuts, tray,
   always-on-top), say so in plain words and offer the alternative. Never fail silently.
10. **Every state designed.** Rest, hover, pressed, selected, focus-visible, disabled, busy;
    light and dark; every accent. Motion is short (80–150ms), zero under reduced motion.

## 2. Tokens

Components use Piw's semantic tokens only (`--color-*`, `--font-*`, `--space-*`, ...). Each is
an alias of a kit token, declared once in `:root`, so it follows the colour mode and the accent
the kit applies. Only Piw's own colours (code syntax, sticky papers) have values in
`tokens.css`, with a dark block. The contrast exceptions inherited from the kit are listed in
the `tokens.css` header.

**Theming.** `<html>` carries `data-theme="light|dark"` and `data-accent`
(`pink|blue|orange|green|purple`, default blue), both from Settings › Appearance. The kit only
knows light and dark, so **System** is resolved in `src/app/theme.ts`, which follows
`prefers-color-scheme` and rewrites `data-theme` when the OS changes.

### 2.1 Colour

| Token                      | Kit token          | Use                                                       |
| -------------------------- | ------------------ | --------------------------------------------------------- |
| `--color-bg`               | `--background`     | The canvas: views, editor, inspector, menus, dialogs      |
| `--color-bg-soft`          | `--soft`           | The title bar, tab strips, dialog headings, footers       |
| `--color-bg-sidebar`       | `--sidebar`        | List panes beside an editor                               |
| `--color-bg-control`       | `--soft`           | Soft fill of fields and tracks                            |
| `--color-bg-hover`         | `--hover`          | Hover on rows and controls                                |
| `--color-bg-hover-strong`  | `--hover-strong`   | Pressed controls; hover on the primary button             |
| `--color-bg-active`        | `--selected`       | Selected rows, the active area, toggled controls          |
| `--color-bg-overlay`       | `--overlay`        | Scrim behind modal dialogs                                |
| `--color-border`           | `--border`         | The one hairline, and the edge of controls                |
| `--color-border-hover`     | `--control-border` | A boxed control on hover; the primary button's edge       |
| `--color-border-floating`  | `--faint`          | The edge of menus, popovers, dialogs and toasts           |
| `--color-border-strong`    | `--muted`          | The checkbox ring (≥ 3:1)                                 |
| `--color-text`             | `--text`           | Text                                                      |
| `--color-text-muted`       | `--secondary`      | Secondary: snippets, descriptions, inactive tabs          |
| `--color-text-subtle`      | `--muted`          | Tertiary: metadata, counts, labels, hints                 |
| `--color-text-faint`       | `--faint`          | Decorative only: strike lines, separators, empty icons    |
| `--color-placeholder`      | `--placeholder`    | Placeholders (non-essential, ≥ 2.8:1)                     |
| `--color-icon`             | `--icon`           | Standalone icons                                          |
| `--color-accent`           | accent + text mix  | Accent text: links, "today" (AA with every accent)        |
| `--color-accent-fill`      | `--accent`         | Checked checkbox, switch (white mark on top)              |
| `--color-accent-mark`      | `--indicator`      | The active tab's top line, the current-row bar            |
| `--color-focus-ring`       | `--focus-ring`     | Keyboard focus (the accent)                               |
| `--color-danger`           | danger + text mix  | Overdue dates, destructive menu items                     |
| `--color-danger-fill`      | `--danger`         | Destructive hover, the window close button                |
| notice / success / warning | `--notice-*`, ...  | Inline notices, always with text                          |
| `--color-highlight`        | `--edited-bg`      | Search match `<mark>` (also bold: never colour-only)      |
| `--color-edited`           | `--edited-accent`  | The unsaved-changes square                                |
| `--color-selection`        | `--selected`       | Text selection                                            |
| `--color-code-*`           | Piw's own          | Code blocks (AA on `--color-code-bg`, the kit's `--soft`) |
| `--sticky-<name>-*`        | Piw's own          | Sticky surfaces and space dots (7 colours)                |

### 2.2 Shadows, radii, borders

| Token                                 | Value                                                      |
| ------------------------------------- | ---------------------------------------------------------- |
| `--shadow-md`                         | `0 3px 10px var(--shadow)`: menus, toasts (the kit's menu) |
| `--shadow-lg`                         | `0 6px 24px var(--shadow)`: dialogs, Quick Capture         |
| `--shadow-drawer`                     | `-6px 0 24px var(--shadow)`: overlaying inspector          |
| `--radius-sm` / `-md` / `-lg` / `-xl` | 0: square, as the kit                                      |
| `--radius-full`                       | dots and swatches only                                     |
| `--border-width`                      | 1px                                                        |
| `--focus-ring-width` / offset         | 1px on the control's edge (offset −1px), the kit's ring    |
| `--focus-ring-*-mark`                 | 1px ring, 1px outside, for checkboxes and swatches         |
| `--opacity-disabled`                  | 0.45, the kit's                                            |

Floating layers have a 1px `--color-border-floating` edge and a soft shadow.

### 2.3 Motion and layers

`--duration-fast` 80ms (hover, press, selection, checkbox), `--duration-normal` 120ms (menus,
toasts), `--duration-slow` 150ms (inspector, dialogs); `--ease-standard` and `--ease-enter` are
ease-out curves. All durations are 0 under `prefers-reduced-motion`. Quick Capture has no
open/close animation. Layers: sticky group labels 10, overlaying inspector 300, modal 400,
menus 500, toasts 600.

## 3. Type

**Stack:** the kit's, `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` (the
desktop's own sans-serif on Linux), then colour emoji. **Mono** (`--font-mono`, the kit's
`--mono`) carries code and, as in Zap, metadata: badges, counts, shortcut hints, status lines.
Group labels are 10px uppercase. All sizes are `rem`, so the Text size preference (Small
93.75%, Default 100%, Large 112.5%) scales Piw's own text; the kit's components keep their px
sizes. There is no `zoom` or `scale` in CSS.

| Role                      | Size / weight / line | Token                                           |
| ------------------------- | -------------------- | ----------------------------------------------- |
| UI: rows, tabs, buttons   | 12 / 400             | `--font-size-ui`                                |
| Secondary: snippets, menu | 11 / 400             | `--font-size-secondary`                         |
| Metadata, counts, labels  | 10 / 400             | `--font-size-meta`, `--font-weight-section`     |
| Editor body               | 13 / 400 / 1.6       | `--font-size-editor`, `--line-height-relaxed`   |
| View title, inspector     | 14 / 600             | `--font-size-view-title`, `--font-size-heading` |
| Editor H3 / H2 / H1       | 14, 15, 17 / 600     | `--font-size-heading`, `-xl`, `-2xl`            |
| Note title                | 17 / 600             | `--font-size-2xl`, `--font-weight-title`        |

Weights: 400, 500, 600 (`font-synthesis: none`). No letter spacing.

## 4. Grid

```
|<- inset ->|<- 14 glyph ->|<- 8 ->|text …                          … |<- inset ->|
            12                     34                          right − 12
   (16 and 38 in windows ≥ 1100px)
```

- `--content-inset` 12px (the kit's padding); 16px in windows ≥ 1100px (a `:root` media
  query, so the title bar and every pane, including the 300px split-view list, share it).
- `--glyph-column` 14px holds every leading glyph: the app mark, checkboxes, `+`, row icons,
  group icons. `--text-start` (inset + 22px) is where text starts.
- Right edges share the inset. Controls with no box at rest (icon buttons, the back link) hang
  their padding outside the grid so their **glyphs** sit on it (`--icon-button-hang` 6px;
  `data-icon-button` marks them). Row fills span the full width of their list.
- Lists and the view header span the whole canvas, as in Zap. The editor is a centred 680px
  column (`--editor-max-width`); Settings a centred 640px column.
- Vertical: the title bar is 36px including its hairline, tab strips 32px, controls 26px
  (small 22px), menu items and single-line rows 28px, status strips 24px.

## 5. Shell

The main window is the vault shell (`src/views/vault/VaultApp.tsx`): the title bar, then the
sidebar beside the tab strip and its content, then the status bar.

### Title bar

- The chrome is Zap's: the kit's `TitleBar`. The window has no system title bar: macOS keeps
  its native traffic lights overlaid on the bar (the kit's `macInset`); Linux and Windows draw
  the kit's window controls at the right end (`WindowChrome.tsx`, `.mnml-window-controls`: 29px
  borderless buttons the bar's full height, close turns `--danger`), and Linux also draws resize
  edges.
- **Title bar:** 36px on `--color-bg-soft` with one hairline under it. The bar is the Tauri drag
  region; the kit makes its children ignore the pointer and every control opts back in.
  - **Left:** the kit's `Brand`: the 14px app mark in `--color-icon` and "piw" at 12/600.
  - **Centre:** the space filter (`src/views/vault/SpaceMenu.tsx`: layers glyph, "All spaces" or
    the folder's name at 12/600, chevron), centred on the window like the connection in Zap's
    bar. It scopes the tree, search and task views; it also offers New space… (a top-level
    folder).
  - **Right:** the kit's palette toggle (`.mnml-theme-toggle`), which opens the Appearance
    dialog (colour mode and accent), then Settings in the same style (`Mod+,`; pressed while its
    tab is active), then the window controls.

### Sidebar (`VaultSidebar.tsx`)

The kit's `ResizableSidebar` on `--color-bg-soft` (its width is remembered):

- **Notes | Tasks** at the top: the kit's segmented control (`.mnml-segmented`), as Zap's
  Tables | Queries: two joined buttons with a glyph and an 11px label, the current one on the
  canvas in text ink; the choice is remembered.
- The search field (the kit's sidebar search; `Mod+K` in its hint).
- **Notes:** the label (the space's name, or Notes) with New note (`Mod+N`) and New folder at its
  end, as 28px framed squares (the height of Notes | Tasks) like Zap's button beside Tables | Queries, then the vault
  as a tree: each space's **Inbox** first, with its open tasks as a count, then folders, then
  notes, by name; a pin marks a note on the desktop. Folders open and close (remembered); a note
  opens in a tab. Every row has a context menu (New note, New folder, Rename, Move to Trash), and
  notes and folders can be dragged onto a folder to move them.
- **Tasks:** Today (with its open count), Upcoming and All tasks.
- Trash in the kit's `SidebarFooter`.

### Tabs and content (`VaultTabs.tsx`)

The kit's tab strip (`.mnml-tabs`, Zap's open tabs): a 32px soft strip with a hairline at its
foot, square tabs split by hairlines, a 13px icon and an 11px label, the active tab on the canvas
in text ink with a 1px accent line on top, and a close button. A note, a task view, Trash and
Settings each open in one tab; opening one already open activates it, a new tab opens after the
active one, and closing one activates its neighbour, as in Zap. `+` after the last tab makes a
new note (`Mod+N`). Tabs are remembered. With no tab
open, the content region shows an empty state with New note.

### Status bar

The kit's `StatusBar`, as in Zap: 24px on `--color-bg-soft` with a hairline above it, 10px mono
in secondary ink. Left: the vault's folder and the current space (`~/Piw / Work`,
`~/Piw / All spaces`). Right: the stickies on the desktop, then the open note's file state
(Saved, Saving…, or Couldn't save / Changed on disk in the danger ink), split by the kit's
`Separator`.

## 6. Page skeleton (`src/components/app/Page.tsx`)

- **`ViewToolbar`** is the view header, as Zap's view heading: a 36px line plain on the canvas
  with one hairline under it, spanning the canvas like the lists under it. Props: `title`
  (14/600, `h1` by default), `count` (10px mono tertiary beside it), `note` (11px secondary
  context, hidden below 560px), `filters` (a `Segmented variant="text" size="sm"`), `actions`
  (icon buttons, or one Button), `leading` (a back link whose arrow sits on the inset). With
  `titleAs="span"` the title becomes a quiet 12px breadcrumb: the line above an editor.
- **`PageView`** (a size container) → **`PageScroll`** → **`PageColumn`** (`content` the full
  canvas, `editor` 680px centred, `narrow` 640px centred, `full`).
- **`PageSectionHeader`**: the one group label, the kit's sidebar label (10px uppercase,
  tertiary), on the text column with an optional glyph in the glyph column and a mono count at
  the right edge, sticky on the canvas. **`PageGroup`**: groups are separated by space, not by
  lines. **`PageList`**: a `role="list"` without bullets.

## 7. Components (`src/components/ui`)

Shared by every window. Nothing new outside this list without a design review.

- **Button.** The kit's `Button` (`.mnml-button`): square, a 1px `--color-border` edge on the
  canvas colour, the hover fill. `secondary` (default) is the kit's default; `primary` the
  kit's primary (`--hover` fill, `--control-border` edge; one per surface: Save, Create);
  `ghost` borderless text in secondary ink with the hover fill; `danger` secondary in danger
  ink that fills `--danger` on hover (confirm-delete only). `md` 26px / 12px / 0 9px; `sm`
  22px / 11px / 0 6px. Icon 13px, 6px gap. Toggled (`aria-pressed`) takes the selection fill;
  `loading` keeps the label, swaps the icon for the kit's spinner and sets `aria-busy`.
- **IconButton.** The kit's `IconButton` (`.mnml-icon-button`): borderless, `--color-icon`
  ink, the hover fill. 26px with a 14px icon (`md`), 22px with 13px (`sm`); pressed: the
  stronger fill; `pressed` prop: the selection fill; open menu: the hover fill. Name and
  tooltip are required, the tooltip appends the formatted shortcut.
- **Segmented.** Radiogroup (one tab stop; arrows move and select). `contained`: the kit's
  `Segmented` (`.mnml-segmented`): joined square buttons in a 1px border with hairlines between
  them, muted 11–12px labels, the selected one in text ink on the canvas (Settings, Quick
  Capture). `text`: borderless text buttons for view filters (Today · Upcoming · All ·
  Completed), the selected one on the selection fill. `md` 26px, `sm` 22px.
- **Tabs.** The kit's `Tabs` (`.mnml-tabs`, `.mnml-tab`): a 32px soft strip with a hairline at
  its foot; square tabs separated by hairlines, 11px muted labels; the selected tab
  (`data-active`) is text ink on the canvas with a 1px line in the accent along its top. Rename
  (F2, double-click), reorder (Alt+←/→), the overflow menu and `+` follow the last tab.
- **Checkbox.** Square, as every kit control: 14px (`sm` 12px), a 1px tertiary ring; hover
  turns the ring secondary and previews the check; checked: the accent fill with a white
  check. Focus: a 1px ring 1px outside. Native input, ≥ 24px hit area.
- **ListRow.** Full-bleed box, content on the grid; the hover and selection fills are drawn by
  `::before`, rounded 6px and inset 6px from the column edges. Selected: `--color-bg-active`;
  while focus is in the list: `--color-bg-active-accent`; tertiary metadata turns secondary on
  either. Keyboard focus: a 2px inset ring on the fill's shape. Single line ≥ 32px; with
  snippet/meta: title 13/600, snippet 12 secondary, meta 11 tertiary (56px). Completed:
  secondary ink; free-form rows add a faint 1px strike. Actions appear on hover and focus.
- **Menu** (DropdownMenu, ContextMenu, submenus, DateQuickPicker). Radix behaviour, the kit's
  `.mnml-menu` look: square, a 1px `--color-border-floating` edge, `--shadow-md`, 3px padding,
  190px (230px with shortcuts). Items 28px, 4px 7px, 11px; icons 13px secondary; the
  highlighted item takes the hover fill; checked marks in the accent; shortcuts plain muted
  text (the kit's `.mnml-menu-shortcut`); group labels 10px uppercase muted; separators full
  width. Context menus also open with Shift+F10 or the Menu key.
- **Dialog / ConfirmDialog.** Radix behaviour, the kit's `Dialog` look: `.mnml-dialog` (square,
  a 1px `--color-border-floating` edge, `--shadow-lg`) 360px wide over the `--overlay` scrim;
  `.mnml-dialog-heading`, a 12/500 title on a soft bar with a hairline under it and the × at
  its end; a 16px body; `.mnml-dialog-actions`, buttons right-aligned 7px apart (Cancel, then
  the primary or danger action). ConfirmDialog is the kit's `.mnml-message-dialog`.
- **Toast.** Bottom centre, 16px above the window edge; the menu surface (radius 8,
  `--shadow-md`); 13px text; the action is an accent ghost Button; the × a 24px icon button.
  8s by default, paused on hover and focus; one at a time (the newest replaces the previous).
  Errors lead with a danger icon and use `role="alert"`.
- **TextInput / TextArea.** After the kit's `Fields` inputs: square, a 1px control border on
  the canvas, 0 7px (TextArea 6px 7px); hover: the stronger border; focus: the border takes the
  focus colour, no halo. `ghost`: caret-only, no box, no padding (rename, add rows,
  descriptions). `editor`: no chrome at the reading measure. `sm` 22 / 11px, `md` 26 / 12px,
  `lg` 28 / 12px. Labels 11px secondary; errors 11px danger.
- **Kbd.** The kit's shortcut hint (`.mnml-search-shortcut`): 9–10px mono, muted, on the soft
  fill in a 1px border with a 2px radius. `inline`: one hint; `chip`: one cap per key, 2px
  apart. Plain text inside menus. Rendered per OS: macOS symbols in the order ⌃⌥⇧⌘
  (`⌘⇧Space`); elsewhere words joined by `+` (`Ctrl+Shift+Space`).
- **EmptyState.** The kit's `.mnml-empty-state`, centred in its region: a 28px icon in faint
  ink, a 13/500 title in secondary ink, an 11px muted line, at most one Button 16px below.
- **SpaceDot.** A 6px square, like the kit's status dot; never colour-only (a label, or
  `role="img"` with a name).
- **Badge.** The kit's `.mnml-badge`: 10px mono secondary ink in a 1px border, 3px 6px.
- **SaveIndicator.** 11px tertiary text with no box ("Saving…", "✓ Saved"); errors in danger
  with a Retry text button.
- **Drawer** (360px). The canvas surface with one hairline on the left; overlay mode adds
  `--shadow-drawer`; 20px padding; the header line aligns with the view header beside it
  (13/600 secondary title, 28px icon buttons, the last glyph on the padding). No vault view uses
  it yet.
- **Spinner.** The kit's `Spinner`: a turning Loader2 in `currentColor`.
- **AccentPicker.** The kit's appearance swatches (`.mnml-appearance-accents`): one toggle per
  accent, a 23px round swatch over its 10px name, the pressed one ringed in text ink.

Icons: one outline set (Lucide, ISC), 14px at Lucide's own 2px stroke (as the kit draws them),
`currentColor`; decorative icons are `aria-hidden`, and an icon always sits next to text or has
an accessible name.

## 8. States

| State         | Borderless (ghost, icon, tabs, rows)                 | Soft-filled (secondary, search, track) | Accent / danger fill        |
| ------------- | ---------------------------------------------------- | -------------------------------------- | --------------------------- |
| Rest          | transparent, secondary ink                           | `--color-bg-control`, text ink         | the fill, white label       |
| Hover         | `--color-bg-hover`, text ink                         | `--color-bg-hover-strong`              | `*-fill-hover`              |
| Pressed       | `--color-bg-hover-strong`                            | `--color-bg-pressed`                   | fill-hover + a dark overlay |
| Selected / on | `--color-bg-active`, text ink                        | `--color-bg-active`                    | —                           |
| Focus-visible | 2px accent ring, 1px outside (rows and tabs: inside) | same                                   |
| Disabled      | `--opacity-disabled`, no hover                       | same                                   |
| Busy          | full colour, spinner, `aria-busy`, clicks ignored    | same                                   |

Boxed fields: rest control border → hover stronger border → focus accent border + halo →
invalid danger border. Forced colours: system outlines and `Highlight` for selection and focus.

Feedback states:

- **Loading:** nothing for the first 300ms, then one muted "Loading…" line in the region. No
  skeletons. Keep the previous content while refreshing.
- **Empty:** an EmptyState with one title, one helper line and **one** action.
- **Region error:** what happened, what to do, and Try again. No codes in the text.
- **Saving:** hidden at rest; "Saving…" only when a save is slow; "Saved" briefly after a
  visible save (Mod+S always shows it); "Couldn't save · Retry" stays until resolved while the
  save retries on its own (2s, 4s, 8s… up to 30s). Text is never discarded.
- **Undo instead of confirmation** for anything restorable: Move to Trash (a note or a folder;
  Trash restores it), Remove from desktop. The toast offers Undo.
- **Confirmation only for irreversible or multi-item actions:** Delete forever, Import Piw 0.1
  again. The title is a question naming the object, the button an explicit verb (danger for
  deletion), initial focus on Cancel, Esc cancels.
- **Platform limitation:** an inline notice in Settings and the related empty state, with the
  alternative. Never a modal, never a crash.

## 9. Layout and windows

| Width           | Behaviour                               |
| --------------- | --------------------------------------- |
| Window < 800    | The brand's note hides (the kit)        |
| Window ≥ 1100   | The content inset grows from 12 to 16px |
| Note view < 720 | The note panel hides; its toggle stays  |

Windows (sizes in CSS px, from `src-tauri/src/platform/window.rs`):

| Window                        | Size                                               | Chrome                                                                                  |
| ----------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Workspace (`main`)            | 1120 × 740, minimum 420 × 360                      | No system title bar; the kit's title bar (§5)                                           |
| Quick Capture (`capture`)     | 520 × 200, fixed                                   | Undecorated, always on top, hidden from the taskbar, centred horizontally at 1/3 height |
| Sticky (`sticky:<kind>:<id>`) | 300 × 260 by default, minimum 200 × 120, resizable | Undecorated with its own 24px drag strip, hidden from the taskbar; size is remembered   |

Remembered layout (`src/state/vault.ts`, per vault folder): open tabs and the active one, the
space filter, open folders, the sidebar's width and whether the note panel is open.

## 10. Views

- **Note.** A breadcrumb line (`Work / Projects / Refactor 2FA`, 11px in tertiary ink) with Pin
  to desktop and the note panel toggle, then the title, then the text. The save state is in the
  status bar (§5). **The title is the file name** (docs/vault-format.md §2):
  editing it renames the file on Enter or blur (links to it are rewritten), Esc restores it, and
  Enter or ↓ moves on to the text. A new note opens with its title selected.
- **Note editor.** The text as live Markdown (CodeMirror, `MarkdownEditor`), no toolbar: the
  text stays plain Markdown, **never rewritten**, but every line renders its formatting
  (headings, bold, italic, strikethrough, inline code, links, quotes, rules). Front matter folds
  into one quiet line of its properties (tags as `#tag`) until the caret goes into it (a click
  on the line, or ↑ from the first line), then shows as mono YAML. A fenced code block shows on
  the soft fill with its language as a quiet label and its ``` fences hidden, until the caret
  is in it. Empty lines outside code take half a line, as paragraph gaps, except the one being
  edited. Only the lines under the caret or selection show their markers, muted. Task list items
  (`- [ ]`, `- [x]`) render as a square checkbox; a click ticks it in the text, adding `✅ <today>` (hidden until the line is edited), and a
  ticked item is struck in the muted ink. `[[links]]` open their note on
  Ctrl/⌘+click (a link to nothing offers to create it); `#tags` are tinted. Helpers (the only
  ones): Enter continues a list line and removes an empty marker; Tab / Shift+Tab indent only on
  list lines (elsewhere Tab moves focus); Mod+B / Mod+I wrap the selection in `**` / `_`;
  Mod+Enter ticks a task item or turns the line into one. Autosave runs 400ms after the last
  keystroke and on blur, tab switch, hide and quit, guarded by the file's hash: if the file
  changed on disk meanwhile, the editor shows "Changed in another window" with Reload and Keep
  mine; with nothing unsaved it reloads quietly.
- **Task dates.** A task's `📅` date renders as a chip after its text (overdue in danger ink,
  `Today`, `Tomorrow`, a weekday within a week, else `12 Nov`); clicking it opens the date menu.
  Typing `@` on a task line offers dates (`@today`, `@tomorrow`, weekdays, `@next week`,
  `@nov 12`; Enter or Tab writes `📅 YYYY-MM-DD`); Mod+D opens the same menu for the task under
  the caret, with "No date" when it has one. The menus are the kit's menu look on CodeMirror
  tooltips.
- **Selection menu.** Selecting text shows a small menu just below the selection, so it never
  covers the line being read: **Create sticky from selection…** (also Mod+Shift+S: it asks for a
  title, writes `<Space>/Stickies/<Title>.md` with the text and `From [[<note>]]`, and pins it),
  then Bold and Link (`[text]()` with the caret ready for the address).
- **Note panel** (`NotePanel.tsx`, 260px at the right, toggled from the breadcrumb): the note's
  tasks under their heading's name, ticking and dates as in the editor, after "Tasks" with the
  progress (`1 of 4`) and a 2px bar; then the outline (headings), with the section the caret is
  in marked as the selected row. Labels are sentence case; Markdown markers are left out of the
  text. Clicking an entry puts the caret on its line. It reads the text
  being typed, not the saved file.
- **Task views** (Today, Upcoming, All tasks): the tasks of every note in the space filter.
  Today shows Overdue first, then today's tasks, and keeps what was ticked today until you leave
  the view; Upcoming groups by day; All groups by note. Rows: square checkbox, the text, the
  note (and heading) it lives in, the date chip. Ticking, dating and rewording edit the note's
  line (refused, and refreshed, if that line changed meanwhile); clicking the note opens it at
  the line. **Add task** is the first row: it appends to the space's `Inbox.md` (the last used
  space under All spaces), with the view's date (Today → today). Pin to desktop puts the view on
  the desktop.
- **Search (Mod+K).** A modal palette over the notes in the space filter: titles and text,
  matches highlighted with `<mark>`, `#tag` for tags. Trash is not searched. ↑/↓ move, Enter
  opens the note at the match, Esc closes and restores focus.
- **Trash.** What was deleted from the vault, newest first (`.piw/trash/`): Restore (under a
  free name if the old one is taken) and Delete forever… (asks first). No automatic purge.
- **Settings (Mod+,).** Tabs General · Shortcuts · Appearance · Data · Stickies; changes apply
  immediately. Shortcuts shows the global shortcut's real registration state as icon + text, a
  recorder that refuses reserved combinations (§14), and the `piw --quick-note` /
  `--quick-task` fallback commands. Data shows the vault folder with Change folder…, the import
  of Piw 0.1 (offered while there is something to import; Import again asks first), and where
  the app keeps its own data ([architecture](architecture.md#data)).

## 11. Quick Capture

- **Look:** an elevated surface, radius 10 where the window is transparent (Linux: square
  corners and a hairline; Windows 11 and macOS: the native shadow); the Note / Task switch is a
  `contained` Segmented; a 15px borderless input; a quiet footer hint (`⌘↩ Save · Esc`, plain
  11px tertiary key text) and an accent Save pill.
- **Opening:** the window is pre-created and hidden, so the shortcut, the tray (Quick Note,
  Quick Task) or `piw --quick-note` / `--quick-task` only show it. Target: < 150ms to a ready
  caret. Focus goes to the text with the caret at the end, synchronously.
- **Modes:** Note | Task (Mod+1 / Mod+2). Switching never loses text: Note → Task makes the
  first line the title and the rest the description, and back.
- **Saving:** Mod+Enter in both modes, Enter in the task title, or Save. The capture is
  appended to the chosen space's `Inbox.md` (vault-format.md §5), and the popup hides **only
  after the write is confirmed**; on error the text stays with Retry. Mod+Shift+P toggles "Pin
  to desktop after saving", which pins that Inbox. The space is the last used one or the first
  space (Settings › General).
- **Closing:** Esc or blur hides it at once and keeps the text as a draft (written 300ms after
  each change, restored on reopen with "Draft restored · Discard"). Drafts are cleared only
  after a confirmed save or Discard.

## 12. Sticky windows

- **Look:** muted paper palettes (Warm gray, the default, plus Yellow, Clay, Rose, Sage, Blue
  and Lavender); `data-sticky-color` remaps the semantic tokens, so shared components render on
  the paper. A 24px drag strip on the paper's own colour with no divider; its controls (Keep on
  top, Open in Piw, Hide from desktop) appear on hover or keyboard focus. 13px body with round
  task checkboxes in the sticky's own ink. Linux draws a hairline with square corners (no shadow
  for undecorated windows); Windows and macOS use the native shadow.
- **Bodies:** a vault note (editable, autosaved like the note editor, §10) or a task view
  (Today, Upcoming or All, in one space or all, with Add task).
- **A note sticky** uses the note editor at the sticky's size, task dates included. The strip
  shows the note's title and the count of ticked tasks after it (`2/5`, 10px mono) when the note
  has any.
- **A task view sticky** lists the view's tasks as rows (checkbox, text, date chip), titled with
  the view and space (`Today · Work`).
- **Four distinct actions:** _Pin to desktop_ creates the sticky; _Keep on top_ is optional;
  _Hide from desktop_ closes the window but keeps it pinned; _Remove from desktop_ unpins
  it. Closing through the window manager means Hide.
- **One sticky per item or view;** pinning again shows and focuses it. Position, size and
  on-top are saved per sticky and re-applied after every show; a sticky that would be off-screen
  moves onto a connected monitor.
- **Startup:** stickies come back only if "Reopen pinned stickies when Piw starts" is on (off by
  default, for privacy).
- **A note moved to Trash** closes its sticky; a note renamed or moved in Piw keeps it (renamed
  in another app, the sticky says the note is gone).
- Each sticky is a separate webview: Piw warns above 8 open stickies.

## 13. Tray and lifecycle

- Tray menu: Quick Note, Quick Task, Open Workspace, Show/Hide Sticky Notes, Settings…, Quit
  Piw (Settings… opens the Settings tab). On Linux the tray is menu-only.
- Closing the workspace hides it when "Keep running in the tray" is on (the default); capture,
  stickies and the shortcut keep working. The first time, a toast explains how to quit. Quit Piw
  (tray or Mod+Q) flushes pending saves, then exits.
- Single instance: launching Piw again shows the workspace; `--quick-note` / `--quick-task`
  open the capture popup in the running Piw; `--hidden` starts without showing the window.
- No notifications, reminders or badge counts.

## 14. Keyboard

Single-key shortcuts (letters, `/`, Space, Delete) work only when focus is not in a text field.
Every drag has a keyboard or menu alternative.

| Where         | Keys                                                                                                                                                                                           |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Global (OS)   | Quick capture: `Ctrl+Shift+Space` / `⌘⇧Space`, configurable in Settings › Shortcuts                                                                                                            |
| Workspace     | Mod+N new note · Mod+K search · Mod+W close tab · Ctrl+Tab / Ctrl+Shift+Tab next / previous tab · Mod+, Settings · Mod+Q quit                                                                  |
| Note          | Mod+Shift+P pin to desktop · Mod+Shift+S sticky from selection · Mod+D due date · `@` date suggestions · Mod+Enter tick or make a task · Mod+B / Mod+I bold, italic · Ctrl/⌘+click open a link |
| Tree          | Shift+F10 or Menu key: row menu (New note, New folder, Rename, Move to Trash) · drag a row onto a folder to move it                                                                            |
| Quick Capture | Mod+1 / Mod+2 Note / Task · Mod+Enter save (Enter in the task title) · Tab / Shift+Tab fields · Mod+Shift+P pin after saving · Esc close, keeping the draft                                    |
| Sticky        | Mod+W hide · Mod+O open in Piw · Shift+F10 strip menu · Mod+Enter tick a note's task item                                                                                                      |

**Esc order:** Esc closes the innermost layer first: menu or date picker → inline rename or
shortcut recorder (cancel) → dialog or palette. **Esc
never discards text and never hides a sticky.**

**Global shortcut recorder** (`isReserved` in `src/lib/shortcuts/accelerator.ts`): it needs
Ctrl, ⌘ or Alt together with a key, and refuses:

- Everywhere: Mod+letter without Shift or Alt (it collides with every app's own menus).
- Windows and Linux: Ctrl+Alt+any (AltGr types characters), Super/Win+any, Alt+letter,
  Alt+Space, Alt+F1/F2/F4, Ctrl+Space (input methods).
- macOS: ⌘Space, ⌃Space, ⌥⌘Space, ⌘Q/W/H/M/Tab/\`, ⌘⇧3/4/5, ⌥+letter (types characters).

App shortcuts never use Ctrl+Alt or Alt+letter either.

## 15. Accessibility

- AA for all essential text (4.5:1) and 3:1 for focus, checkbox rings and fills, enforced by
  `tokens.test.ts` on the canvas, the top bar and the elevated surface, on both selection fills,
  in the search field and on every sticky paper. Re-run `pnpm vitest run src/styles` whenever a
  colour token changes.
- Focus is always visible for the keyboard and quiet for the pointer (`:focus-visible`), never
  removed. Text fields use the caret (ghost) or the accent border + halo (boxed). Targets are at
  least 24 × 24px.
- Roving tabindex in lists, tab bars, segmented controls and radio groups (Tab leaves a list in
  one step). No keyboard traps.
- Roles: the current sidebar entry uses `aria-current="page"`; the tree is a list of buttons
  with `aria-expanded` on folders; lists are `role="list"` with one primary focusable per row
  (the native checkbox for tasks; metadata via `aria-describedby`); group headers are headings
  with their count in text; tabs are `tablist` / `tab` / `tabpanel`; dialogs trap focus and
  return it (`alertdialog` for confirmations); menus use menu roles with typeahead; the note
  panel is a labelled `complementary` region;
  Segmented is a `radiogroup`; search is a `combobox` + `listbox`; toasts are `status` (errors
  `alert`); "Saving… / Saved" are not announced, save errors are.
- **Colour never carries meaning alone:** overdue = colour + icon + "Overdue" in the label;
  spaces = dot + name; tab type = icon; sticky state and shortcut status = text; completion =
  check + strike; matches are bold.
- The UI works at 200% text size: truncate with an ellipsis and keep the full name in the
  tooltip and accessible name. `prefers-contrast: more` swaps hairlines and tertiary ink for
  stronger ones; `prefers-reduced-motion` zeroes every duration.

## 16. Microcopy

- Strings live in `src/strings/`. English, sentence case everywhere; view names are proper
  nouns (Notes, Today, Upcoming, All tasks, Trash, Settings).
- Buttons and menu items start with a verb and say exactly what happens ("Move to Trash",
  "Delete forever", "Retry"). Never "OK", "Yes" or "Submit".
- Plain, calm and short: no blame, no exclamation marks, no error codes ("Couldn't save").
- Objects are named in curly quotes (“Refactor 2FA”). "…" (one character) ends commands that
  open a dialog or picker, and placeholders.
- Shortcuts are rendered per OS from one neutral notation (`Mod+Shift+Space`); plurals are real
  plurals ("1 task", "2 tasks"); no text in images.

## 17. Rules every change must respect

1. **The shell is the title bar, the sidebar, the tab strip and the status bar.** No second
   bar inside a view; a note's breadcrumb line is its header.
2. **Spaces are a global filter** (the top-level folders) that persists across tabs. _All
   spaces_ is a filter, not a space.
3. **The file is the truth.** Piw never rewrites a note's text beyond the edit asked for (a
   tick, a date, a rename's links), and every write is guarded by the file's hash.
4. **A note's title is its file name**; editing the title renames the file.
5. **A task is a line.** Views list lines of notes; there is no task record to diverge.
6. **Completing a task never moves the row** until the user leaves the view. No toast for it.
7. **Undo replaces confirmation** for anything restorable; confirmations are for irreversible or
   multi-item actions (§8).
8. **Capture** closes only after the write is confirmed. Esc and blur keep a draft. Switching
   modes is lossless. No animation.
9. **Pin / Keep on top / Hide / Remove are four distinct actions.** Esc never hides a sticky.
   Stickies don't reopen at startup unless the user opted in.
10. **Trash has no automatic purge**, and Piw deletes nothing outside `.piw/trash/` on its own.
11. **Single-key shortcuts** only outside text fields. No Ctrl+Alt or Alt+letter app shortcuts.
12. **Colour never carries meaning alone.** Retest contrast whenever a token changes.

## 18. For view authors and reviewers

- Put the title, count, filters and actions in `ViewToolbar`; never draw a bar inside a view.
- Use `PageColumn` for lists; use `ListRow` (or its classes) for rows and
  never set a row background directly: the fill lives in `::before`.
- Leading glyphs are 16px in the glyph column; text starts on `--text-start`; trailing parts end
  on the inset. Overdue dates use `--color-danger`; other metadata `--color-text-subtle`.
- Use the tokens for every size; when one is missing, add it to `tokens.css` with a comment.

Checklist (verify in screenshots, e.g. from `scripts/e2e/visual-qa.sh`, see
[Development checks](../README.md#development-checks)):

- [ ] Every left edge sits on the glyph column or the text column (measure x positions).
- [ ] Nothing is 1–3px off: icons optically centred to text, checkboxes on the first line.
- [ ] Every interactive element has hover, active, focus-visible and disabled states.
- [ ] Light and dark were each checked: contrast, fills and shadows.
- [ ] 1100×750, 1440×900, 1920×1080 and 700×700: no clipping, no horizontal scroll, no orphan
      voids; the note panel hides below 720px of note.
- [ ] Empty, loading, error and long-content cases.
- [ ] No mono outside code, no uppercase labels, no dashed borders, no square task checkboxes.
- [ ] Keyboard shortcuts, focus order and tests unchanged.
