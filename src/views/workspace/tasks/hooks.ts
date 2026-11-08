/** Small hooks shared by the Tasks area, task rows and the task drawer. */
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { useToast } from '@/components/ui';
import { todayString } from '@/lib/dates';
import { api } from '@/lib/ipc/api';
import type { Task } from '@/lib/ipc/bindings/Task';
import { common } from '@/strings/common';
import { tasksStrings as t } from '@/strings/tasks';
import { layout } from '@/lib/layout';

/** Content widths from docs/ui-design-system.md §9 (see `@/lib/layout`). */
export const DRAWER_DOCK_MIN_WIDTH = layout.drawerDockMinContent;
export const COMPACT_MAX_WIDTH = layout.compactMaxContent;

/** Today's local date ('YYYY-MM-DD'), refreshed after midnight and when the window regains focus. */
export function useToday(): string {
  const [today, setToday] = useState(() => todayString());
  useEffect(() => {
    const refresh = () => setToday(todayString());
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const timer = window.setTimeout(refresh, midnight.getTime() - now.getTime() + 1000);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [today]);
  return today;
}

/**
 * True once `active` has stayed true for `delayMs` ("Loading…" waits 300 ms,
 * docs/ui-design-system.md §8).
 */
export function useDelayedFlag(active: boolean, delayMs = 300): boolean {
  const [since, setSince] = useState<{ active: boolean; elapsed: boolean }>({
    active,
    elapsed: false,
  });
  if (since.active !== active) setSince({ active, elapsed: false });
  useEffect(() => {
    if (!active) return undefined;
    const timer = window.setTimeout(() => setSince({ active: true, elapsed: true }), delayMs);
    return () => window.clearTimeout(timer);
  }, [active, delayMs]);
  return active && since.active && since.elapsed;
}

/** Width of an element (0 until measured). Pass the returned callback as its `ref`. */
export function useElementWidth<T extends HTMLElement>(): [(node: T | null) => void, number] {
  const [node, setNode] = useState<T | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!node || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);
  return [setNode, width];
}

/**
 * Move to Trash with an undo toast (docs/ui-design-system.md §8). Resolves to true once trashed.
 * Undo restores the task and says so when it came back without its document.
 */
export function useTrashTask() {
  const { toast } = useToast();

  const restore = useCallback(
    async (id: string) => {
      try {
        const unlinked = await api.restoreTask(id);
        if (unlinked) toast({ message: t.toasts.restoredWithoutDocument });
      } catch {
        toast({ message: t.toasts.restoreFailed, tone: 'error' });
      }
    },
    [toast],
  );

  return useCallback(
    async (task: Pick<Task, 'id' | 'title'>, message: string = t.toasts.trashed(task.title)) => {
      try {
        await api.trashTask(task.id);
      } catch {
        toast({ message: t.toasts.trashFailed, tone: 'error' });
        return false;
      }
      toast({
        message,
        action: { label: common.actions.undo, onAction: () => void restore(task.id) },
      });
      return true;
    },
    [toast, restore],
  );
}

/** Runs a one-off task command, reporting failures with an error toast. */
export function useTaskCommand() {
  const { toast } = useToast();
  return useCallback(
    async <T>(command: () => Promise<T>, failure: string = t.toasts.actionFailed) => {
      try {
        return await command();
      } catch {
        toast({ message: failure, tone: 'error' });
        return undefined;
      }
    },
    [toast],
  );
}
