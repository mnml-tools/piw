# Piw design system

The single design and behaviour reference for every window of Piw: the shell, the components,
the views and their keyboard and window rules. Tokens live in
[`src/styles/tokens.css`](../src/styles/tokens.css) and global defaults in
[`src/styles/base.css`](../src/styles/base.css). Both are guarded by
[`src/styles/tokens.test.ts`](../src/styles/tokens.test.ts): WCAG contrast, identical dark
blocks, unknown tokens and raw colours outside `tokens.css`. When this page and `tokens.css`
disagree, `tokens.css` wins. Live examples of every component and state: `pnpm dev`, then
`/?window=gallery`.

**In one sentence:** one quiet top bar over a white canvas; typography carries the hierarchy;
soft rounded fills instead of boxes; two greys and one calm blue.

**Conventions:** **Mod** = ⌘ on macOS, Ctrl on Windows and Linux. "Item" = note, document or
task. Sizes are CSS px unless stated.

**Provenance:** the principles come from Apple-platform note apps: **Bear** (editorial writing,
white surfaces, soft rounded selection), **Minimal** (spacious, gentle colours) and **NotePlan**
(tasks inline in text, round checkboxes, quiet metadata). Piw studies their principles only: no
assets, code or values were taken from them. **Zap** (<https://github.com/rafmst/zap>), by the
same team, is the reference for density and finish. Inter Variable (OFL-1.1) is bundled as the
Linux fallback font (notices in
[`THIRD_PARTY_LICENSES.md`](../src-tauri/resources/THIRD_PARTY_LICENSES.md)).

## 1. Principles

1. **Capture first.** Nothing may slow `shortcut → type → save → back to work`.
2. **Quiet chrome.** One top bar. No sidebar, no status bar, no boxed controls in content.
   Hairlines appear only between the bar and the canvas, between panes, or between groups.
3. **Typography carries the hierarchy.** Size and weight first, then colour; never boxes.
4. **Soft geometry.** 6px for controls and rows, 8px for menus and popovers, 10px for dialogs,
   Quick Capture, stickies and Settings groups. Selection is a soft rounded fill.
5. **Calm colour.** Near-white canvas, near-black text, a secondary and a tertiary grey, one
   accent. Space colours are small round dots only.
6. **One grid** (§4). Every left edge sits on the glyph column or the text column.
7. **Keyboard-first, mouse-friendly.** Every action works from the keyboard; shortcuts are shown
   in menus and tooltips; anything revealed on hover is also revealed on focus.
8. **Predictable and safe.** Everything autosaves. Destructive actions have undo or a
   confirmation. Rows never jump under the pointer.
9. **Honest about the platform.** When the OS limits something (Wayland shortcuts, tray,
   always-on-top), say so in plain words and offer the alternative. Never fail silently.
10. **Every state designed.** Rest, hover, pressed, selected, focus-visible, disabled, busy;
    light and dark. Motion is 120–160ms ease-out, zero under reduced motion.

## 2. Tokens

Components use semantic tokens only. Alias tokens (`var(--other)`) are declared once in `:root`
and follow the theme they point to. The computed contrast table and the small AA-driven
adjustments to the starting palette are in the `tokens.css` header.

### 2.1 Colour

| Token                      | Light             | Dark                    | Use                                                     |
| -------------------------- | ----------------- | ----------------------- | ------------------------------------------------------- |
| `--color-bg`               | `#FFFFFF`         | `#1C1C1E`               | The canvas: views, editor, inspector, notes list        |
| `--color-bg-app`           | = `--color-bg`    | = `--color-bg`          | Window base, secondary panes (alias)                    |
| `--color-bg-soft`          | `#F7F7F5`         | `#232325`               | The top bar; Settings groups                            |
| `--color-bg-elevated`      | `#FFFFFF`         | `#2A2A2D`               | Menus, popovers, dialogs, toasts (+ shadow)             |
| `--color-bg-raised`        | `#FFFFFF`         | `#3A3A3D`               | Selected segment on a contained Segmented track         |
| `--color-bg-control`       | `rgba(0,0,0,.05)` | `rgba(255,255,255,.08)` | Secondary buttons, the search field, segmented tracks   |
| `--color-bg-hover`         | `rgba(0,0,0,.04)` | `rgba(255,255,255,.06)` | Hover on rows and borderless controls                   |
| `--color-bg-hover-strong`  | `rgba(0,0,0,.08)` | `rgba(255,255,255,.11)` | Pressed borderless controls; hover on soft-filled ones  |
| `--color-bg-pressed`       | `rgba(0,0,0,.11)` | `rgba(255,255,255,.14)` | Pressed soft-filled controls                            |
| `--color-bg-active`        | `rgba(0,0,0,.06)` | `rgba(255,255,255,.09)` | Selected (soft): rows, the active area pill, toggles    |
| `--color-bg-active-accent` | accent 12%        | accent 18%              | The selected row while focus is in its list             |
| `--color-bg-overlay`       | `rgba(0,0,0,.2)`  | `rgba(0,0,0,.5)`        | Scrim behind modal dialogs                              |
| `--color-border`           | `rgba(0,0,0,.08)` | `rgba(255,255,255,.09)` | The one hairline                                        |
| `--color-border-subtle`    | `rgba(0,0,0,.05)` | `rgba(255,255,255,.06)` | Hairlines inside a group (Settings rows)                |
| `--color-control-border`   | `rgba(0,0,0,.14)` | `rgba(255,255,255,.14)` | Boxed input at rest                                     |
| `--color-border-hover`     | `rgba(0,0,0,.22)` | `rgba(255,255,255,.24)` | Boxed input on hover                                    |
| `--color-border-strong`    | = tertiary        | = tertiary              | The task checkbox ring (≥ 3:1)                          |
| `--color-text`             | `#1D1D1F`         | `#F5F5F7`               | Text                                                    |
| `--color-text-muted`       | `#66666B`         | `#A1A1A6`               | Secondary: snippets, descriptions, inactive tabs, icons |
| `--color-text-subtle`      | `#707075`         | `#949499`               | Tertiary: metadata, counts, hints (≥ 4.5:1)             |
| `--color-text-faint`       | `#A1A1A6`         | `#636366`               | Decorative only: strike lines, separators               |
| `--color-placeholder`      | `#98989D`         | `#727276`               | Placeholders (non-essential, ≥ 2.8:1)                   |
| `--color-accent`           | `#0A66C2`         | `#5AA9FF`               | Links, marks, focus, "today"                            |
| `--color-accent-fill`      | `#0A66C2`         | `#2E76CD`               | Primary button, checked checkbox (white on top)         |
| `--color-accent-contrast`  | `#FFFFFF`         | `#FFFFFF`               | Label / check on an accent fill                         |
| `--color-focus-ring`       | = accent          | = accent                | Keyboard focus                                          |
| `--color-focus-halo`       | accent 15%        | accent 25%              | Soft ring around a focused boxed field                  |
| `--color-danger`           | `#C0392B`         | `#FF6B5E`               | Overdue dates, destructive menu items                   |
| `--color-danger-fill`      | `#C0392B`         | `#C4463A`               | Danger button (white on top)                            |
| success / warning / notice | see `tokens.css`  | see `tokens.css`        | Badges and inline notices, always with text             |
| `--color-highlight`        | `#FCE9A6`         | `#5A4A1F`               | Search match `<mark>` (also bold: never colour-only)    |
| `--color-selection`        | accent 18%        | accent 30%              | Text selection                                          |
| `--color-code-*`           | see `tokens.css`  | see `tokens.css`        | Code blocks (AA on `--color-code-bg`)                   |
| `--sticky-<name>-*`        | muted papers      | muted papers            | Sticky surfaces and space dots (7 colours)              |

### 2.2 Shadows, radii, borders

| Token                                 | Value                                                                |
| ------------------------------------- | -------------------------------------------------------------------- |
| `--shadow-sm`                         | `0 0 0 .5px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.08)`: raised seg. |
| `--shadow-md`                         | `0 0 0 .5px rgba(0,0,0,.12), 0 8px 24px rgba(0,0,0,.12)`: popovers   |
| `--shadow-lg`                         | `0 0 0 .5px rgba(0,0,0,.12), 0 16px 48px rgba(0,0,0,.16)`: dialogs   |
| `--shadow-drawer`                     | `-8px 0 24px rgba(0,0,0,.08)`: overlaying inspector                  |
| dark `--shadow-md` / `--shadow-lg`    | an inner 0.5px white hairline + a 0.5px black ring + a deeper shadow |
| `--radius-sm` / `-md` / `-lg` / `-xl` | 4 (checklist box, kbd, badge) / 6 / 8 / 10                           |
| `--radius-full`                       | task checkboxes, dots, swatches                                      |
| `--border-width`                      | 1px                                                                  |
| `--focus-ring-width` / offset         | 2px, 1px outside (`--focus-ring-inset` −2px inside rows and tabs)    |
| `--focus-ring-*-mark`                 | 2px ring, 2px offset for checkboxes and swatches                     |
| `--focus-halo-width`                  | 3px soft halo on boxed fields                                        |
| `--opacity-disabled`                  | 0.4                                                                  |

The floating layers have no border: the 0.5px ring inside the shadow is their edge.

### 2.3 Motion and layers

`--duration-fast` 120ms (hover, press, selection, checkbox), `--duration-normal` 140ms (menus,
toasts), `--duration-slow` 160ms (inspector, dialogs); `--ease-standard` and `--ease-enter` are
ease-out curves. All durations are 0 under `prefers-reduced-motion`. Quick Capture has no
open/close animation. Layers: sticky group labels 10, overlaying inspector 300, modal 400,
menus 500, toasts 600.

## 3. Type

**Stack:** `-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI Variable Text',
'Segoe UI', 'Inter Variable', system-ui, sans-serif`. Inter Variable (with its optical-size
axis) is imported in `tokens.css` and only reached on Linux. Mono (`--font-mono`) is for code
only: never for counts, kbd or status text. No uppercase or letter-spaced labels. All sizes are
`rem`, so the Text size preference (Small 93.75%, Default 100%, Large 112.5%) scales everything;
there is no `zoom` or `scale` in CSS.

| Role                     | Size / weight / line  | Token                                           |
| ------------------------ | --------------------- | ----------------------------------------------- |
| UI: rows, tabs, buttons  | 13 / 400              | `--font-size-ui`                                |
| Secondary: snippets, sm  | 12 / 400              | `--font-size-secondary`                         |
| Metadata, counts, labels | 11 / 400 (labels 600) | `--font-size-meta`, `--font-weight-section`     |
| Editor body              | 15 / 400 / 1.6        | `--font-size-editor`, `--line-height-relaxed`   |
| Inspector title          | 16 / 600              | `--font-size-heading`                           |
| Editor H3 / H4           | 17 / 600, 15 / 600    | `--font-size-xl`, `--font-size-lg`              |
| View title, editor H2    | 20 / 650 / 28px       | `--font-size-view-title`, `--font-weight-title` |
| Document title           | 26 / 700              | `--font-size-3xl`, `--font-weight-bold`         |

Letter spacing: `--letter-spacing-tight` −0.01em at ≥ 15px, `--letter-spacing-title` −0.02em at
≥ 20px. Weights: 400, 500, 600, 650, 700 (`font-synthesis-weight: none`).

## 4. Grid

```
|<- inset ->|<- 16 glyph ->|<- 10 ->|text …                         … |<- inset ->|
            16                      42                          right − 16
   (20 and 46 in windows ≥ 1100px)
```

- `--content-inset` 16px; 20px in windows ≥ 1100px (a `:root` media query, so the top bar and
  every pane, including the 300px split-view list, share it).
- `--glyph-column` 16px holds every leading glyph: the app mark, checkboxes, `+`, row icons,
  group icons. `--text-start` (inset + 26px) is where text starts.
- Right edges share the inset. Controls with no box at rest (icon buttons, the back link) hang
  their padding outside the grid so their **glyphs** sit on it (`--icon-button-hang` 6px;
  `data-icon-button` marks them); row fills hang `--row-fill-inset` 6px outside the content.
- Lists use the full canvas up to `--list-max-width` (880px), then stay left on the grid. The
  editor is a centred 680px column (`--editor-max-width`); Settings a centred 640px column.
- Vertical: the top bar is 44px (+1px hairline); the view header is 20px + a 28px line + 12px;
  single-line rows 32px; note rows 56px (title 16px line, snippet 15px, meta 13px, 6px padding).

## 5. Shell

### Top bar (`src/views/workspace/TopBar.tsx`)

- The top bar is the window's title bar. The workspace window has no system title bar: macOS
  keeps its native traffic lights overlaid on the bar; Linux and Windows draw their own window
  controls at the right end (`WindowChrome.tsx`), and Linux also draws resize edges.
- 44px on `--color-bg-soft` with one hairline under it; its empty middle is a Tauri drag
  region, never the controls.
- **Left:** the 16px app mark in the glyph column, then `Inbox  Notes  Tasks  Pinned` as 13px
  secondary text tabs, the first label on the text column. Hover: text ink on the hover fill.
  Active (`aria-current="page"`): text ink on a soft 6px pill (`--color-bg-active`). The Inbox
  count is an 11px tertiary number on the label's baseline (spoken as ", 3 unorganised").
- **Right:** the space pill (dot or layers glyph, name, chevron; open = selected fill), the
  220px search field (soft fill, 14px icon, "Search" in secondary, the `⌘K` / `Ctrl+K` hint in
  tertiary; it opens the palette), then New (menu: note, task, document), Trash and Settings as
  28px icon buttons (Trash and Settings show `aria-pressed` while open). The last glyph ends on
  the inset.
- **Narrow (< 800px):** the areas fold into one menu button named after the current area
  (`Go to: Tasks`), its label still on the text column; search becomes an icon button.

### Content region

`<main>` under the bar, full width, a size container named `content`. Views show their counts
in their own header.

## 6. Page skeleton (`src/components/app/Page.tsx`)

- **`ViewToolbar`** is the view header, not a second bar: the first line of the canvas, 20px
  above and 12px below, no fill, and a hairline only once the content scrolls under it
  (`scrolled`, from `useScrollContainer`). Props: `title` (20/650, `h1` by default), `count`
  (13px tertiary on the title's baseline), `note` (12px secondary context, hidden below
  560px), `filters` (a `Segmented variant="text" size="sm"`), `actions` (icon buttons 4px
  apart, or one soft Button), `leading` (a back link whose arrow sits on the inset). With
  `titleAs="span"` the title becomes a quiet 13px breadcrumb and the line spans the canvas:
  the line above an editor. Its width follows `--list-max-width`, so filters line up with the
  rows' right edge.
- **`PageView`** (a size container) → **`PageScroll`** → **`PageColumn`** (`content` 880px
  left, `editor` 680px centred, `narrow` 640px centred, `full`).
- **`PageSectionHeader`**: the one group label, 11px/600 sentence case, secondary, on the text
  column with an optional 16px glyph in the glyph column and a tertiary count, 16px above,
  sticky on the canvas. **`PageGroup`**: groups are separated by that space, not by lines.
  **`PageList`**: a `role="list"` without bullets.

## 7. Components (`src/components/ui`)

Shared by every window. Nothing new outside this list without a design review.

- **Button.** Rounded 6px, no border. `primary` the accent pill (one per surface: Save,
  Create); `secondary` (default) a soft fill; `ghost` text in secondary ink with the soft hover
  fill; `danger` the danger fill (confirm-delete only). `md` 28px / 13px / 0 12px (dialogs,
  forms, empty states); `sm` 24px / 12px / 0 8px (headers, rows). Icon 14px, 6px gap. Hover and
  pressed step the fill; toggled (`aria-pressed`) takes the selected fill; `loading` keeps the
  label, swaps the icon for a spinner and sets `aria-busy`.
- **IconButton.** 28px with a 16px icon (`md`), 24px with 14px (`sm`); rounded 6px; secondary
  ink; hover: text ink on the hover fill; pressed: the stronger fill; `pressed` prop: the
  selected fill; open menu: the hover fill. `variant="secondary"` rests on the soft fill. Name
  and tooltip are required, the tooltip appends the formatted shortcut.
- **Segmented.** Radiogroup (one tab stop; arrows move and select). `text`: soft-pill text tabs
  for view filters (Today · Upcoming · All · Completed): secondary labels, the selected one text
  ink on the soft selected pill. `contained`: a soft track (8px radius, 2px padding) whose
  selected segment rises onto `--color-bg-raised` with `--shadow-sm` (Settings, Quick Capture).
  `md` 28px / 13px, `sm` 24px / 12px.
- **Tabs.** `document`: quiet 13px text tabs under a document title, no strip fill, hairline or
  dividers; the selected tab is text ink with a 2px accent underline (rounded ends) under its
  label; hover turns the label text ink; the first label sits on the inset; rename (F2,
  double-click), reorder (Alt+←/→), overflow menu, `+`. `compact`: soft-pill text tabs.
- **Checkbox.** `task`: **round** 16px (`sm` 14px), a 1.5px tertiary ring; hover turns the ring
  secondary and previews the check; checked: the accent fill with a white check. `editorial`:
  a 4px rounded square, same sizes. Focus: a 2px ring 2px outside. Native input, ≥ 24px hit
  area.
- **ListRow.** Full-bleed box, content on the grid; the hover and selection fills are drawn by
  `::before`, rounded 6px and inset 6px from the column edges. Selected: `--color-bg-active`;
  while focus is in the list: `--color-bg-active-accent`; tertiary metadata turns secondary on
  either. Keyboard focus: a 2px inset ring on the fill's shape. Single line ≥ 32px; with
  snippet/meta: title 13/600, snippet 12 secondary, meta 11 tertiary (56px). Completed:
  secondary ink; free-form rows add a faint 1px strike. Actions appear on hover and focus.
- **Menu** (DropdownMenu, ContextMenu, submenus, DateQuickPicker). Elevated, radius 8,
  `--shadow-md`, 4px padding, 200px (240px with shortcuts). Items 26px, 0 8px, 13px, radius 4;
  icons 14px secondary; the highlighted item takes `--color-bg-hover-strong`; checked marks in
  the accent; shortcuts 12px tertiary text; group labels 11px/600 sentence case; separators
  inset 8px. Opens with a 140ms fade and a 2px slide. Context menus also open with Shift+F10
  or the Menu key.
- **Dialog / ConfirmDialog.** 360px (lg 480px), radius 10, `--shadow-lg`, no header bar; 20px
  padding: title 15/600, description 13px secondary, body, then actions right-aligned 8px
  apart with no hairline (Cancel secondary, then the accent pill or danger). The × is a 24px
  icon button 12px from the corner. Buttons are `md`. Scrim `--color-bg-overlay`.
- **Toast.** Bottom centre, 16px above the window edge; the menu surface (radius 8,
  `--shadow-md`); 13px text; the action is an accent ghost Button; the × a 24px icon button.
  8s by default, paused on hover and focus; one at a time (the newest replaces the previous).
  Errors lead with a danger icon and use `role="alert"`.
- **TextInput / TextArea.** Boxed (`default`, `mono`): rounded 6px, a 1px control border, 0 8px
  (TextArea 6px 8px); hover: the stronger border; focus: a 1px accent border and the 3px soft
  halo, no outline. `ghost`: caret-only, no box, no padding (rename, add rows, descriptions).
  `editor`: no chrome at the reading measure. `sm` 24 / 12px, `md` 28 / 13px, `lg` 32 / 13px.
  Labels 12px/500 secondary; descriptions 12px tertiary; errors 12px danger.
- **Kbd.** 11px/500 in the UI font, secondary ink on the soft fill, radius 4, no border.
  `inline`: one chip; `chip`: one cap per key, 2px apart. Plain text inside menus. Rendered per
  OS: macOS symbols in the order ⌃⌥⇧⌘ (`⌘⇧Space`); elsewhere words joined by `+`
  (`Ctrl+Shift+Space`).
- **EmptyState.** Centred in its region: a 28px thin (1.25) icon in tertiary, a 13/600 title in
  text ink, a 12px secondary line, one soft (secondary) Button 16px below. `compact` for tabs
  and the inspector.
- **SpaceDot.** An 8px round dot; never colour-only (a label, or `role="img"` with a name).
- **Badge.** 11px/500 on a soft fill, radius 4, 2px 6px; tones use their tint and ink.
- **SaveIndicator.** 11px tertiary text with no box ("Saving…", "✓ Saved"); errors in danger
  with a Retry text button.
- **Drawer** (the task inspector, 360px). The canvas surface with one hairline on the left;
  overlay mode adds `--shadow-drawer`; 20px padding; the header line aligns with the view
  header beside it (13/600 secondary title, 28px icon buttons, the last glyph on the padding).
- **Spinner.** A turning arc in `currentColor`, frozen under reduced motion.

Icons: one outline set (Lucide, ISC), 16px, `currentColor`; decorative icons are `aria-hidden`,
and an icon always sits next to text or has an accessible name.

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
- **Undo instead of confirmation** for anything restorable: Move to Trash, Mark organised (and
  Mark all), Convert to document, Delete subtask, Delete an empty tab, Remove from desktop. The
  toast offers Undo, and Mod+Z in the list also undoes.
- **Confirmation only for irreversible or multi-item actions:** Delete forever, Empty trash,
  Delete space, Delete a tab with content or a Tasks tab, a document with tasks → Trash, Move
  a document to another space. The title is a question naming the object, the button an
  explicit verb (danger for deletion), initial focus on Cancel, Esc cancels.
- **Platform limitation:** an inline notice in Settings and the related empty state, with the
  alternative. Never a modal, never a crash.

## 9. Layout and windows

Breakpoints live in [`src/lib/layout.ts`](../src/lib/layout.ts) (CSS container queries mirror
them, with a comment):

| Width         | Behaviour                                                                 |
| ------------- | ------------------------------------------------------------------------- |
| Window < 800  | The top bar folds the areas into a menu and search into an icon           |
| Window ≥ 1100 | The content inset grows from 16 to 20px                                   |
| Content ≥ 800 | Notes split view (300px list + editor) is available; below, list ↔ editor |
| Content ≥ 820 | The task inspector docks and the list narrows; below, it overlays         |
| Content < 560 | Compact paddings; the inspector and dialogs go full width                 |

Windows (sizes in CSS px, from `src-tauri/src/platform/window.rs`):

| Window                        | Size                                               | Chrome                                                                                  |
| ----------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Workspace (`main`)            | 1120 × 740, minimum 420 × 360                      | No system title bar; the top bar is the title bar (§5)                                  |
| Quick Capture (`capture`)     | 520 × 200, fixed                                   | Undecorated, always on top, hidden from the taskbar, centred horizontally at 1/3 height |
| Sticky (`sticky:<kind>:<id>`) | 300 × 260 by default, minimum 200 × 120, resizable | Undecorated with its own 24px drag strip, hidden from the taskbar; size is remembered   |

Remembered layout: area, space filter, Notes split view and sort, Tasks view, last active tab
per document. The task inspector's open state is never persisted.

## 10. Views

- **Notes.** Note rows (title, one-line snippet, meta: date · space dot); documents get a doc
  glyph; a Favourites group sits at the top ("Add to favourites" in a document's menu). Sort:
  Last edited (default), Created, Title. `⋯` › Show archived. Split view: ↑/↓ load the editor
  while focus stays in the list; Enter or → moves focus to the editor; Esc returns it.
- **Note editor.** One plain `<textarea>`, no toolbar. The title is the first non-empty line
  without leading Markdown markers, cut to 80 characters: **display only, the text is never
  rewritten.** Helpers (the only ones): Enter continues a list line and removes an empty
  marker; Tab / Shift+Tab indent only on list lines (elsewhere Tab moves focus); Mod+B / Mod+I
  wrap the selection in `**` / `_`. Mod+N opens an unsaved draft; the record is created on the
  first non-whitespace character and an empty draft is discarded silently. Autosave runs 400ms
  after the last keystroke and on blur, navigation, hide and quit. **Convert to document** is
  immediate: the full text moves unchanged into one Content tab named "Overview", with Undo.
  If another window saved first, the editor shows "Changed in another window" with Reload and
  Keep mine.
- **Tasks.** Views Today · Upcoming · **All** (default) · Completed. Overdue is a small danger
  section shown only when it has tasks (at most 5 rows, then "Show N more"). Rows: round
  checkbox, title, then 11px tertiary metadata inline (document, subtasks, due date, space dot
  under All); overdue dates are danger with an icon. **Completing a task never moves its row**
  until you leave the view, and shows no toast. Add task is the first row and inherits the
  visible context (space filter; Today → today; inside a document → linked to it). Manual order
  (drag or Alt+↑/↓) only applies where there is no date and in document Tasks tabs. Dates are
  all-day.
- **Task inspector.** A non-modal region labelled "Task details", docked or overlaying (§9);
  × or Esc closes it and focus returns to the row. Title (cannot be emptied), description,
  subtasks (one level; Enter adds the next, Backspace on an empty one deletes it with Undo,
  Alt+↑/↓ reorders), due date, space, document, tags. Completing all subtasks does not
  complete the parent.
- **Documents.** An explicit title, then document tabs (Content or Tasks). `+` adds a tab after
  the active one in inline rename. The last tab cannot be deleted; an empty Content tab is
  deleted with Undo, any other tab asks first (a Tasks tab's tasks stay in the document and in
  Tasks). Content tabs use the rich editor ([architecture](architecture.md#documents-and-the-editor)): Markdown input
  rules, code blocks, links (Ctrl/⌘+click opens them), no toolbar. `[ ]` creates an
  **editorial checklist** item that never appears in Tasks; a **real task** is created only
  explicitly (Mod+T, or Convert to task / Insert › Task in the menu) and renders the same
  record as in Tasks. Switching tabs flushes the save first.
- **Tasks tab.** A live view of the real tasks linked to the document, with per-tab Show and
  Sort settings; it can be pinned to the desktop.
- **Inbox.** Notes and tasks with no document that are not archived, completed or marked
  organised, newest first. Documents never appear. O (or the row button) marks an item
  organised; `⋯` › Mark all organised.
- **Pinned.** Everything pinned to the desktop, visible or hidden; state is written as text.
  Row actions: show / hide, keep on top, open, remove from desktop.
- **Search (Mod+K or `/`).** A modal palette over all spaces (it ignores the space filter):
  titles, content, tab names, descriptions and subtasks. Groups in a fixed order (Documents,
  Notes, Tasks), up to 5 per group, matches highlighted with `<mark>` and bold. Trash is not
  searched. ↑/↓ move, Enter opens (a task opens in Tasks with its inspector), Esc closes and
  restores focus.
- **Settings (Mod+,).** Tabs General · Shortcuts · Appearance · Data · Stickies; changes apply
  immediately. Shortcuts shows the global shortcut's real registration state as icon + text,
  a recorder that refuses reserved combinations (§14), and the `piw --quick-note` /
  `--quick-task` fallback commands. Data shows the database path, Export… and Back up…
  ([architecture](architecture.md#data-export-and-backup)).
- **Trash and Archive.** Trash holds notes, documents and tasks: Restore (R), Delete forever…,
  Empty trash…. No automatic purge. Archive applies to notes and documents only. Moving a
  document with tasks to Trash asks whether to keep the tasks (unlinked) or trash them too.

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
- **Saving:** Mod+Enter in both modes, Enter in the task title, or Save. The popup hides **only
  after the save is confirmed**; on error the text stays with Retry. Mod+Shift+P toggles "Pin
  to desktop after saving". The space is the last used one or the default space (Settings ›
  General).
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
- **Bodies:** a note (editable, autosaved), a task (title, description, subtasks) or a
  document's Tasks tab (its rows and Add task).
- **Four distinct actions:** _Pin to desktop_ creates the sticky; _Keep on top_ is optional;
  _Hide from desktop_ closes the window but keeps it in Pinned; _Remove from desktop_ unpins
  it. Closing through the window manager means Hide.
- **One sticky per item or view;** pinning again shows and focuses it. Position, size and
  on-top are saved per sticky and re-applied after every show; a sticky that would be off-screen
  moves onto a connected monitor.
- **Startup:** stickies come back only if "Reopen pinned stickies when Piw starts" is on (off by
  default, for privacy).
- **An item moved to Trash** closes its sticky; Undo reopens it.
- Each sticky is a separate webview: Piw warns above 8 open stickies.

## 13. Tray and lifecycle

- Tray menu: Quick Note, Quick Task, Open Workspace, Show/Hide Sticky Notes, Settings…, Quit
  Piw. On Linux the tray is menu-only.
- Closing the workspace hides it when "Keep running in the tray" is on (the default); capture,
  stickies and the shortcut keep working. The first time, a toast explains how to quit. Quit Piw
  (tray or Mod+Q) flushes pending saves, then exits.
- Single instance: launching Piw again shows the workspace; `--quick-note` / `--quick-task`
  open the capture popup in the running Piw; `--hidden` starts without showing the window.
- No notifications, reminders or badge counts.

## 14. Keyboard

Single-key shortcuts (letters, `/`, Space, Delete) work only when focus is not in a text field.
Every drag has a keyboard or menu alternative.

| Where          | Keys                                                                                                                                                                                                                                           |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Global (OS)    | Quick capture: `Ctrl+Shift+Space` / `⌘⇧Space`, configurable in Settings › Shortcuts                                                                                                                                                            |
| Workspace      | Mod+N new note · Mod+T new task · Mod+Shift+N new document · Mod+K or `/` search · Mod+1…4 Inbox, Notes, Tasks, Pinned · Mod+, Settings · Mod+[ or Alt+← back · Mod+Q quit                                                                     |
| Notes          | Mod+Shift+\\ split view · Mod+S save now · Mod+Shift+P pin the open note                                                                                                                                                                       |
| Lists          | ↑/↓ or j/k move · Home/End · Enter open · Space complete (tasks) · Delete (⌘⌫ on macOS) to Trash with Undo · Mod+Z undo · Alt+↑/↓ reorder (manual order, subtasks) · Shift+F10 or Menu key: row menu · O organised (Inbox) · R restore (Trash) |
| Task inspector | Mod+Shift+P pin or hide the task · Esc close                                                                                                                                                                                                   |
| Documents      | Ctrl+PgDn / Ctrl+PgUp next / previous tab · in the tab bar: ←/→ Home End, Alt+←/→ reorder, F2 or double-click rename · Mod+T turn the line into a task · Mod+B / Mod+I / Mod+E bold, italic, code · Mod+S save now                             |
| Quick Capture  | Mod+1 / Mod+2 Note / Task · Mod+Enter save (Enter in the task title) · Tab / Shift+Tab fields · Mod+Shift+P pin after saving · Esc close, keeping the draft                                                                                    |
| Sticky         | Mod+W hide · Mod+O open in Piw · Shift+F10 strip menu                                                                                                                                                                                          |

**Esc order:** Esc closes the innermost layer first: menu or date picker → inline rename or
shortcut recorder (cancel) → dialog or palette → inspector → editor (back to the list). **Esc
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
- Roles: areas use `aria-current="page"`; lists are `role="list"` with one primary focusable per
  row (the open button for notes, the native checkbox for tasks; metadata via
  `aria-describedby`); section headers are headings with their count in text; tabs are
  `tablist` / `tab` / `tabpanel`; dialogs trap focus and return it (`alertdialog` for
  confirmations); menus use menu roles with typeahead; the inspector is a labelled `region`;
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
  nouns (Inbox, Notes, Tasks, Pinned, Trash, Today, Upcoming, Completed).
- Buttons and menu items start with a verb and say exactly what happens ("Move to Trash",
  "Delete forever", "Retry"). Never "OK", "Yes" or "Submit".
- Plain, calm and short: no blame, no exclamation marks, no error codes ("Couldn't save").
- Objects are named in curly quotes (“Refactor 2FA”). "…" (one character) ends commands that
  open a dialog or picker, and placeholders.
- Shortcuts are rendered per OS from one neutral notation (`Mod+Shift+Space`); plurals are real
  plurals ("1 task", "2 tasks"); no text in images.

## 17. Rules every change must respect

1. **The top bar is the only shell.** No sidebar, status bar or second bar inside a view.
2. **Spaces are a global filter** that persists across areas. _All_ is a filter, not a space.
3. **The task inspector is non-modal and contextual.** It docks at content ≥ 820px and overlays
   below; its open state is never persisted.
4. **Note titles are display-only inferences.** Text is never rewritten. Documents have explicit
   titles.
5. **No empty records.** A note exists from its first non-whitespace character.
6. **Completing a task never moves the row** until the user leaves the view. No toast for it.
7. **Undo replaces confirmation** for anything restorable; confirmations are for irreversible or
   multi-item actions (§8).
8. **Capture** closes only after persistence is confirmed. Esc and blur keep a draft. Switching
   modes is lossless. No animation.
9. **Pin / Keep on top / Hide / Remove are four distinct actions.** Esc never hides a sticky.
   Stickies don't reopen at startup unless the user opted in.
10. **Documents never appear in Inbox.** Archive applies to notes and documents only. Trash has
    no automatic purge.
11. **Single-key shortcuts** only outside text fields. No Ctrl+Alt or Alt+letter app shortcuts.
12. **Colour never carries meaning alone.** Retest contrast whenever a token changes.

## 18. For view authors and reviewers

- Put the title, count, filters and actions in `ViewToolbar`; never draw a bar inside a view.
- Use `PageColumn` for lists so they stop at 880px; use `ListRow` (or its classes) for rows and
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
      voids; the top bar folds below 800px.
- [ ] Empty, loading, error and long-content cases.
- [ ] No mono outside code, no uppercase labels, no dashed borders, no square task checkboxes.
- [ ] Keyboard shortcuts, focus order and tests unchanged.
