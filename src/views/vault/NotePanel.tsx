import { useMemo } from 'react';
import { inlineText } from '@/lib/markdown';
import { Checkbox } from '@/components/ui';
import { formatDueDate } from '@/lib/dates';
import { parseNote, type NoteTask } from '@/lib/vault/tasks';
import { vaultStrings as t } from '@/strings/vault';
import styles from './NotePanel.module.css';

interface NotePanelProps {
  /** The note's current text (the editor's, so the panel follows typing). */
  text: string;
  today: string;
  /** The caret's line: the outline marks the heading it is under. */
  caretLine: number;
  onToggle: (task: NoteTask) => void;
  /** Puts the caret on a line. */
  onGoto: (line: number) => void;
}

/**
 * The note's panel on the right (docs/redesign.md, "Layout"): its tasks grouped by heading, with
 * progress and due dates, then its outline, which marks the section the caret is in. Everything is read from the live text, so it follows
 * typing; ticking here edits the text as Mod+Enter would.
 */
export function NotePanel({ text, today, caretLine, onToggle, onGoto }: NotePanelProps) {
  const { tasks, headings } = useMemo(() => parseNote(text), [text]);
  const done = tasks.filter((task) => task.checked).length;
  const groups = useMemo(() => {
    const byHeading = new Map<string, { heading: string | null; tasks: NoteTask[] }>();
    for (const task of tasks) {
      const key = task.heading ?? '';
      const group = byHeading.get(key) ?? { heading: task.heading, tasks: [] };
      group.tasks.push(task);
      byHeading.set(key, group);
    }
    return [...byHeading.values()];
  }, [tasks]);
  const depth = useMemo(() => {
    const levels = new Map(tasks.map((task) => [task.line, task.parentLine]));
    return (task: NoteTask) => {
      let n = 0;
      for (let parent = task.parentLine; parent !== null; parent = levels.get(parent) ?? null)
        n += 1;
      return n;
    };
  }, [tasks]);
  const top = Math.min(...headings.map((h) => h.level));
  const current = headings.findLast((heading) => heading.line <= caretLine)?.line ?? null;

  return (
    <aside className={styles.panel} aria-label={t.panel.label}>
      <section className={styles.section}>
        <h2 className={styles.label}>
          <span>{t.panel.tasks}</span>
          {tasks.length > 0 && <span>{t.panel.progress(done, tasks.length)}</span>}
        </h2>
        {tasks.length > 0 && (
          <div
            className={styles.progress}
            role="progressbar"
            aria-label={t.panel.tasks}
            aria-valuemin={0}
            aria-valuemax={tasks.length}
            aria-valuenow={done}
          >
            <span style={{ width: `${(done / tasks.length) * 100}%` }} />
          </div>
        )}
        {tasks.length === 0 && (
          <p className={styles.hint}>
            {t.panel.noTasks}. {t.panel.noTasksBody}
          </p>
        )}
        {groups.map((group) => (
          <div key={group.heading ?? ''} className={styles.group}>
            {group.heading !== null && <h3 className={styles.groupTitle}>{group.heading}</h3>}
            <ul className={styles.list}>
              {group.tasks.map((task) => (
                <li
                  key={task.line}
                  className={styles.task}
                  data-done={task.checked || undefined}
                  style={{
                    paddingInlineStart: `calc(var(--space-3) + ${depth(task)} * var(--space-3))`,
                  }}
                >
                  <Checkbox
                    size="sm"
                    checked={task.checked}
                    aria-label={t.tasks.toggle(task.text)}
                    onChange={() => onToggle(task)}
                  />
                  <button type="button" className={styles.text} onClick={() => onGoto(task.line)}>
                    {inlineText(task.text)}
                  </button>
                  {task.due && (
                    <span
                      className={styles.due}
                      data-overdue={(!task.checked && task.due < today) || undefined}
                    >
                      {formatDueDate(task.due, today)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
      <section className={styles.section}>
        <h2 className={styles.label}>
          <span>{t.panel.outline}</span>
        </h2>
        {headings.length === 0 ? (
          <p className={styles.hint}>{t.panel.noHeadings}</p>
        ) : (
          <ul className={styles.list}>
            {headings.map((heading) => (
              <li key={heading.line}>
                <button
                  type="button"
                  className={styles.heading}
                  aria-current={heading.line === current ? 'location' : undefined}
                  style={{
                    paddingInlineStart: `calc(var(--space-3) + ${heading.level - top} * var(--space-3))`,
                  }}
                  onClick={() => onGoto(heading.line)}
                >
                  {inlineText(heading.text)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}
