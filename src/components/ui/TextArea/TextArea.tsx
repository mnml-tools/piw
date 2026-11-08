import {
  useCallback,
  useLayoutEffect,
  useRef,
  type ComponentPropsWithRef,
  type InputEvent,
} from 'react';
import { assignRef, cx } from '../utils';
import styles from './TextArea.module.css';

export interface TextAreaProps extends ComponentPropsWithRef<'textarea'> {
  /**
   * `default` bordered field, `ghost` borderless (descriptions, sticky body),
   * `editor` no chrome at the reading measure with editor typography.
   */
  variant?: 'default' | 'ghost' | 'editor';
  /** Grow with the content instead of scrolling (cap it with CSS `max-height`). */
  autoGrow?: boolean;
  invalid?: boolean;
}

/**
 * Multi-line plain-text field. Tab is never captured here, so focus can always leave (no trap);
 * list-line indentation is the editor's job. `className` always goes on the <textarea>.
 */
export function TextArea({
  variant = 'default',
  autoGrow = false,
  invalid,
  className,
  ref,
  onInput,
  value,
  rows = autoGrow ? 1 : 3,
  ...rest
}: TextAreaProps) {
  const innerRef = useRef<HTMLTextAreaElement | null>(null);

  const resize = useCallback(() => {
    const el = innerRef.current;
    if (!el || !autoGrow) return;
    const style = window.getComputedStyle(el);
    const borders =
      (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0);
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + borders}px`;
    // Scroll only once a CSS max-height caps the growth (avoids sub-pixel scrollbars).
    el.style.overflowY = el.scrollHeight > el.clientHeight + 1 ? 'auto' : 'hidden';
  }, [autoGrow]);

  // Controlled value changes (and the first paint) re-measure.
  useLayoutEffect(() => {
    resize();
  }, [resize, value]);

  // Width changes re-wrap the text, so re-measure when the width changes.
  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!autoGrow || !el || typeof ResizeObserver === 'undefined') return undefined;
    let lastWidth = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth !== lastWidth) {
        lastWidth = el.clientWidth;
        resize();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [autoGrow, resize]);

  const setRef = useCallback(
    (node: HTMLTextAreaElement | null) => {
      innerRef.current = node;
      assignRef(ref, node);
    },
    [ref],
  );

  const handleInput = (event: InputEvent<HTMLTextAreaElement>) => {
    resize();
    onInput?.(event);
  };

  return (
    <textarea
      ref={setRef}
      rows={rows}
      value={value}
      onInput={handleInput}
      className={cx(styles.textarea, styles[variant], autoGrow && styles.autoGrow, className)}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
}
