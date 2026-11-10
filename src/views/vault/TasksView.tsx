import { CalendarClock, CalendarDays, ListTodo, Pin, Plus } from 'lucide-react';
import { inlineText } from '@/lib/markdown';
import { useState, type ReactNode } from 'react';
import { PageColumn, PageScroll, PageView, ViewToolbar } from '@/components/app/Page';
import {
  Checkbox,
  ContextMenu,
  DateQuickPicker,
  EmptyState,
  IconButton,
  iconProps,
} from '@/components/ui';
import { formatDueDate } from '@/lib/dates';
import { useToday, useVaultTasks, useVaultTree } from '@/lib/hooks/vault';
import { api } from '@/lib/ipc/api';
import type { VaultTask } from '@/lib/ipc/bindings/VaultTask';
import type { VaultTaskChange } from '@/lib/ipc/bindings/VaultTaskChange';
import type { VaultTaskView } from '@/lib/ipc/bindings/VaultTaskView';
import { useVaultUi } from '@/state/vault';
import { vaultStrings as t } from '@/strings/vault';
import { useVaultActions } from './actions';
import { captureSpace, rememberCaptureSpace } from '@/lib/vault/capture-space';
import { parentOf, spacesOf } from './tree';
import styles from './TasksView.module.css';

const TITLES: Record<VaultTaskView, string> = {
  today: t.tasks.today,
  upcoming: t.tasks.upcoming,
  all: t.tasks.all,
};
const EMPTY: Record<VaultTaskView, string> = {
  today: t.tasks.emptyToday,
  upcoming: t.tasks.emptyUpcoming,
  all: t.tasks.emptyAll,
};
const ICONS: Record<VaultTaskView, ReactNode> = {
  today: <CalendarDays {...iconProps} />,
  upcoming: <CalendarClock {...iconProps} />,
  all: <ListTodo {...iconProps} />,
};

interface Group {
  key: string;
  title: string;
  tone?: 'overdue';
  tasks: VaultTask[];
}

function groupTasks(view: VaultTaskView, tasks: readonly VaultTask[], today: string): Group[] {
  const groups = new Map<string, Group>();
  const add = (key: string, title: string, task: VaultTask, tone?: 'overdue') => {
    const group = groups.get(key) ?? { key, title, tasks: [], ...(tone ? { tone } : {}) };
    group.tasks.push(task);
    groups.set(key, group);
  };
  for (const task of tasks) {
    if (view === 'today') {
      const late = !task.checked && task.due !== null && task.due < today;
      if (late) add('overdue', t.tasks.overdue, task, 'overdue');
      else add('today', t.tasks.dueToday, task);
    } else if (view === 'upcoming') {
      add(task.due ?? '', formatDueDate(task.due ?? today, today), task);
    } else {
      add(task.path, task.noteTitle, task);
    }
  }
  // Overdue first in Today; the others keep the order Rust sorted them in.
  return [...groups.values()].sort(
    (a, b) => Number(b.tone === 'overdue') - Number(a.tone === 'overdue'),
  );
}

/**
 * A task view (docs/redesign.md, "Task view"): the tasks of every note in the space filter,
 * Today with Overdue first, Upcoming by date, All by note. Ticking, dating and rewording write
 * to the task's line in its note; tasks ticked today stay, struck through.
 */
export function TasksView({ view }: { view: VaultTaskView }) {
  const space = useVaultUi((s) => s.space);
  const today = useToday();
  const tasks = useVaultTasks(view, space, today);
  const list = tasks.data ?? [];
  const groups = groupTasks(view, list, today);
  const open = list.filter((task) => !task.checked).length;
  const actions = useVaultActions();

  return (
    <PageView>
      <ViewToolbar
        title={TITLES[view]}
        count={open || undefined}
        actions={
          <IconButton
            aria-label={t.stickies.pin}
            icon={<Pin {...iconProps} />}
            onClick={() => void api.vaultPinTasks(view, space).catch(actions.fail)}
          />
        }
      />
      <PageScroll>
        <AddTask view={view} space={space} today={today} />
        <PageColumn width={list.length === 0 ? 'full' : 'content'}>
          {tasks.isSuccess && list.length === 0 ? (
            <EmptyState icon={ICONS[view]} title={EMPTY[view]} description={t.tasks.emptyBody} />
          ) : (
            groups.map((group) => (
              <section key={group.key} className={styles.group} aria-label={group.title}>
                <h2 className={styles.groupTitle} data-tone={group.tone}>
                  <span>{group.title}</span>
                  <span className={styles.count}>{group.tasks.length}</span>
                </h2>
                <ul className={styles.list}>
                  {group.tasks.map((task) => (
                    <TaskRow
                      key={`${task.path}:${task.line}`}
                      task={task}
                      today={today}
                      showNote={view !== 'all'}
                    />
                  ))}
                </ul>
              </section>
            ))
          )}
        </PageColumn>
      </PageScroll>
    </PageView>
  );
}

