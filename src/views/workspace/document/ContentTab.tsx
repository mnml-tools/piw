import type { Editor, JSONContent } from '@tiptap/react';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, ContextMenu, Dialog, TextInput, useToast, type MenuEntry } from '@/components/ui';
import { createQueryTaskRefStore } from '@/lib/editor/query-task-ref-store';
import { DocumentEditor, TaskRefProvider } from '@/lib/editor/react';
import {
  applyExternalContent,
  isSameDoc,
  jsonToPlainText,
  serializeDoc,
  type DocJSON,
} from '@/lib/editor';
import { convertLineToTask, insertTaskRef } from '@/lib/editor/task-actions';
import { useAutosave } from '@/lib/hooks/useAutosave';
import { matches } from '@/lib/hooks/useHotkeys';
import { api } from '@/lib/ipc/api';
import type { SaveStatus } from '@/lib/autosave';
import type { Tab } from '@/lib/ipc/bindings/Tab';
import { IpcError } from '@/lib/ipc/client';
import { useWorkspace } from '@/state/workspace';
import { common } from '@/strings/common';
import { documentStrings as t } from '@/strings/document';
import '@/lib/editor/editor.css';
import styles from './DocumentView.module.css';

function parse(json: string | null): JSONContent {
  try {
    return json
      ? (JSON.parse(json) as JSONContent)
      : { type: 'doc', content: [{ type: 'paragraph' }] };
  } catch {
    // DocumentEditor shows invalid content read-only and never autosaves it.
    return { type: 'invalid' };
  }
}

interface ContentTabProps {
  tab: Tab;
  documentId: string;
  onStatus: (status: SaveStatus) => void;
  /** Lets the document flush this tab before switching tabs. */
  registerFlush: (flush: () => Promise<void>) => void;
  /** Put the caret in the text when the tab opens (a document just opened or created). */
  focusOnMount?: boolean;
  onFocused?: () => void;
}

