/**
 * Layout breakpoints from docs/ui-design-system.md §9, in CSS pixels. The only place these numbers
 * live; CSS container queries that mirror them say so in a comment.
 */
export const layout = {
  /** Window narrower than this: the top bar folds the areas into a menu and search into an icon. */
  narrowWindow: 800,
  /** Window at least this wide: the content inset grows from 16 to 20px (tokens.css). */
  wideWindow: 1100,
  /** Content at least this wide: Notes split view is available. */
  splitViewMinContent: 800,
  /** Content at least this wide: the task drawer docks; below it overlays. */
  drawerDockMinContent: 820,
  /** Content narrower than this: compact paddings, full-width drawer and dialogs. */
  compactMaxContent: 560,
} as const;