function TaskRow({ task, today, showNote }: { task: VaultTask; today: string; showNote: boolean }) {
  const openAt = useVaultUi((s) => s.openAt);
  const space = useVaultUi((s) => s.space);
  const actions = useVaultActions();
  const [editing, setEditing] = useState(false);
  const edit = (change: VaultTaskChange) =>
    void api.vaultEditTask(task, change).catch(actions.fail);
  const folder = parentOf(task.path);
  // Under All spaces the note's space comes first, so two Inboxes never look the same.
  const note = space === null && task.space ? `${task.space} / ${task.noteTitle}` : task.noteTitle;
  const where = [showNote ? note : folder, task.heading].filter(Boolean).join(' › ');

  return (
    <ContextMenu
      items={[
        {
          id: 'open',
          label: t.tasks.open(task.noteTitle),
          onSelect: () => openAt(task.path, task.line),
        },
        { id: 'edit', label: t.tasks.edit, onSelect: () => setEditing(true) },
      ]}
    >
      <li className={styles.row} data-done={task.checked || undefined}>
        <Checkbox
          checked={task.checked}
          aria-label={t.tasks.toggle(task.text)}
          onChange={() => edit({ kind: 'check', checked: !task.checked, today })}
        />
        <span className={styles.body}>
          {editing ? (
            <input
              className={styles.input}
              aria-label={t.tasks.edit}
              defaultValue={task.text}
              // eslint-disable-next-line jsx-a11y-x/no-autofocus -- opened on purpose from Edit task
              autoFocus
              onBlur={(event) => {
                setEditing(false);
                const text = event.target.value.trim();
                if (text && text !== task.text) edit({ kind: 'text', text });
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
                if (event.key === 'Escape') {
                  event.currentTarget.value = task.text;
                  event.currentTarget.blur();
                }
              }}
            />
          ) : (
            <button
              type="button"
              className={styles.text}
              title={t.tasks.open(task.noteTitle)}
              onClick={() => openAt(task.path, task.line)}
              onDoubleClick={() => setEditing(true)}
            >
              {inlineText(task.text)}
            </button>
          )}
          {where && <span className={styles.where}>{where}</span>}
        </span>
        <DateQuickPicker
          value={task.due}
          today={today}
          align="end"
          labels={t.tasks.date}
          onChange={(due) => edit({ kind: 'due', due })}
          trigger={
            <button
              type="button"
              className={styles.due}
              data-overdue={(!task.checked && task.due !== null && task.due < today) || undefined}
            >
              {task.due ? formatDueDate(task.due, today) : t.tasks.noDate}
            </button>
          }
        />
      </li>
    </ContextMenu>
  );
}

/**
 * "Add task": appends to the Inbox of the space filter, or of the space captures went to last
 * (docs/vault-format.md §5). In Today the task is due today.
 */
function AddTask({
  view,
  space,
  today,
}: {
  view: VaultTaskView;
  space: string | null;
  today: string;
}) {
  const spaces = spacesOf(useVaultTree().data ?? []);
  const actions = useVaultActions();
  const [text, setText] = useState('');
  const target = space ?? captureSpace(spaces);
  return (
    <form
      className={styles.add}
      onSubmit={(event) => {
        event.preventDefault();
        const value = text.trim();
        if (!value) return;
        setText('');
        const due = view === 'today' ? today : null;
        void api
          .vaultCapture({ space: target, mode: 'task', text: value, description: '', due })
          .then(() => target !== null && rememberCaptureSpace(target))
          .catch((error: unknown) => {
            setText(value);
            actions.fail(error);
          });
      }}
    >
      <Plus {...iconProps} className={styles.addIcon} />
      <input
        className={styles.addInput}
        aria-label={t.addTask.label}
        placeholder={target ? t.addTask.placeholder(target) : t.addTask.placeholderRoot}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
    </form>
  );
}
