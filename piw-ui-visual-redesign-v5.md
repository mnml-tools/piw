# PIW — UI Visual Redesign v5

> Translated from the original European Portuguese on 2026-11-08 at the owner's request; content unchanged.

**Mission:** turn Piw, already technically functional and with its scale corrected, into a genuinely refined, original and visually cohesive desktop tool.  
**Priority:** P0 — design system and style, not another round of scale/zoom.  
**Stack to preserve:** Tauri 2 + Rust + React + TypeScript + SQLite.  
**References to observe:** screenshots of Zap and of Piw supplied by the owner. The Zap reference serves to gauge the general qualities of a desktop UI: density, finish, surfaces, alignment and hierarchy. **Do not copy Zap's code, CSS, files, icons, assets or proprietary identity.** The repository publishes a licence with specific restrictions on AI cloning; the goal is an *original* implementation for Piw.

## 0. What has changed and what is still wrong

The previous diagnosis about excessive scale has been partially resolved. **Do not go back to correcting the global scale by trial and error.** The current Piw screenshot still shows a dark web-app look: large masses of anthracite, a sidebar with excessive presence, typography without personality, generic-looking controls and a lack of composition/editorial quality. An empty `Pinned` view mainly shows the shortcomings of the *empty states*; it is not enough to validate the design of the lists.

**Definition of success:** open Piw, in Light Mode, and immediately perceive that it is a deliberately designed desktop application: discreet, compact, precise and pleasant — without copying it from another application.

## 1. Non-negotiable visual direction

**Desktop utility + editorial notes.** Avoid dashboards, giant cards, gradients, glass, heavy shadows, pill-shaped buttons by default, excessively large titles and decorative icons.

- **Light Mode FIRST:** implement it first and approve it visually before applying the same system to Dark Mode. Light Mode is not a fallback mode: it is the presentation reference.
- **Compact interface, readable content:** the density of the menu/toolbar must not force the editor to have microscopic text.
- **One visual grammar:** Sidebar, Inbox, Notes, Tasks, Documents, Quick Capture and Sticky Notes inherit the same tokens, interaction styles and iconography.
- **Separation by line and space, not by cards:** favour 1 CSS px outlines, nearly flat surfaces and minimal elevation.
- **Visual determinism:** no CSS scattered around with arbitrary per-component values.

## 2. Piw's own tokens — initial proposal to be refined

Values **proposed for Piw**, not values extracted from Zap's code. Adjust using the screenshot and real legibility in the Tauri window, at 100% logical zoom, as the criteria.

### Light Theme (primary)

| Token | Value | Usage |
|---|---|---|
| `--ui-window` | `#F7F7F4` | shell / titlebar |
| `--ui-sidebar` | `#F8F8F5` | sidebar, slightly warm |
| `--ui-content` | `#FFFFFF` | main content and editor |
| `--ui-panel` | `#FCFCFA` | secondary panels |
| `--ui-border` | `#E3E3DE` | 1px dividing lines |
| `--ui-border-strong` | `#D0D4D3` | focused fields and occasional boundaries |
| `--ui-text` | `#282C30` | main text |
| `--ui-text-secondary` | `#636A70` | labels and descriptions |
| `--ui-text-muted` | `#747B80` | metadata, with verified contrast |
| `--ui-hover` | `#ECEFEF` | soft hover |
| `--ui-selected` | `#E4F0F5` | list selection without a dark card |
| `--ui-accent` | `#376F94` | actions/focus, very restrained |
| `--ui-success` | `#4B8B74` | completed task |

### Dark Theme (equivalent)

| Token | Value |
|---|---|
| `--ui-window` | `#202225` |
| `--ui-sidebar` | `#222529` |
| `--ui-content` | `#1B1E21` |
| `--ui-panel` | `#25282C` |
| `--ui-border` | `#35393E` |
| `--ui-border-strong` | `#555B62` |
| `--ui-text` | `#E8EAEB` |
| `--ui-text-secondary` | `#B0B7BB` |
| `--ui-text-muted` | `#9BA3A8` |
| `--ui-hover` | `#2E3439` |
| `--ui-selected` | `#30444F` |
| `--ui-accent` | `#8EB8D5` |
| `--ui-success` | `#8BC1A8` |

