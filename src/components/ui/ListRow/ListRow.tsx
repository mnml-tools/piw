import type { AriaRole, ComponentPropsWithRef, ReactNode } from 'react';
import { cx } from '../utils';
import styles from './ListRow.module.css';

const ROLES_WITH_SELECTED = new Set<string>(['option', 'row', 'gridcell', 'tab', 'treeitem']);

export interface ListRowProps extends Omit<ComponentPropsWithRef<'div'>, 'title'> {
  /** Passed in by the list: `listitem`, `option` (search listbox), `row`… */
  role?: AriaRole;
  /** Before the content: task checkbox, type icon, sticky dot. */
  leading?: ReactNode;
  /** Right-aligned metadata, always visible (due date, subtasks, space dot). */
  trailing?: ReactNode;
  /** Secondary controls revealed on hover AND focus-within (e.g. "Mark organised"). */
  actions?: ReactNode;
  /** Note-row layout. Ignored when `children` is given. */
  title?: ReactNode;
  /** Second line, muted, clamped (1 line in `compact`, else 2). */
  snippet?: ReactNode;
  /** Meta line (xs, subtle). */
  meta?: ReactNode;
  /** Selected row (`--color-bg-active`; `aria-selected` for roles that support it). */
  selected?: boolean;
  /** Current item (`aria-current`), e.g. the note open in split view. */
  current?: boolean | 'page' | 'location' | 'true';
  /**
   * Completed: the title is muted (the row does not move). Free-form rows (`children`, i.e. tasks)
   * are also struck through; the note layout is not.
   */
  completed?: boolean;
  density?: 'default' | 'compact';
}

/**
 * Universal row primitive for notes, tasks, trash, pinned and search results. Keeps one primary
 * focusable control (given by the caller); the focus ring is drawn inside the row.
 */
export function ListRow({
  role,
  leading,
  trailing,
  actions,
  title,
  snippet,
  meta,
  selected = false,
  current,
  completed = false,
  density = 'default',
  className,
  children,
  ...rest
}: ListRowProps) {
  const supportsSelected = role != null && ROLES_WITH_SELECTED.has(role);
  return (
    <div
      role={role}
      aria-selected={supportsSelected ? selected : undefined}
      aria-current={current || undefined}
      data-selected={selected || current ? '' : undefined}
      data-completed={completed ? '' : undefined}
      className={cx(styles.row, styles[density], 'focus-inset', className)}
      {...rest}
    >
      {leading && <div className={styles.leading}>{leading}</div>}
      <div className={cx(styles.main, children != null && styles.free)}>
        {children ?? (
          <>
            {title != null && (
              <div className={styles.titleLine}>
                <span className={styles.title}>{title}</span>
              </div>
            )}
            {snippet != null && <div className={styles.snippet}>{snippet}</div>}
            {meta != null && <div className={styles.meta}>{meta}</div>}
          </>
        )}
      </div>
      {trailing && <div className={styles.trailing}>{trailing}</div>}
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}
