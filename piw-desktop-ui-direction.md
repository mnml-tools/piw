# Piw — Desktop UI Direction v4 (React)

> Translated from the original European Portuguese on 2026-11-08 at the owner's request; content unchanged.

**Status:** redesign specification to hand over to Claude Code  
**Priority:** P0 — fix the interface's scale and density before continuing to add features  
**Visual reference authorised in this request:** screenshots of Piw and a screenshot of Zap provided by the user  
**Current stack confirmed by the owner:** Tauri 2 + Rust + React + TypeScript. Preserve React; do not migrate framework.

## 0. Main order

Carry out a **desktop-first** review and implementation, keeping all existing functionality. Piw should look like a compact, intentional and pleasant desktop productivity application, not a web application with giant elements nor a SaaS dashboard. Zap (`https://github.com/rafmst/zap`) is the reference for **density, composition, precision, alignment, proportions and utilitarian sophistication**, not a functional model to copy.

**Do not copy code, stylesheets, assets, components or specific visual expressions from Zap without explicit authorisation from the rights holders.** The repository publishes a specific licence with restrictions on AI cloning. The goal is to create an original implementation, inspired by the general qualities that the user identifies in the screenshots. Preserve Piw's current stack: **React + TypeScript on the frontend and Rust/Tauri on the desktop**. Start from the real existing code; avoid creating a new scaffold or a second frontend app.

## 1. Diagnosis before the redesign — CRITICAL PROBLEM

The screenshot of the Piw application running on the desktop shows **typography, icons, rows, sidebar and spacing much larger** than the Zap reference. Before touching colours or components, identify the real cause of the visual scale.

Inspect, in the development frontend and in the real Tauri desktop window:

- Computed CSS of `html`, `body`, `#app` and critical components: `font-size`, `line-height`, `zoom`, `transform`, `min-width`, `width`, `height`, `padding`, `gap`.
- The base unit of the styles (`rem`, `em`, `px`) and any `html { font-size: ... }` rule, including media queries and dynamic classes.
- WebView zoom, scaling settings and any changes applied by the frontend.
- `window.devicePixelRatio`, `window.innerWidth`, `window.outerWidth`, `visualViewport?.scale`, the window's CSS dimensions and the actual pixel dimensions of the screenshot.
- Operating-system scaling / HiDPI and WebView peculiarities on Linux, Windows and macOS; on Linux, check X11 and Wayland insofar as they are relevant.
- Effects of accessibility settings / enlarged font / browser fallback.
- Whether there is a difference between `vite dev` in the browser and `tauri dev` in the desktop window.

**Do not assume it is only CSS.** Produce a short diagnosis with verifiable observations: confirmed cause, probable cause and missing tests. Do not use `transform: scale(...)`, `zoom: 0.7` or global hacks to mask the problem. Fix it at the source.

## 2. Visual objective

- Elegant and **compact** desktop utility.
- Timeless, calm, professional and precise design.
- High information density **with comfortable reading**.
- Exemplary light mode, with an equally polished dark mode.
- Notes and tasks as **two views of the same product**, not two applications.
- Sidebar, editor, sticky notes and Quick Capture share tokens and components.
- No large cards for simple notes/tasks, no excessive padding and no dashboard UI.

**Principle:** minimalism means reducing noise, not making everything huge, nor leaving half the screen unused.

## 3. Design tokens — initial values to validate at 100% logical zoom

Compact density is a composition target, never a reason to compromise contrast, legibility or accessible interaction. Allow for a future `Comfortable` preference without creating a second visual language.

