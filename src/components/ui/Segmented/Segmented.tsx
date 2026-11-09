import { useRef, type KeyboardEvent, type ReactNode, type Ref } from 'react';
import { cx, rovingIndex, rovingMove } from '../utils';
import styles from './Segmented.module.css';

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Decorative icon before the label. */
  icon?: ReactNode;
  disabled?: boolean;
}

export interface SegmentedProps<T extends string> {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onValueChange: (value: T) => void;
  /** Accessible name of the radiogroup ("Capture mode", "Theme"). */
  'aria-label'?: string;
  'aria-labelledby'?: string;
  size?: 'sm' | 'md';
  /**
   * `contained` (default): the kit's `Segmented` (joined buttons in a 1px border), for Settings
   * and Quick Capture. `text`: borderless text buttons, the selected one on the selection fill,
   * for view filters in a view header.
   */
  variant?: 'contained' | 'text';
  disabled?: boolean;
  className?: string;
  ref?: Ref<HTMLDivElement>;
}

/**
 * Segmented control with radiogroup semantics: one tab stop, arrow keys move AND select,
 * Home/End jump to the ends (docs/ui-design-system.md §15).
 */
export function Segmented<T extends string>({
  options,
  value,
  onValueChange,
  size = 'md',
  variant = 'contained',
  disabled = false,
  className,
  ref,
  ...aria
}: SegmentedProps<T>) {
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const isDisabled = (index: number) => disabled || Boolean(options[index]?.disabled);
  const tabStop =
    selectedIndex >= 0 ? selectedIndex : rovingIndex(-1, 'next', options.length, isDisabled);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const move = rovingMove(event.key, 'both');
    if (!move) return;
    event.preventDefault();
    const next = rovingIndex(index, move, options.length, isDisabled);
    const option = options[next];
    if (next === index || !option) return;
    itemRefs.current[next]?.focus();
    onValueChange(option.value);
  };

  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-disabled={disabled || undefined}
      className={cx(
        variant === 'contained' && 'mnml-segmented',
        styles.group,
        styles[variant],
        styles[size],
        className,
      )}
      {...aria}
    >
      {options.map((option, index) => {
        const checked = index === selectedIndex;
        return (
          <button
            key={option.value}
            ref={(node) => {
              itemRefs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={index === tabStop ? 0 : -1}
            disabled={isDisabled(index)}
            className={cx('mnml-button', styles.segment)}
            onClick={() => {
              if (!checked) onValueChange(option.value);
            }}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {option.icon && <span className={styles.icon}>{option.icon}</span>}
            <span className={styles.label}>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