`Work`/`Personal` colours are small chromatic markers, not backgrounds for entire blocks. Ensure contrast and perceptible focus states.

## 3. Typography: define it before redesigning screens

Use a native interface font or Inter, subject to real tests on Linux, Windows and macOS. Do not use a heavy font in every menu. Mono font only for code or specific data. Do not depend on remote font loading.

| Element | Initial target |
|---|---|
| App UI base | 13px, weight 400, line-height 1.35 |
| Sidebar | 12.5–13px, weight 400/500 |
| Toolbar/tab | 12px |
| Section labels | 10px, medium, subtle letter-spacing |
| Metadata | 11px–12px |
| View title | 20–22px, weight 600 (not 32px) |
| Note/task in the list | 13px, weight 400/500 |
| Document editor | 15–16px, line-height 1.6 |
| Document title | 26px, weight 600 |

Apply kerning and rendering appropriate to the platform. Do not reduce all fonts below 12px just to simulate density. Accessibility: support a future increase in density/type size without breaking the UI.

## 4. Desktop dimensions and layout

| Element | Initial target |
|---|---|
| Sidebar | 216–232 CSS px, resizable |
| Title bar / top toolbar | 32–38px |
| Secondary action bar | 32–36px |
| Sidebar navigation entry | 29–32px |
| Icons | 14–16px, `strokeWidth` ~1.6–1.8 |
| Icon button | 28–30px, accessible hit area |
| Standard button / input | 28–32px high |
| Simple task row | 36–40px |
| Note row with preview | 50–58px |
| Document tabs | 30–34px |
| Corner radius | 4–6px by default |
| Spacing | 4/8/12/16/24px scale |
| Initial content margin | 24–32px (not 60–80px) |

When the window is wide, **do not increase the typography to fill the screen**. The list may have an appropriate maximum width, with an optional third contextual panel; edit text in a comfortable column. Empty space should result from a clear hierarchy and be useful, not from a lack of layout.

## 5. Icons and buttons

- Choose **a single icon family** that is well maintained and lawfully reusable, for example `lucide-react`; use consistent `size` and `strokeWidth`. Do not mix families or emojis.
- Use icons only for recognisable actions. If there is enough text, do not add a decorative icon.
- Compact buttons 28–32px high, with a 1px border and 4–5px corners when the action calls for it; smaller actions can be *ghost*.
- Toolbar with clear groupings, subtle dividers and tooltips/keyboard shortcuts where useful.
- Disabled, hover, selected, focus-visible, pressed and loading have specific styles. Avoid `selected` looking like a giant button.
- On Linux, Windows and macOS, respect the window chrome's controls and behaviour; do not create a fake titlebar without a functional reason.

## 6. Components to build/review

Create and document reusable React components, without introducing an entire UI library just for convenience:

`AppShell`, `Sidebar`, `NavItem`, `SectionHeader`, `IconButton`, `Button`, `SearchField`, `Toolbar`, `Tabs`, `ListRow`, `NoteRow`, `TaskRow`, `Checkbox`, `ContextMenu`, `EmptyState`, `StatusBar`, `StickyWindowChrome`.

Each component must have size, state and theme variants. Shared CSS Variables; avoid repeated inline styles and local hardcoded values.

### Sidebar

- A single vertical alignment for icons and text.
- `Inbox / Notes / Tasks / Pinned` as simple rows, without bulky cards.
- `Spaces` with discreet dots, collapsible; small but legible labels.
- Search as a compact field/action, not a hero input.
- Clear but not heavy separation between top, navigation and footer.

### Notes / Inbox

- Clean toolbar, with a small view title and discreet actions; list without repeated cards.
- Name, preview and metadata in a consistent grid; only the information needed at first reading.
- Emphasise selection and focus without shadows or elevated surfaces.

### Tasks