/** One content tab: rich editor, rev-guarded autosave, real tasks inline (docs/architecture.md#documents-and-the-editor). */
export function ContentTab({
  tab,
  documentId,
  onStatus,
  registerFlush,
  focusOnMount = false,
  onFocused,
}: ContentTabProps) {
  const client = useQueryClient();
  const { toast } = useToast();
  const openTask = useWorkspace((s) => s.openTask);
  const [store] = useState(() => createQueryTaskRefStore(client));
  const editorRef = useRef<Editor | null>(null);
  const [initial] = useState(() => parse(tab.contentJson));
  const [askTitle, setAskTitle] = useState(false);

  const save = useCallback(
    (json: DocJSON, rev: number) =>
      api
        .updateTabContent(tab.id, rev, serializeDoc(json), jsonToPlainText(json))
        .then((saved) => saved.rev),
    [tab.id],
  );
  const { saver, status } = useAutosave<DocJSON>(
    { value: initial as DocJSON, rev: tab.rev },
    save,
    {
      equals: isSameDoc,
    },
  );

  useEffect(() => onStatus(status), [status, onStatus]);
  useEffect(() => registerFlush(() => saver.flush()), [registerFlush, saver]);

  // Adopt a newer version saved by another window when nothing is pending here. Applied
  // imperatively: the editor's `content` prop stays the initial object, so it never re-applies.
  const remote = useMemo(() => parse(tab.contentJson), [tab.contentJson]);
  useEffect(() => {
    if (tab.rev > saver.persisted.rev && !saver.dirty) {
      saver.takeTheirs(remote as DocJSON, tab.rev);
      if (editorRef.current) applyExternalContent(editorRef.current, remote);
    }
  }, [remote, saver, tab.rev]);

  const fail = (error: unknown) =>
    toast({
      tone: 'error',
      message: error instanceof IpcError ? error.message : common.toasts.genericError,
    });

  const createLinkedTask = (title: string) =>
    api.createTask({ title, documentId }).then((task) => task.id);

  const convert = async () => {
    const editor = editorRef.current;
    if (!editor) return;
    try {
      const converted = await convertLineToTask(editor, createLinkedTask);
      if (!converted) setAskTitle(true);
    } catch (error) {
      fail(error);
    }
  };

  // Inside the editor Mod+T means "make this line a task"; handled on the editor container so
  // it wins over the workspace-wide Mod+T (new task), which skips handled events.
  // Links never navigate the app: Ctrl/⌘+click opens them in the browser (validated in Rust).
  const onEditorClick = (event: React.MouseEvent) => {
    const anchor = (event.target as HTMLElement).closest('a[href]');
    if (!anchor) return;
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      void api.openLink(anchor.getAttribute('href') ?? '').catch(fail);
    }
  };

  const onEditorKeyDown = (event: React.KeyboardEvent) => {
    if (matches('Mod+T', event.nativeEvent)) {
      event.preventDefault();
      void convert();
    }
  };

  const chain = () => editorRef.current?.chain().focus();
  const menu: MenuEntry[] = [
    {
      id: 'format',
      type: 'submenu',
      label: t.format,
      items: [
        {
          id: 'h1',
          label: t.heading(1),
          onSelect: () => chain()?.toggleHeading({ level: 1 }).run(),
        },
        {
          id: 'h2',
          label: t.heading(2),
          onSelect: () => chain()?.toggleHeading({ level: 2 }).run(),
        },
        {
          id: 'h3',
          label: t.heading(3),
          onSelect: () => chain()?.toggleHeading({ level: 3 }).run(),
        },
        {
          id: 'bold',
          label: t.bold,
          shortcut: 'Mod+B',
          onSelect: () => chain()?.toggleBold().run(),
        },
        {
          id: 'italic',
          label: t.italic,
          shortcut: 'Mod+I',
          onSelect: () => chain()?.toggleItalic().run(),
        },
        {
          id: 'code',
          label: t.inlineCode,
          shortcut: 'Mod+E',
          onSelect: () => chain()?.toggleCode().run(),
        },
        { id: 'quote', label: t.quote, onSelect: () => chain()?.toggleBlockquote().run() },
        { id: 'ul', label: t.bulletList, onSelect: () => chain()?.toggleBulletList().run() },
        { id: 'ol', label: t.orderedList, onSelect: () => chain()?.toggleOrderedList().run() },
      ],
    },
    {
      id: 'insert',
      type: 'submenu',
      label: t.insert,
      items: [
        { id: 'task', label: t.task, shortcut: 'Mod+T', onSelect: () => void convert() },
        {
          id: 'checklist',
          label: t.checklist,
          onSelect: () => chain()?.toggleList('checklist', 'checklistItem').run(),
        },
        { id: 'codeblock', label: t.codeBlock, onSelect: () => chain()?.toggleCodeBlock().run() },
        { id: 'divider', label: t.divider, onSelect: () => chain()?.setHorizontalRule().run() },
      ],
    },
    { id: 'sep', type: 'separator' },
    { id: 'convert', label: t.convertToTask, shortcut: 'Mod+T', onSelect: () => void convert() },
  ];

  return (
    <TaskRefProvider
      store={store}
      onToggle={(taskId) => {
        const snapshot = store.getSnapshot(taskId);
        if (snapshot) void api.setTaskCompleted(taskId, snapshot.status !== 'done').catch(fail);
      }}
      onOpen={(taskId) => openTask(taskId)}
      labels={{
        loading: 'Loading task…',
        missing: 'Task unavailable',
        toggle: (task) =>
          task.status === 'done' ? `Reopen ${task.title}` : `Complete ${task.title}`,
      }}
    >
      <ContextMenu items={menu}>
        {/* eslint-disable-next-line jsx-a11y-x/no-static-element-interactions -- keyboard shortcut scope for the editor inside */}
        <div className={styles.editor} onKeyDown={onEditorKeyDown} onClick={onEditorClick}>
          <DocumentEditor
            content={initial}
            placeholder={t.editorPlaceholder}
            onReady={(editor) => {
              editorRef.current = editor;
              if (focusOnMount) {
                // StrictMode (dev) can destroy this editor before the frame runs.
                requestAnimationFrame(() => {
                  if (!editor.isDestroyed) editor.commands.focus('end');
                });
                onFocused?.();
              }
            }}
            onChange={(json) => saver.update(json)}
          />
        </div>
      </ContextMenu>
      {status === 'conflict' && (
        <div className={styles.banner} role="alert">
          {t.conflict}
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              void api.getTab(tab.id).then((latest) => {
                const latestContent = parse(latest.contentJson);
                saver.takeTheirs(latestContent as DocJSON, latest.rev);
                if (editorRef.current) applyExternalContent(editorRef.current, latestContent);
              })
            }
          >
            {t.reload}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void api.getTab(tab.id).then((latest) => saver.keepMine(latest.rev))}
          >
            {t.keepMine}
          </Button>
        </div>
      )}
      {askTitle && (
        <NewTaskDialog
          onClose={() => setAskTitle(false)}
          onCreate={async (title) => {
            const id = await createLinkedTask(title);
            if (editorRef.current) insertTaskRef(editorRef.current, id);
          }}
        />
      )}
    </TaskRefProvider>
  );
}

function NewTaskDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (title: string) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!title.trim()) return;
    try {
      await onCreate(title);
      onClose();
    } catch (cause) {
      setError(cause instanceof IpcError ? cause.message : common.toasts.genericError);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t.newTaskTitle}
      initialFocusRef={input}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {common.actions.cancel}
          </Button>
          <Button variant="primary" disabled={!title.trim()} onClick={() => void submit()}>
            {t.createTask}
          </Button>
        </>
      }
    >
      <form onSubmit={(event) => void submit(event)}>
        <TextInput
          ref={input}
          label={t.newTaskLabel}
          value={title}
          error={error ?? undefined}
          invalid={error !== null}
          onChange={(event) => setTitle(event.target.value)}
        />
      </form>
    </Dialog>
  );
}
