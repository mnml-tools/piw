import { createContext, useContext } from 'react';

export interface ToastAction {
  /** Verb label, usually "Undo". */
  label: string;
  /** Runs when the action is clicked; the toast then closes. */
  onAction: () => void;
}

export interface ToastOptions {
  /** Plain text, e.g. "“Comprar café” moved to Trash". */
  message: string;
  /**
   * Optional action (undo). Only one toast with an action is shown at a time: a new one replaces
   * the previous one (docs/ui-design-system.md §8, "the newest replaces the previous").
   */
  action?: ToastAction;
  /** Milliseconds before it closes (default 8000). `0` or `Infinity` keeps it until dismissed. */
  duration?: number;
  /** `error` toasts are announced assertively (`role="alert"`). */
  tone?: 'info' | 'error';
  /** Reusing an id replaces that toast in place (and restarts its timer). */
  id?: string;
}

export interface ToastApi {
  /** Shows a toast and returns its id. */
  toast: (options: ToastOptions) => string;
  dismiss: (id: string) => void;
}

export const DEFAULT_TOAST_DURATION = 8000;

export const ToastContext = createContext<ToastApi | null>(null);

/** Access the toast system. Must be used under `<ToastProvider>`. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast() must be used inside <ToastProvider>.');
  return api;
}