- Elegant checkbox, aligned with the title on the baseline, task on a single row; details on expansion.
- Desktop list density, not mobile cards.
- Tasks from documents remain synchronised; do not touch the domain.

### Documents

- Editorial header, thin tabs under the title or toolbar, editor max 720px, body 15–16px.
- Syntax/code blocks/links/checklists should be pleasant without looking like an IDE.

### Quick Capture

- Small, well-finished window, compact fields, clear action hierarchy.
- Easy to use with the keyboard, keeping the global shortcuts already implemented.

### Sticky Notes

- Micro-windows with warm/moderate colours and discreet chrome, controls on hover/focus.
- Do not make a sticky that looks like a debugging window, nor overdo the shadows.
- Preserve drag/resize/pin/always-on-top and persistence.

### Empty states (problem visible in the `Pinned` screenshot)

- Do not leave an icon and two lines lost in the top-left corner of a gigantic area.
- Place the message and contextual action in a visually intentional region (for example, the centre of the canvas or the central zone of the reading column).
- Discreet 20–24px icon, 13–14px title, brief description and a compact CTA for a useful action where applicable.
- The empty state should explain the next gesture; no huge illustrations by default.

## 7. Order of execution (do not skip)

1. Create a **Git checkpoint** to preserve the working version. Do not delete the development SQLite or the user's real data.
2. **Take an inventory of the current CSS and React components**. Confirm that scale and native zoom are fixed and do not touch those factors without new evidence.
3. Implement the **Light Theme first**: tokens, typography, icons, fields, buttons and dividing lines. Build a small local *component gallery* or use an existing Storybook only if useful; do not install heavy tools without reason.
4. Redesign **Sidebar + Notes + Tasks** in the same design system and only then Documents.
5. Redesign **Quick Capture and Sticky Notes** with the same tokens.
6. Implement and review the **Dark Theme** with equivalent contrast and density.
7. Run **Visual QA in the real Tauri window**, not using only a browser preview. Do not promise tests on platforms that were not run.
8. Fix visual divergences, regressions and interaction problems before declaring the work finished.

## 8. How to validate visually

The screenshot of an empty view (Pinned) is insufficient. Prepare **non-destructive** demo fixtures with at least:

- 10 notes, with short and long texts;
- 12 tasks, with completed and pending states, metadata, priorities and subtasks where supported;
- 1 `Refactor 2FA` document, with Overview/Docs/To-dos;
- 2 sticky notes, one for a note and the other for tasks;
- 1 quick capture open.

Capture screenshots of the **native** application in both themes, at the same window size (e.g. 1100×750 CSS px), checking 100% logical zoom. Use fake data, without altering the user's real content. Compare old Piw vs new Piw, and compare the **general qualities** of density/alignment/composition with the supplied Zap screenshot.

### Verifiable criteria

- Sidebar mostly in rows, without heavy panels.
- Coherent visual identity across all screens.
- Interface typography ~13px; more comfortable editor.
- Compact top control with consistent buttons.
- Lines, borders and selection states clearly standardised.
- Light Mode genuinely designed, not the inverse of Dark Mode.
- Notes, Tasks, Documents, Quick Capture and Sticky Notes are assessed with realistic data.
- `npm run build`, frontend lint/tests and available Rust/Tauri tests run and documented.
- No loss of behaviour or data: shortcuts, CRUD, persistence, pinning, synchronisation and menus validated.
- If the agent cannot obtain real screenshots, report the limitation and **do not mark Visual QA as complete**.

## 9. Expected delivery from Claude Code

- Real implementation in the existing frontend (React), without replacing the stack.
- `docs/ui-design-system.md` with tokens, component inventory and design decisions.
- **Real** screenshots of Notes, Tasks, Documents, Quick Capture, Sticky Notes, and an Empty State in Light/Dark.
- A short summary of **what changed visually**, not just a list of CSS classes.
- List of tests actually run, regressions and known limitations.

**Ban on shortcuts:** do not call the work a "complete redesign" if only the background, the zoom or the `font-size` was changed. This phase must change Piw's visual identity and finish, while preserving the original product.
