import { Check, CircleExclamationPoint } from 'lucide-react';
import { useEffect, useState, type ComponentPropsWithRef } from 'react';
import { cx, iconProps } from '../utils';
import styles from './SaveIndicator.module.css';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export interface SaveIndicatorLabels {
  /** "Saving…" */
  saving: string;
  /** "Saved" */
  saved: string;
  /** "Couldn't save" */
  error: string;
  /** "Retry" */
  retry: string;
}

export interface SaveIndicatorProps extends Omit<ComponentPropsWithRef<'div'>, 'children'> {
  /** The real save status, as reported by the store. */
  state: SaveState;
  labels: SaveIndicatorLabels;
  /** Shows the Retry button in the error state. */
  onRetry?: () => void;
  /** "Saving…" appears only if a save takes longer than this (default 500 ms; 0 = at once). */
  delayMs?: number;
  /** How long "Saved" stays (default 1500 ms; 0 keeps it). */
  savedMs?: number;
  /**
   * Show "Saved" even when the save was too quick to show "Saving…" (e.g. right after Mod+S).
   * Otherwise "Saved" only follows a visible "Saving…" or an error (a recovery).
   */
  confirmSave?: boolean;
}

type Display = 'hidden' | 'pending' | 'saving' | 'saved' | 'error';

function nextDisplay(
  current: Display,
  state: SaveState,
  delayMs: number,
  confirmSave: boolean,
): Display {
  switch (state) {
    case 'error':
      return 'error';
    case 'saving':
      // While retrying after an error, the error stays until the save succeeds.
      if (current === 'error' || current === 'saving') return current;
      return delayMs > 0 ? 'pending' : 'saving';
    case 'saved':
      return current === 'saving' || current === 'error' || confirmSave ? 'saved' : 'hidden';
    default:
      return 'hidden';
  }
}

/**
 * Discreet autosave feedback (docs/ui-design-system.md §8): hidden at rest, "Saving…" only for slow
 * saves, "Saved" briefly after a visible save or a recovery, and a persistent "Couldn't save —
 * Retry". Only errors are announced (`role="alert"`); "Saving…/Saved" would be chatter.
 */
export function SaveIndicator({
  state,
  labels,
  onRetry,
  delayMs = 500,
  savedMs = 1500,
  confirmSave = false,
  className,
  ...rest
}: SaveIndicatorProps) {
  const [display, setDisplay] = useState<Display>(() =>
    nextDisplay('hidden', state, delayMs, confirmSave),
  );
  const [previousState, setPreviousState] = useState(state);
  if (state !== previousState) {
    setPreviousState(state);
    setDisplay(nextDisplay(display, state, delayMs, confirmSave));
  }

  useEffect(() => {
    if (display === 'pending') {
      const timer = window.setTimeout(() => setDisplay('saving'), delayMs);
      return () => window.clearTimeout(timer);
    }
    if (display === 'saved' && savedMs > 0) {
      const timer = window.setTimeout(() => setDisplay('hidden'), savedMs);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [display, delayMs, savedMs]);

  return (
    <div className={cx(styles.indicator, className)} data-state={display} {...rest}>
      {display === 'saving' && <span className={styles.status}>{labels.saving}</span>}
      {display === 'saved' && (
        <span className={styles.status}>
          <Check {...iconProps} className={styles.icon} />
          {labels.saved}
        </span>
      )}
      {display === 'error' && (
        <div role="alert" className={styles.error}>
          <CircleExclamationPoint {...iconProps} className={styles.icon} />
          <span>{labels.error}</span>
          {onRetry && (
            <>
              <span aria-hidden="true">—</span>
              <button type="button" className={styles.retry} onClick={onRetry}>
                {labels.retry}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
