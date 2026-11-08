# UI DESIGN BRIEF — Minimal Notes & Tasks

> Translated from the original European Portuguese on 2026-11-08 at the owner's request; content unchanged.

> Mandatory companion to `plan.md` | v1.0 — 06/11/2026
>
> **Scope:** visual identity, interface experience, visual quality criteria and review process.
> **Does not replace:** architecture, data model, functional scope or cross-platform criteria of `plan.md`.

## 1. Diagnosis and objective

`plan.md` correctly defines UX and structure, but the visual direction is insufficiently specific. «Minimalist» does **not** mean a generic or empty look, a lack of hierarchy, or an administrative-form interface.

**Objective:** build a desktop app that feels like a carefully crafted, calm, mature and functional product; with typographic excellence similar to that of writing apps and task legibility similar to that of focused task managers. Without copying brands, proprietary layouts, icons or third-party assets.

**Do not start a blind redesign:** first inspect the existing UI, identify the concrete problems and preserve any valid work. Do not rewrite the Rust/Tauri core or change behaviour to dress up an interface.

## 2. References and principles

- **Bear:** editorial editor, focus on reading/writing, typography, discreet hierarchy and hidden secondary controls.
- **Things 3:** tasks as highly legible rows, clear states, simple groups and good handling of empty spaces.
- **NotePlan:** natural connection between writing, documents and tasks, not the dashboard look.

References for study, not for cloning: https://bear.app/ , https://culturedcode.com/things/ , https://noteplan.co/ .

**Non-negotiable principles:**
1. Notes and Tasks look like sections of the same application, with the **same sidebar, tokens, typography, components and interaction**.
2. Content is the protagonist; the navigation UI stays quiet.
3. Reduce visual noise without removing useful information: every important action must remain discoverable.
4. Use separators and borders subtly; do not turn everything into cards.
5. Views have appropriate density: Notes comfortable for reading; Tasks compact without feeling cramped.
6. **Two columns by default**, a third only as an optional split view in Notes; Tasks keeps a central list, with contextual details.
7. Document tabs **inside the document**, not as a heavy second navbar.
8. Dark and Light equally well thought out, not a mere colour inversion.
9. Desktop-native in behaviour; consistency across Linux, Windows, macOS without falsely simulating operating-system chrome.
10. Animation only when it explains transitions; respect `prefers-reduced-motion`.

## 3. Visual direction: «Quiet Editorial»

Keywords: **refined, legible, welcoming, quiet, precise, fast, discreet**.

**Avoid**: SaaS/dashboard look; overly crowded sidebar; decorative gradients, heavy glassmorphism, neons, pronounced shadows; pills and badges on every row; giant buttons; icons in dozens of styles; borders on every element; too many colours; different appearances between Notes and Tasks; marketing cards; coloured rectangles for each section.

### Initial palette (proposal; validate through screenshots and contrast)

Light:
- Window background: `#FAFAF8`
- Surface/sidebar: `#F4F4F1`
- Content/editor: `#FFFFFF` or `#FAFAF8`, depending on legibility
- Primary text: `#202322`
- Secondary text: `#686F70`
- Subtle border/divider: `#E6E8E5`
- Hover/selected nav: `#E9EBE9`
- Single accent: `#476B86` (greyish blue)

Dark:
- Window background: `#171A1D`
- Sidebar: `#1D2124`
- Content/editor: `#171A1D` or `#1A1E21`
- Primary text: `#EDEFEF`
- Secondary text: `#A2AAAE`
- Subtle border/divider: `#30363A`
- Hover/selected nav: `#2B3236`
- Single accent: `#8AAFC5`

All colours are *semantic tokens*, never values scattered across components. Validate WCAG AA contrast for essential text and interactive states; adjust the proposal if necessary. Colour must not be the only signal of selection/completion.

### Typography

- Use a **system font stack** by default: `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` for UI; ensure a good experience on Linux.
- Editor: reading typography with generous line-height; test the UI font stack and an optional serif without introducing mandatory dependencies.
- Normal UI text: around `13–14px`; list titles `25–30px` with controlled weight; tasks `14–15px`; document text `16–17px`, line-height `1.55–1.7`.
- Maximum of two typeface families and three common weight levels. Avoid exaggerated titles, unnecessary caps and artificial typography.

### Initial measurements — not dogma

- Main sidebar: `216–240px`, collapsible.
- Central reading/editor area: comfortable width of `680–800px`, centred within the available space.
- Task row: minimum height `40–44px`, without individual cards.
- Base spacing: `4/8/12/16/24/32` scale.
- Radius: `6–10px` on controls; use very soft borders and shadows.
- Toolbar: compact, with low-frequency actions in context menus.
- Quick Capture: short window about `480–560px` wide, immediate focus on the input.

## 4. Reference screens — visual contract

### 4.1 Workspace / Notes

- Single sidebar with Notes, Tasks, Pinned, Search and Spaces; discreet grouping and rigorous alignment of icons/text.
- The notes list shows title, content excerpt, discreet date and an indicator only when it is a document.
- When a note is opened, **the editor takes the focus**, with generous space around the text.
- Optional split view: sidebar + list + editor; it must be perfectly possible to hide it.
- No large cards for simple notes. Useful, quiet empty states.

### 4.2 Workspace / Tasks

