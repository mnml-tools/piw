import type { ComponentPropsWithRef, ReactNode } from 'react';
import { cx } from '../utils';
import styles from './EmptyState.module.css';

export interface EmptyStateProps extends Omit<ComponentPropsWithRef<'div'>, 'title'> {
  /** Small outline icon above the title (decorative). No illustrations. */
  icon?: ReactNode;
  /** "No notes yet". Rendered as a heading. */
  title: string;
  /** One short helper line. */
  description?: ReactNode;
  /** One soft <Button> (secondary; search may pass two). */
  action?: ReactNode;
  /** Heading level for the title (default 2). */
  headingLevel?: 2 | 3 | 4;
}

/**
 * Empty region on the kit's `.mnml-empty-state` (@mnml-tools/ui): a faint 28px icon, a 13/500
 * secondary title, one 11px muted helper line and at most one action, centred in the region it
 * describes (the caller's flex column gives it the space).
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  headingLevel = 2,
  className,
  ...rest
}: EmptyStateProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <div className={cx('mnml-empty-state', styles.empty, className)} {...rest}>
      <div className={styles.content}>
        {icon && <span className={styles.icon}>{icon}</span>}
        <Heading className={styles.title}>{title}</Heading>
        {description && <p className={styles.description}>{description}</p>}
        {action && <div className={styles.action}>{action}</div>}
      </div>
    </div>
  );
}