| Token / element | Initial target | Note |
|---|---:|---|
| UI base | 13 CSS px | Do not arbitrarily change the root without checking `rem` |
| Secondary text | 11–12 CSS px | Ensure legibility and contrast |
| Sidebar | 216–228 CSS px | Resizable; persist width |
| Navigation item | 32–36 CSS px | Compact and clickable |
| Task row | 36–40 CSS px | Expand only when there is additional content |
| Page title | 22–24 CSS px | No giant H1s |
| Note title in the list | 13 CSS px | Medium/semibold |
| Editor text | 14–15 CSS px | Separate from the UI scale |
| Icons | 14–16 CSS px | One consistent set |
| Toolbar controls | 28–32 CSS px | Compact; accessible targets where possible |
| Standard spacing | 4/8/12/16/24 CSS px | Purposeful gaps |
| Border radius | 4–7 CSS px | Avoid bulky pills |
| Reading area | max-width 680–760 CSS px | Editor, not lists |

Do not copy Zap's exact values; these measurements are approximate original targets that arise from the assessment of our own application. Use CSS variables/tokens instead of magic values scattered around.

### Light mode — direction

- Warm-white and very light grey surfaces, without aggressive contrasts.
- Sidebar gently distinguishable from the content area.
- Very fine borders, used sparingly, to separate zones.
- Well-contrasted near-black text, metadata in legible grey.
- A single discreet accent (soft blue, for example); avoid too many colours.
- Item selection in very subtle grey/blue.

### Dark mode — direction

- Neutral/anthracite greys, without universal absolute black.
- Subtle separation between sidebar and content.
- Off-white text and legible muted text.
- Defined hover/selected states, but without large blocks dominating the navigation.
- Work/Personal space colour only as a small indicator.

## 4. Main window structure

### Shell

- Title bar: prefer native behaviour where it is more robust. If there is a custom titlebar, integrate drag regions, native buttons and accessibility correctly.
- Single sidebar with: Search, Quick Capture/New, Inbox, Notes, Tasks, Pinned, Spaces, relevant Documents, discreet Trash/Settings.
- Moderate-width sidebar; elements aligned to a common grid.
- Main content: restrained header, editorial list, balanced distribution.
- **Two columns by default**: sidebar + content. A third column only for list/editor or contextual details, as an option.
- Do not centre narrow lists excessively: position and width should make use of the space without creating gratuitous empty areas.
- Hiding the sidebar must be possible, keeping shortcuts and navigation accessible.

### Inbox

- One inbox with quick notes and quick tasks; indicate the type discreetly.
- Quick add action integrated with the list, not a giant form title.
- Compact lists, timestamps on the same grid, previews when useful.
- Differentiate completed, selected, focus and hover without excessive outlining.

### Notes

- List with name, small preview, and discreet space and date.
- An advanced document appears in the same list, with a light symbol.
- Editor in a focus view; comfortable width for reading and writing.
- Minimalist internal tabs; only when the document uses them.
- Legible, well-spaced code blocks, Markdown and checklists.

### Tasks

- Rows of 36–40 px by default, aligned checkbox, title at 13 px.
- Secondary metadata on an optional line or in the details panel, never cluttered with chips.
- Inline editing, clear shortcuts and keyboard focus.
- A todo inside a document is synchronised with the global view by ID (no copies).
- Details in an optional contextual panel or focus screen, without a permanent third column.

### Quick Capture

- Compact, keyboard-focused popup, with a note/task flow without an administrative form.
- Discreet fields, immediate focus, save/cancel with clear shortcuts.
- Real popup dimensions suited to 100% CSS scale and HiDPI.

### Sticky Notes

- Small, independent windows, with typography close to that of the main app.
- Title, text, checkboxes and discreet actions; secondary controls on hover or in a menu, but discoverable via keyboard.
- Muted colours and coherent themes. No debug-window look.
- Preserve resizing, persistent position where allowed, always-on-top and synchronisation.
- Separately test the scaling, border and title bar on each operating system.

## 5. Mandatory visual tests

### Matrix

Record screenshots of the **real Tauri app**, in addition to the browser, at:

- 1280×800, 1440×900 and 1920×1080 (usable application area, if possible)
- 100% scale and at least one HiDPI scale (125/150% or 2x, depending on the platform)
- Light and Dark
- Inbox with realistic content, Notes, Tasks, Document tabs, Quick Capture and Sticky
- Sidebar open/collapsed; normal/small windows

