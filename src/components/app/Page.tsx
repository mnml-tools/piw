import type { ComponentPropsWithRef, ReactNode } from 'react';
import styles from './Page.module.css';

function classes(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(' ');
}

interface ViewToolbarProps {
  /** Back link or other leading controls, before the title. */
  leading?: ReactNode;
  /** The view title. A heading (`h1`/`h2`) reads as the 20px/650 view title; `span` is quiet. */
  title?: ReactNode;
  /** Id of the title heading (for `aria-labelledby`). */
  titleId?: string;
  /**
   * Heading level of `title` (default 1). `span` renders it as plain text in the 13px secondary
   * style: the line above an editor, whose document carries the real title.
   */
  titleAs?: 'h1' | 'h2' | 'span';
  /** The quiet count after the title ("9 open", "12 notes"): 13px tertiary. */
  count?: ReactNode;
  /** Context after the title or count ("Archived"): 12px secondary; hidden below 560px. */
  note?: ReactNode;
  /** View filters (a text `Segmented` sm), right-aligned before the actions. */
  filters?: ReactNode;
  /** Actions on the right: IconButtons (or one soft Button), 4px apart. */
  actions?: ReactNode;
  /**
   * True once the view's scroll container has scrolled (`useScrollContainer`): a hairline appears
   * under the header, where the content scrolls under it.
   */
  scrolled?: boolean;
  className?: string;
}

/**
 * The view header (docs/ui-design-system.md, "View header"): not a second bar but the first line
 * of the canvas. The title (20px/650) and a quiet count on the left, filters and actions on the
 * right; 20px above, 12px below, no fill and no hairline until the content scrolls under it. The
 * title starts on the content inset and the last action ends on it. Its width follows the list
 * column (`--list-max-width`), so the filters line up with the rows' right edge.
 */
export function ViewToolbar({
  leading,
  title,
  titleId,
  titleAs = 'h1',
  count,
  note,
  filters,
  actions,
  scrolled,
  className,
}: ViewToolbarProps) {
  const Title = titleAs;
  const hasTitle = title != null || count != null || note != null;
  return (
    <div
      className={classes(styles.toolbar, className)}
      data-quiet={titleAs === 'span' ? '' : undefined}
      data-scrolled={scrolled ? '' : undefined}
    >
      <div className={styles.toolbarInner}>
        <div className={styles.toolbarLeading}>
          {leading && <div className={styles.toolbarBack}>{leading}</div>}
          {hasTitle && (
            <div className={styles.heading}>
              {title != null && (
                <Title id={titleId} className={styles.title}>
                  {title}
                </Title>
              )}
              {count != null && <span className={styles.count}>{count}</span>}
              {note != null && <span className={styles.note}>{note}</span>}
            </div>
          )}
        </div>
        {filters && <div className={styles.toolbarFilters}>{filters}</div>}
        {actions && <div className={styles.toolbarActions}>{actions}</div>}
      </div>
    </div>
  );
}

/**
 * A workspace view: the header on top and one scroll container below it. It is a size
 * container, so the compact paddings follow the view's width (a 300px split-view list is
 * compact even in a wide window).
 */
export function PageView({ className, children, ...rest }: ComponentPropsWithRef<'section'>) {
  return (
    <section className={classes(styles.view, className)} {...rest}>
      {children}
    </section>
  );
}

/**
 * The view's scroll container (below the header). A flex column, so an EmptyState inside the
 * column centres itself in the remaining height.
 */
export function PageScroll({ className, children, ...rest }: ComponentPropsWithRef<'div'>) {
  return (
    <div className={classes(styles.scroll, className)} {...rest}>
      {children}
    </div>
  );
}

interface PageColumnProps {
  children: ReactNode;
  /**
   * `content` (default) for lists: the full canvas up to `--list-max-width` (880px), then
   * left-aligned on the grid. `editor`: the centred 680px reading column. `narrow`: the centred
   * 640px column of forms such as Settings. `full`: no limit.
   */
  width?: 'content' | 'editor' | 'narrow' | 'full';
  className?: string;
}

/**
 * The content column. Rows are full-bleed inside it: their glyphs sit on the content inset and
 * their text on `--text-start`, like everything else in the view. It grows to the scroll
 * container's height so empty states can centre in it.
 */
export function PageColumn({ children, width = 'content', className }: PageColumnProps) {
  return (
    <div
      className={classes(styles.column, className)}
      data-width={width === 'content' ? undefined : width}
    >
      {children}
    </div>
  );
}

interface PageSectionHeaderProps {
  title: string;
  /** Decorative 16px glyph in the rows' glyph column (the label stays on the text column). */
  icon?: ReactNode;
  /** Shown after the title in tertiary text ("Overdue 2"). */
  count?: number;
  /** Spoken form of the count ("2 items"); default: the number. */
  countLabel?: string;
  id?: string;
}

/**
 * A group heading inside a list (Pinned "On the desktop 3"): the one section style, an
 * 11px/600 sentence-case secondary label on the rows' text column with a tertiary count, 16px
 * above the group, sticky on the canvas.
 */
export function PageSectionHeader({ title, icon, count, countLabel, id }: PageSectionHeaderProps) {
  return (
    <h2 id={id} className={styles.sectionHeader}>
      {icon && (
        <span className={styles.sectionIcon} aria-hidden="true">
          {icon}
        </span>
      )}
      <span>{title}</span>
      {count != null && (
        <span className={styles.sectionCount}>
          {countLabel ? (
            <>
              <span aria-hidden="true">{count}</span>
              <span className="visually-hidden">{`, ${countLabel}`}</span>
            </>
          ) : (
            count
          )}
        </span>
      )}
    </h2>
  );
}

/** A group of rows under a `PageSectionHeader`. Groups are separated by space only. */
export function PageGroup({ className, children, ...rest }: ComponentPropsWithRef<'section'>) {
  return (
    <section className={classes(styles.group, className)} {...rest}>
      {children}
    </section>
  );
}

/** Rows inside a column: full-bleed, separated by nothing but their own padding. */
export function PageList({ className, children, ...rest }: ComponentPropsWithRef<'ul'>) {
  return (
    // role="list" restores list semantics that WebKit drops with `list-style: none`.
    // eslint-disable-next-line jsx-a11y-x/no-redundant-roles
    <ul role="list" className={classes(styles.list, className)} {...rest}>
      {children}
    </ul>
  );
}
