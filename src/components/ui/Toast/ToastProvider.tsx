import { CircleExclamationPoint, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from '../Button/Button';
import { IconButton } from '../IconButton/IconButton';
import { cx, iconProps } from '../utils';
import {
  DEFAULT_TOAST_DURATION,
  ToastContext,
  type ToastAction,
  type ToastApi,
  type ToastOptions,
} from './toast-context';
import styles from './Toast.module.css';

interface ToastRecord {
  id: string;
  /** Changes when a toast is replaced in place, so its timer restarts. */
  version: number;
  message: string;
  action?: ToastAction;
  duration: number;
  tone: 'info' | 'error';
}

export interface ToastProviderProps {
  children: ReactNode;
}

/** Maximum toasts on screen; the oldest goes first. */
const MAX_TOASTS = 3;
/** Accessible name of the × button on each toast. */
const DISMISS_LABEL = 'Dismiss';
/** Accessible name of the toast list. */
const REGION_LABEL = 'Notifications';

let nextId = 0;

/**
 * Renders the toast stack (bottom centre, above everything) and provides `useToast()`.
 * The list is a polite live region; error toasts use `role="alert"`.
 */
export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const toast = useCallback((options: ToastOptions) => {
    nextId += 1;
    const id = options.id ?? `toast-${nextId}`;
    const record: ToastRecord = {
      id,
      version: nextId,
      message: options.message,
      action: options.action,
      duration: options.duration ?? DEFAULT_TOAST_DURATION,
      tone: options.tone ?? 'info',
    };
    setToasts((current) => {
      const kept = current.filter(
        (existing) => existing.id !== id && !(record.action && existing.action),
      );
      return [...kept, record].slice(-MAX_TOASTS);
    });
    return id;
  }, []);

  const api = useMemo<ToastApi>(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className={styles.viewport}>
        <ol className={styles.list} aria-live="polite" aria-label={REGION_LABEL}>
          {toasts.map((record) => (
            <ToastItem key={`${record.id}:${record.version}`} record={record} onDismiss={dismiss} />
          ))}
        </ol>
      </div>
    </ToastContext.Provider>
  );
}

interface ToastItemProps {
  record: ToastRecord;
  onDismiss: (id: string) => void;
}

function ToastItem({ record, onDismiss }: ToastItemProps) {
  const { id, duration, message, action, tone } = record;
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || focused;
  const remaining = useRef(duration);

  // The timer pauses on hover/focus and resumes with the time that was left.
  useEffect(() => {
    if (paused || !Number.isFinite(duration) || duration <= 0) return undefined;
    const startedAt = Date.now();
    const timer = window.setTimeout(() => onDismiss(id), remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt));
    };
  }, [paused, duration, id, onDismiss]);

  return (
    <li
      className={cx(styles.toast, tone === 'error' && styles.error)}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (!(next instanceof Node) || !event.currentTarget.contains(next)) setFocused(false);
      }}
    >
      {tone === 'error' && <CircleExclamationPoint {...iconProps} className={styles.toneIcon} />}
      <p className={styles.message} role={tone === 'error' ? 'alert' : undefined}>
        {message}
      </p>
      {action && (
        <Button
          variant="ghost"
          size="sm"
          className={styles.action}
          onClick={() => {
            action.onAction();
            onDismiss(id);
          }}
        >
          {action.label}
        </Button>
      )}
      <IconButton
        aria-label={DISMISS_LABEL}
        tooltip={false}
        size="sm"
        icon={<X {...iconProps} />}
        onClick={() => onDismiss(id)}
      />
    </li>
  );
}
