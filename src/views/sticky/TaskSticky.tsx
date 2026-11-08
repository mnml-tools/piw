import { Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Checkbox, iconProps, TextInput, useToast } from '@/components/ui';
import { useTask } from '@/lib/hooks/data';
import { useAutosave } from '@/lib/hooks/useAutosave';
import { api } from '@/lib/ipc/api';
import type { TaskDetail } from '@/lib/ipc/bindings/TaskDetail';
import { IpcError } from '@/lib/ipc/client';
import { common } from '@/strings/common';
import { stickyStrings as t } from '@/strings/sticky';
import styles from './StickyBody.module.css';

export function TaskSticky({ id }: { id: string }) {
  const detail = useTask(id);
  if (detail.isError) return <p className={styles.missing}>{t.missing}</p>;
  if (!detail.data) return null;
  return <TaskStickyBody key={id} detail={detail.data} />;
}

function TaskStickyBody({ detail }: { detail: TaskDetail }) {
  const { task, subtasks } = detail;
  const { toast } = useToast();
  const titleField = useRef<HTMLInputElement>(null);
  const [newSubtask, setNewSubtask] = useState('');
  const { saver } = useAutosave({ value: task.title, rev: task.rev }, (value, rev) =>
    api.updateTaskText(task.id, rev, { title: value }).then((saved) => saved.rev),
  );

  useEffect(() => {
    if (task.rev > saver.persisted.rev && !saver.dirty) {
      saver.takeTheirs(task.title, task.rev);
      if (titleField.current) titleField.current.value = task.title;
    }
  }, [task.rev, task.title, saver]);

  const fail = (error: unknown) =>
    toast({
      tone: 'error',
      message: error instanceof IpcError ? error.message : common.toasts.genericError,
    });
  const completed = task.status === 'completed';

  return (
    <div className={styles.task}>
      <div className={styles.taskTitle}>
        <Checkbox
          size="sm"
          aria-label={task.title}
          checked={completed}
          onChange={(event) => void api.setTaskCompleted(task.id, event.target.checked).catch(fail)}
        />
        <TextInput
          variant="ghost"
          aria-label={t.task}
          className={completed ? `${styles.titleInput} ${styles.done}` : styles.titleInput}
          ref={titleField}
          defaultValue={task.title}
          onChange={(event) => {
            // Never save an empty title; the last valid one comes back on blur.
            if (event.target.value.trim()) saver.update(event.target.value);
          }}
          onBlur={(event) => {
            if (!event.target.value.trim()) event.target.value = saver.persisted.value;
            void saver.flush();
          }}
        />
      </div>
      {task.description && <p className={styles.description}>{task.description}</p>}
      {subtasks.length > 0 && (
        <ul className={styles.subtasks}>
          {subtasks.map((sub) => (
            <li key={sub.id}>
              <Checkbox
                size="sm"
                label={sub.title}
                checked={sub.status === 'completed'}
                onChange={(event) =>
                  void api.setTaskCompleted(sub.id, event.target.checked).catch(fail)
                }
              />
            </li>
          ))}
        </ul>
      )}
      <form
        className={`${styles.addRow} ${styles.addSubtask}`}
        onSubmit={(event) => {
          event.preventDefault();
          const title = newSubtask.trim();
          if (!title) return;
          setNewSubtask('');
          void api.createTask({ title, parentTaskId: task.id }).catch((error: unknown) => {
            setNewSubtask(title);
            fail(error);
          });
        }}
      >
        <Plus {...iconProps} />
        <input
          className={styles.addInput}
          aria-label={t.addSubtask}
          placeholder={t.addSubtask}
          value={newSubtask}
          onChange={(event) => setNewSubtask(event.target.value)}
        />
      </form>
    </div>
  );
}