- The **same sidebar** and the same header; central area with the task list and simple sections.
- Soft checkbox, accessible size; legible title; metadata (date/document/space) in the background.
- Immediate completion, discreet micro-feedback and Undo. Task detail opens a contextual panel/overlay; it does not change the whole visual language.
- Show Today/Upcoming/Completed as filters/views, without them looking like three new applications.

### 4.3 Document

- Distraction-free writing look, with a clear title and a discreet line for metadata.
- Discreet internal tabs, preferably an underline/light selection instead of large pills, with horizontal scroll when necessary.
- `Content tab` with Markdown/rich-text and legible code; `Tasks tab` uses **the same row design as the Todo App**.
- Use `Refactor 2FA` as an example: Overview, Implementation, To-dos, References.
- If a document groups content, show the relationships without creating a mandatory folder tree.

### 4.4 Quick Capture

- A small, compact, instant overlay, without an office-style form.
- First input given priority; simple Note/Task toggle; discreet space; `Ctrl/Cmd+Enter` to save; `Esc` to close.
- No additional dialogs, no cluttered bars. Show the error state without losing content.

### 4.5 Sticky notes

- Independent windows with a clean appearance and optional very soft tints; never fluorescent post-its by default.
- Dominant editing area; discreet drag handle, discoverable pin/always-on-top/close.
- When a task or list is pinned, checkboxes must be identical to those in the Workspace and stay in sync.

### 4.6 Cross-cutting states

For each screen, design: **default, hover, focused keyboard, selected, empty, loading, error, long content, narrow window, dark mode**. All interactive controls must have complete visual states, not just the default state.

## 5. Design system and components

Create shared tokens and components: `AppShell`, `Sidebar`, `SidebarItem`, `ContentHeader`, `NoteListRow`, `TaskRow`, `Checkbox`, `DocumentTabs`, `EditorSurface`, `QuickCapture`, `StickyWindow`, `SearchDialog`, `EmptyState`, `ContextMenu`, `Tooltip`, `IconButton`, `Dialog`.

- Centralise CSS tokens in a dedicated file; do not create ad-hoc styles for each view.
- Consistent icons, same stroke weight and baseline; discreet completion animation.
- Visual separation first through alignment and space, then through lines; backgrounds only when they add meaning.
- Complete keyboard interactions, visible focus and appropriate click targets.
- Support interface scaling and system fonts, zoom and window resizing.
- Avoid dependencies on UI kits that impose a generic, heavy aesthetic.

## 6. Mandatory workflow for Claude Code and subagents

### Gate A — Audit (do not change the layout yet)

1. Read `plan.md` and this brief in full.
2. Inspect the current code and screenshots. Describe **5–10 concrete problems**, with severity and location: hierarchy, density, colours, alignment, typography, consistency, states.
3. Identify the existing design system and its inconsistencies; preserve the technical core and the valid flows.
4. Gather 2–3 visual references from notes and task apps, documenting **principles**, not copying pixel for pixel.

### Gate B — Visual proposal before mass implementation

1. Prepare **two visual alternatives** for the same app (`Quiet Editorial — Light` and `Quiet Editorial — Dark`, not two distinct products).
2. Show mockups/screenhots of: Notes, Tasks, Document (tabs), Quick Capture, Sticky Note.
3. Present tokens, typography and spacing; explain how Notes and Tasks share exactly the same components.
4. **Ask the owner to approve the visual direction** before extensive frontend refactoring. Until that approval exists, limit changes to trivial, reversible adjustments.

### Gate C — Incremental implementation

1. First `AppShell` + sidebar + tokens.
2. Then Notes and Tasks with shared components.
3. Then editor/docs/tabs, Quick Capture and Sticky, without changing core contracts.
4. Test after each increment, without treating mockups as complete functionality.
5. Document regressions and operating-system-specific differences.

### Gate D — Visual QA and acceptance

- Real captures in **Light and Dark**: Notes, Tasks, Document, Quick Capture, Sticky.
- Test at minimum the widths `1280px` and `1920px`, a narrow window, different DPI/zoom levels and content overflow.
- On macOS/Windows/Linux: check differences in font styles, scrollbar, focus and chrome; do not declare something tested if the platform is unavailable.
- Criteria: accessible contrast; consistent alignment; main actions identifiable in under 3 seconds; zero unexpected horizontal scroll; no label clipping; long texts do not break the layout; common Notes/Tasks sidebar; evident keyboard focus; empty and error states designed.
- Take before/after screenshots and request human feedback; **do not declare the design «perfect» on the model's own judgement**.

## 7. What NOT to change

- Stack: Tauri 2, Rust, Svelte, TypeScript, SQLite.
- Local-first and without requiring an account.
- Single entities: tasks inside docs and global views **are not duplications**.
- Quick Notes and Quick Tasks are the dominant use.
- Documents are advanced and optional; free tabs and synchronised task tabs.
- Real sticky notes on the desktop, a global shortcut with a documented fallback and honest cross-platform compatibility.
- Two columns by default and an optional split view.

## 8. Review request to the Tech Lead

The aesthetics cannot be solved with «add more shadows and cards». The real mission is to **remove the generic look** through typographic hierarchy, contrast, density, space and consistency. Implement with judgement and validate with real images. If the current version looks like a prototype, acknowledge that clearly and treat UI polish as a standalone project milestone.
