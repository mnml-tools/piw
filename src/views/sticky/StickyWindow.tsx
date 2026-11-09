import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, MoreHorizontal, Pin, X } from 'lucide-react';
import { lazy, Suspense, useCallback, useState } from 'react';
import {
  ContextMenu,
  DropdownMenu,
  IconButton,
  iconProps,
  STICKY_COLORS,
  type MenuEntry,
  type StickyColor,
} from '@/components/ui';
import { useNote, useTask } from '@/lib/hooks/data';
import { useHotkeys } from '@/lib/hooks/useHotkeys';
import { api } from '@/lib/ipc/api';
import type { ColorName } from '@/lib/ipc/bindings/ColorName';
import type { Note } from '@/lib/ipc/bindings/Note';
import type { StickyTarget } from '@/lib/ipc/bindings/StickyTarget';
import { keys } from '@/lib/query/keys';
import { stickyStrings as t } from '@/strings/sticky';
import type { TaskProgress } from '@/lib/markdown';
import { TaskSticky } from './TaskSticky';
import { TasksTabSticky } from './TasksTabSticky';
import styles from './StickyWindow.module.css';

const ICON = { ...iconProps, size: 14 } as const;

// The note editor (CodeMirror) loads only in note stickies.
const NoteSticky = lazy(() => import('./NoteSticky').then((m) => ({ default: m.NoteSticky })));

function labelOf(target: StickyTarget): string {
  return `sticky:${target.kind}:${target.id}`;
}

/** A sticky window for one note, task or document Tasks tab (docs/ui-design-system.md §12). */
export default function StickyWindow({ target }: { target: StickyTarget }) {
  const record = useQuery({
    queryKey: keys.sticky(labelOf(target)),
    queryFn: () => api.getSticky(target),
  });
  const onTop = record.data?.placement.alwaysOnTop ?? false;
  const color: StickyColor = record.data?.color ?? 'plain';
  const [progress, setProgress] = useState<TaskProgress | null>(null);
  const onProgress = useCallback(
    (next: TaskProgress) =>
      setProgress((prev) =>
        prev && prev.done === next.done && prev.total === next.total ? prev : next,
      ),
    [],
  );

  const hide = () => void api.closeSticky(target);
  const openInPiw = () => void api.openInWorkspace(target);
  const toggleTop = () => void api.setStickyAlwaysOnTop(target, !onTop);

  // Esc never hides a sticky (docs/ui-design-system.md §14).
  useHotkeys({ 'Mod+W': hide, 'Mod+O': openInPiw });

  const colors: MenuEntry = {
    id: 'colors',
    type: 'radio-group',
    label: t.color,
    value: color,
    onValueChange: (value) =>
      void api.setStickyColor(target, value === 'plain' ? null : (value as ColorName)),
    options: STICKY_COLORS.map((c) => ({
      value: c,
      label: t.colors[c],
      icon: <span className={styles.swatch} data-color={c} aria-hidden="true" />,
    })),
  };
  const remove: MenuEntry = {
    id: 'remove',
    label: t.remove,
    danger: true,
    onSelect: () => void api.unpinSticky(target),
  };
  // Strip context menu (docs/ui-design-system.md §12): every action.
  const menu: MenuEntry[] = [
    { id: 'color', type: 'submenu', label: t.color, items: [colors] },
    { id: 'top', type: 'checkbox', label: t.keepOnTop, checked: onTop, onCheckedChange: toggleTop },
    { id: 'open', label: t.openInPiw, shortcut: 'Mod+O', onSelect: openInPiw },
    { id: 'hide', label: t.hide, shortcut: 'Mod+W', onSelect: hide },
    { id: 'sep', type: 'separator' },
    remove,
  ];
  // "More": the low-frequency actions that have no button. The colours are listed flat, since
  // a submenu has no room to open beside the menu in a small sticky window.
  const more: MenuEntry[] = [colors, { id: 'sep', type: 'separator' }, remove];

  return (
    <div className={styles.sticky} data-sticky-color={color}>
      <ContextMenu items={menu}>
        <header className={styles.strip} data-tauri-drag-region>
          <StickyTitle target={target} />
          {progress && progress.total > 0 && (
            <span
              className={styles.count}
              data-tauri-drag-region
              aria-label={t.progress(progress.done, progress.total)}
            >
              {progress.done}/{progress.total}
            </span>
          )}
          <div className={styles.controls} data-tauri-drag-region>
            <IconButton
              size="sm"
              className={styles.control}
              aria-label={onTop ? t.stopKeepingOnTop : t.keepOnTop}
              pressed={onTop}
              icon={<Pin {...ICON} fill={onTop ? 'currentColor' : 'none'} />}
              onClick={toggleTop}
            />
            <IconButton
              size="sm"
              className={styles.control}
              aria-label={t.openInPiw}
              shortcut="Mod+O"
              icon={<ArrowUpRight {...ICON} />}
              onClick={openInPiw}
            />
            <DropdownMenu
              align="end"
              items={more}
              trigger={
                <IconButton
                  size="sm"
                  className={styles.control}
                  aria-label={t.more}
                  icon={<MoreHorizontal {...ICON} />}
                />
              }
            />
            <IconButton
              size="sm"
              className={styles.control}
              aria-label={t.hide}
              shortcut="Mod+W"
              icon={<X {...ICON} />}
              onClick={hide}
            />
          </div>
          {onTop && <Pin {...ICON} className={styles.onTopMark} fill="currentColor" />}
        </header>
      </ContextMenu>
      <div className={styles.body}>
        {target.kind === 'note' && (
          <Suspense fallback={null}>
            <NoteSticky id={target.id} onProgress={onProgress} />
          </Suspense>
        )}
        {target.kind === 'task' && <TaskSticky id={target.id} />}
        {target.kind === 'tasks_tab' && <TasksTabSticky tabId={target.id} />}
      </div>
    </div>
  );
}

/**
 * Whether the strip title would only repeat the first line of the note's text. A quick note's
 * display title is inferred from that line, so the strip stays empty unless it has its own title.
 */
function repeatsBody(note: Note): boolean {
  const title = note.title.trim();
  if (!title) return true;
  const firstLine = (note.body ?? '').split('\n').find((line) => line.trim()) ?? '';
  return firstLine.includes(title);
}

function StickyTitle({ target }: { target: StickyTarget }) {
  const note = useNote(target.kind === 'note' ? target.id : null);
  const task = useTask(target.kind === 'task' ? target.id : null);
  const tab = useQuery({
    queryKey: ['document', 'tab', target.id],
    queryFn: async () => {
      const tab = await api.getTab(target.id);
      const document = await api.getDocument(tab.documentId);
      return `${document.note.title} · ${tab.title}`;
    },
    enabled: target.kind === 'tasks_tab',
  });
  const title =
    target.kind === 'note'
      ? note.data && !repeatsBody(note.data)
        ? note.data.displayTitle
        : undefined
      : target.kind === 'task'
        ? task.data?.task.status === 'completed'
          ? t.completed
          : t.task
        : tab.data;
  return (
    <span className={styles.title} data-tauri-drag-region title={title}>
      {title ?? ''}
    </span>
  );
}