**Attention:** do not compare text sizes from resized PNGs; compare `CSS px` at the same logical scale. The photograph/screenshots provided by the user are references for composition and density, not absolute measuring instruments.

### Verifiable results

- Piw text is not disproportionately enlarged in the real window.
- The sidebar takes up roughly the space the navigation requires.
- Content is well distributed; no section looks like an empty skeleton without intent.
- Notes, tasks and documents show a coherent visual hierarchy.
- Tabbing, keyboard, system zoom, screen readers and focus-visible remain usable.
- The look does not depend on a specific browser, a fixed DPI or the developer's resolution.

## 6. Mandatory implementation workflow

**Phase 0 — Safe baseline**

1. Identify the state of the repository and create a working commit/branch safely, without deleting the user's changes.
2. Take an initial screenshot of the real Tauri app and collect computed measurements.
3. Compare density in CSS px; document the cause of the scaling.

**Phase 1 — Fix the scale first**

1. Fix zoom, typographic base or layout at the source of the problem.
2. Adjust sidebar and row measurements using tokens.
3. Run the app and show a real screenshot of Inbox and Notes.
4. Do not proceed if the app still looks magnified.

**Phase 2 — Establish a compact design system**

1. Typography, spacing, colour and state tokens.
2. Reusable sidebar, row, icon button, checkbox, toolbar and tabs components.
3. Light and Dark; focus, hover, selected, disabled and reduced motion.

**Phase 3 — Apply to the screens**

1. Sidebar and Inbox.
2. Notes and Editor/Document tabs.
3. Tasks and contextual detail.
4. Quick Capture and Sticky Notes.

**Phase 4 — QA and regression**

1. `typecheck`, lint/format, available frontend and Rust tests.
2. Tauri build on the current platform; do not invent results for unavailable platforms.
3. Comparable screenshots and a concise report of what changed.
4. Validate creation/editing/deletion, task sync, pin, shortcuts, theme, persistence.

Subagents may separately handle desktop/DPI diagnosis, the design system, product views and tests; the main agent is responsible for a single coherent visual direction and conflict-free integration.

## 7. Constraints and definition of done

**Forbidden:** migrating or rewriting the existing React stack without justification; changing the database and business logic without need; replacing problematic CSS with `scale()` or arbitrary zoom; directly copying Zap assets/code; masking problems with a browser screenshot when the desktop window fails; declaring cross-platform validation without carrying it out.

**Approved when:**

- The real Tauri window now has desktop-scale typography and controls.
- A screenshot of Piw at an equivalent logical scale shows density and precision comparable to the visual intent of the Zap screenshot (without imitating the Zap product).
- Light/Dark look like two finished, consistent themes.
- Notes and Tasks are visually cohesive, while preserving behavioural differences.
- No functionality has been lost.
- Real before/after captures and test results exist.

**Final deliverables:** cause of the scaling, changes made, files changed, real native screenshots, matrix of tests run/pending, known risks. Do not ask for approval of trivial changes, but do not hide significant technical tradeoffs.


## 8. React implementation note (mandatory)

- First inspect `package.json`, the Vite configuration, the `src/` tree, routes, providers, hooks and real components, before choosing libraries or creating new components.
- Keep the existing React components when they can be fixed and reused; prefer incremental refactoring to rewriting.
- Use CSS variables/design tokens for theme, density and scale, with a layout responsive to the real size of the Tauri window.
- Analyse global styles, fonts, root `font-size`, UI kit styles, resets and theme providers; check any third-party style that alters `rem` or default sizes.
- Avoid adding another component library if the existing base meets the requirements consistently.
- For component tests, use the React stack already present (for example, React Testing Library + Vitest, if applicable), without forcing unnecessary replacements.
- The Zap repository is a **UX/density reference**; even though both projects use React, do not reuse protected assets, code or styles without the rights holders' authorisation.
