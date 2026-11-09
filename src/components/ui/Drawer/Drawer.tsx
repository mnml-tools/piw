import { X } from 'lucide-react';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  type ComponentPropsWithRef,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { useReturnFocus } from '../focus-return';
import { IconButton } from '../IconButton/IconButton';
import { cx, iconProps } from '../utils';
import styles from './Drawer.module.css';

export type DrawerMode = 'docked' | 'overlay' | 'full';

export interface DrawerProps extends Omit<ComponentPropsWithRef<'section'>, 'title'> {
  open: boolean;
  /** Called on ×, or Esc while focus is inside the drawer. */
  onClose: () => void;
  /** Heading that names the region ("Task"). */
  title: ReactNode;
  /** Accessible name of the region when it should differ from the title ("Task details"). */
  regionLabel?: string;
  /**
   * Layout chosen by the parent from the content width (docs/ui-design-system.md §9):
   * `docked` ≥ 820px (in flow, the list narrows) · `overlay` < 820px (over the list's right edge)
   * · `full` < 560px. The parent must be `position: relative` for overlay/full.
   */
  mode?: DrawerMode;
  /** Header buttons placed before × (Pin to desktop, ⋯). */
  actions?: ReactNode;
  /** Accessible name of the × button. */
  closeLabel?: string;
  /** Where focus goes when it closes (default: what had focus when it opened, e.g. the row). */
  returnFocusRef?: RefObject<HTMLElement | null>;
}

/**
 * Non-modal task-details panel: `role="region"` + heading, Esc closes, focus returns to the row.
 * Its header is the kit's dialog heading (`.mnml-dialog-heading`, @mnml-tools/ui): a soft bar.
 */
export function Drawer({
  open,
  onClose,
  title,
  regionLabel,
  mode = 'docked',
  actions,
  closeLabel = 'Close',
  returnFocusRef,
  className,
  children,
  onKeyDown,
  onFocus,
  onBlur,
  ...rest
}: DrawerProps) {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const focusInside = useRef(false);
  const restoreFocus = useReturnFocus(open, returnFocusRef);

  useEffect(() => {
    if (open) headingRef.current?.focus({ preventScroll: true });
  }, [open]);

  // On close, give focus back only if it was inside the drawer (or got lost with it).
  const wasOpen = useRef(open);
  useLayoutEffect(() => {
    if (wasOpen.current && !open) {
      const active = document.activeElement;
      if (focusInside.current || !active || active === document.body) restoreFocus();
      focusInside.current = false;
    }
    wasOpen.current = open;
  }, [open, restoreFocus]);

  if (!open) return null;

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    onKeyDown?.(event);
    if (event.key === 'Escape' && !event.defaultPrevented) {
      event.preventDefault();
      onClose();
    }
  };

  return (
    // A named <section> is a region landmark. Esc must bubble from its fields (React order), so
    // the handler lives here rather than on a native listener.
    // eslint-disable-next-line jsx-a11y-x/no-noninteractive-element-interactions
    <section
      aria-labelledby={regionLabel ? undefined : headingId}
      aria-label={regionLabel}
      data-mode={mode}
      className={cx(styles.drawer, styles[mode], className)}
      onKeyDown={handleKeyDown}
      onFocus={(event) => {
        focusInside.current = true;
        onFocus?.(event);
      }}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (!(next instanceof Node) || !event.currentTarget.contains(next)) {
          focusInside.current = false;
        }
        onBlur?.(event);
      }}
      {...rest}
    >
      <header className={cx('mnml-dialog-heading', styles.header)}>
        <h2 id={headingId} ref={headingRef} tabIndex={-1} className={styles.title}>
          {title}
        </h2>
        <div className={styles.actions}>
          {actions}
          <IconButton aria-label={closeLabel} icon={<X {...iconProps} />} onClick={onClose} />
        </div>
      </header>
      <div className={styles.body}>{children}</div>
    </section>
  );
}
