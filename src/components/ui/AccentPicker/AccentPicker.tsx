import { Button, accents, type Accent } from '@mnml-tools/ui';
import { cx } from '../utils';
import styles from './AccentPicker.module.css';

export interface AccentPickerProps {
  /** Accessible name of the group ("Accent colour"). */
  label: string;
  value: Accent;
  onValueChange: (value: Accent) => void;
  /** Visible name of each accent; defaults to the kit's id. */
  names?: Partial<Record<Accent, string>>;
  className?: string;
}

/**
 * The kit's accent swatches (Zap's Appearance dialog): one toggle button per accent, each
 * previewing its colour through `data-swatch`. Pressing one applies it everywhere.
 */
export function AccentPicker({ label, value, onValueChange, names, className }: AccentPickerProps) {
  return (
    <div
      className={cx('mnml-appearance-accents', styles.accents, className)}
      role="group"
      aria-label={label}
    >
      {accents.map((accent) => (
        <Button
          key={accent}
          type="button"
          data-swatch={accent}
          aria-pressed={accent === value}
          onClick={() => onValueChange(accent)}
        >
          <span className="mnml-appearance-swatch" aria-hidden="true" />
          {names?.[accent] ?? accent}
        </Button>
      ))}
    </div>
  );
}
