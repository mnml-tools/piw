import { PanelRight, Pin } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ViewToolbar } from '@/components/app/Page';
import {
  MarkdownEditor,
  type MarkdownEditorHandle,
} from '@/components/app/MarkdownEditor/MarkdownEditor';
import { selectionMenu } from '@/components/app/MarkdownEditor/selection-action';
import { taskDates } from '@/components/app/MarkdownEditor/task-dates';
import { wikiLinks } from '@/components/app/MarkdownEditor/wiki-links';
import { EditorView } from '@codemirror/view';
import { Button, EmptyState, IconButton, iconProps, useToast } from '@/components/ui';
import { inferTitle } from '@/lib/markdown';
import { SpaceNameDialog } from '@/views/workspace/spaces/SpaceDialogs';
import { todayString } from '@/lib/dates';
import { useAutosave } from '@/lib/hooks/useAutosave';
import { useHotkeys } from '@/lib/hooks/useHotkeys';
import { useToday, useVaultNote } from '@/lib/hooks/vault';
import type { SaveStatus } from '@/lib/autosave';
import { api } from '@/lib/ipc/api';
import type { VaultNote } from '@/lib/ipc/bindings/VaultNote';
import { IpcError } from '@/lib/ipc/client';
import { applyTaskChange, type NoteTask } from '@/lib/vault/tasks';
import { tabKey, useVaultUi } from '@/state/vault';
import { vaultStrings as t } from '@/strings/vault';
import editorStyles from './NoteEditor.module.css';
import { useVaultActions } from './actions';
import { NotePanel } from './NotePanel';
import { join, parentOf } from './tree';
import styles from './NoteView.module.css';

/** What the status bar says about the note's file. */
function toSaveState(status: SaveStatus): 'saved' | 'saving' | 'error' | 'conflict' {
  if (status === 'saving' || status === 'pending') return 'saving';
  if (status === 'error' || status === 'conflict') return status;
  return 'saved';
}

/** One note in its tab (docs/redesign.md, "Layout"): its path, its title, its text. */
export function NoteView({ path }: { path: string }) {
  const note = useVaultNote(path);
  const close = useVaultUi((s) => s.close);
  if (note.isPending) return null;
  if (note.isError) {
    const gone = note.error instanceof IpcError && note.error.code === 'not_found';
    return (
      <div className={styles.state}>
        <EmptyState
          title={gone ? t.note.gone : t.note.notUtf8}
          action={
            <Button size="sm" onClick={() => close(tabKey({ type: 'note', path }))}>
              {t.note.close}
            </Button>
          }
        />
      </div>
    );
  }
  return <NoteEditorPane key={path} path={path} initial={note.data} />;
}

function NoteEditorPane({ path, initial }: { path: string; initial: VaultNote }) {
  const live = useVaultNote(path);
  const editor = useRef<MarkdownEditorHandle>(null);
  const actions = useVaultActions();
  const save = useCallback(
    async (text: string, hash: string) => (await api.vaultWriteNote(path, text, hash)).hash,
    [path],
  );
  const { saver, status } = useAutosave<string, string>(
    { value: initial.text, rev: initial.hash },
    save,
  );
  const [selection, setSelection] = useState<string | null>(null);
  // The caret's line, so the panel's outline can mark the section being edited.
  const [caretLine, setCaretLine] = useState(1);
  const [extensions] = useState(() => [
    EditorView.updateListener.of((update) => {
      if (update.selectionSet || update.docChanged) {
        setCaretLine(update.state.doc.lineAt(update.state.selection.main.head).number);
      }
    }),
    wikiLinks({ onOpen: (target) => void actions.openLink(target, path) }),
    taskDates(todayString),
    selectionMenu({
      sticky: { label: t.stickies.fromSelection, shortcut: 'Mod-Shift-s', run: setSelection },
      bold: t.note.bold,
      link: t.note.link,
    }),
  ]);
  const { toast } = useToast();
  const pin = () => void api.vaultPinNote(path).catch(actions.fail);
  useHotkeys({ 'Mod+Shift+P': pin });
  const stickSelection = async (title: string) => {
    if (selection === null) return;
    const made = await api.vaultStickyNote(path, title.trim(), selection);
    await api.vaultPinNote(made);
    toast({ message: t.stickies.pinned(title.trim()) });
  };
  const today = useToday();
  const setSaveState = useVaultUi((s) => s.setSaveState);
  useEffect(() => setSaveState(toSaveState(status)), [setSaveState, status]);
  useEffect(() => () => setSaveState(null), [setSaveState]);
  const panelOpen = useVaultUi((s) => s.panelOpen);
  const togglePanel = useVaultUi((s) => s.togglePanel);

  // The panel reads the text the editor holds, a moment after each edit.
  const [panelText, setPanelText] = useState(initial.text);
  const panelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (panelTimer.current && clearTimeout(panelTimer.current)), []);
  const showInPanel = useCallback((text: string) => {
    if (panelTimer.current) clearTimeout(panelTimer.current);
    panelTimer.current = setTimeout(() => setPanelText(text), 120);
  }, []);
  const onChange = (text: string) => {
    saver.update(text);
    showInPanel(text);
  };
  const adopt = (text: string) => {
    editor.current?.replaceText(text);
    showInPanel(text);
  };

  /** Puts the caret at the end of a line and scrolls to it. */
  const gotoLine = useCallback((number: number) => {
    const view = editor.current?.view();
    if (!view) return;
    const line = view.state.doc.line(Math.min(Math.max(number, 1), view.state.doc.lines));
    view.dispatch({ selection: { anchor: line.to }, scrollIntoView: true });
    view.focus();
  }, []);
  const toggleTask = (task: NoteTask) => {
    const view = editor.current?.view();
    if (!view || view.state.readOnly || task.line > view.state.doc.lines) return;
    const line = view.state.doc.line(task.line);
    // A stale row (the text moved on since the panel read it) does nothing; it refreshes soon.
    if (line.text !== task.lineText) return;
    const next = applyTaskChange(line.text, task.boxAt, {
      kind: 'check',
      checked: !task.checked,
      today: todayString(),
    });
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: next },
      userEvent: 'input.toggle',
    });
  };

  // A task view or a search asked for a line of this note.
  const goto = useVaultUi((s) => (s.goto?.path === path ? s.goto.line : null));
  const clearGoto = useVaultUi((s) => s.clearGoto);
  useEffect(() => {
    if (goto === null) return;
    gotoLine(goto);
    clearGoto();
  }, [goto, gotoLine, clearGoto]);

  // A change from elsewhere (another app, a rename's link update) is adopted while nothing here
  // is unsaved; otherwise the next save reports the conflict.
  const latest = live.data;
  useEffect(() => {
    if (!latest || latest.hash === saver.persisted.rev) return;
    if (saver.dirty || saver.current === 'conflict') return;
    saver.reset(latest.text, latest.hash);
    editor.current?.replaceText(latest.text);
    showInPanel(latest.text);
  }, [latest, saver, showInPanel]);

  // Enter in a renamed title lands here, in the pane mounted for the new path.
  const focusText = useVaultUi((s) => s.focusText === path);
  const setFocusText = useVaultUi((s) => s.setFocusText);
  useEffect(() => {
    if (!focusText) return;
    editor.current?.focus('end');
    setFocusText(null);
  }, [focusText, setFocusText]);

  const gone = live.isError;
  const reload = async () => {
    const fresh = await api.vaultReadNote(path);
    saver.takeTheirs(fresh.text, fresh.hash);
    adopt(fresh.text);
  };
  const keepMine = async () => {
    const fresh = await api.vaultReadNote(path);
    await saver.keepMine(fresh.hash);
  };

  return (
    <section className={editorStyles.editor} aria-label={t.note.label}>
      <ViewToolbar
        title={<Breadcrumb path={path} />}
        titleAs="span"
        actions={
          <>
            <IconButton
              aria-label={t.stickies.pin}
              shortcut="Mod+Shift+P"
              icon={<Pin {...iconProps} />}
              onClick={pin}
            />
            <IconButton
              aria-label={t.panel.toggle}
              pressed={panelOpen}
              icon={<PanelRight {...iconProps} />}
              onClick={togglePanel}
            />
          </>
        }
      />
      {status === 'conflict' && (
        <div className={editorStyles.banners}>
          <div className={editorStyles.banner} data-tone="warning" role="alert">
            <span className={editorStyles.bannerText}>{t.note.conflict}</span>
            <span className={editorStyles.bannerActions}>
              <Button size="sm" onClick={() => void reload().catch(actions.fail)}>
                {t.note.reload}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void keepMine().catch(actions.fail)}>
                {t.note.keepMine}
              </Button>
            </span>
          </div>
        </div>
      )}
      {status === 'error' && !gone && (
        <div className={editorStyles.banners}>
          <div className={editorStyles.banner} data-tone="danger">
            <span className={editorStyles.bannerText}>{t.note.errorBanner}</span>
            <Button size="sm" onClick={() => void saver.retry()}>
              {t.note.retry}
            </Button>
          </div>
        </div>
      )}
      {gone && (
        <div className={editorStyles.banners}>
          <div className={editorStyles.banner} data-tone="neutral" role="status">
            <span className={editorStyles.bannerText}>{t.note.gone}</span>
          </div>
        </div>
      )}
      <div className={styles.split}>
        <div className={editorStyles.scroller}>
          <TitleField
            path={path}
            title={initial.title}
            readOnly={gone}
            beforeRename={() => saver.flush()}
            onDone={() => editor.current?.focus('end')}
          />
          {/* A click under the last line puts the caret at the end. Pointer-only: keyboard users
            are already in the text. */}
          {/* eslint-disable-next-line jsx-a11y-x/no-static-element-interactions */}
          <div
            className={editorStyles.text}
            onMouseDown={(event) => {
              if (event.target !== event.currentTarget) return;
              event.preventDefault();
              editor.current?.focus('end');
            }}
          >
            <MarkdownEditor
              ref={editor}
              defaultValue={initial.text}
              onChange={onChange}
              label={t.note.text}
              placeholder={t.note.placeholder}
              readOnly={gone}
              extensions={extensions}
            />
          </div>
        </div>
        {selection !== null && (
          <SpaceNameDialog
            title={t.stickies.dialogTitle}
            initialName={inferTitle(selection).slice(0, 60)}
            onClose={() => setSelection(null)}
            onSubmit={stickSelection}
          />
        )}
        {panelOpen && (
          <NotePanel
            text={panelText}
            today={today}
            caretLine={caretLine}
            onToggle={toggleTask}
            onGoto={gotoLine}
          />
        )}
      </div>
    </section>
  );
}

/** Where the note is, quiet, as the toolbar's title: `Work / Projects / Refactor 2FA`. */
function Breadcrumb({ path }: { path: string }) {
  const parts = path.replace(/\.md$/i, '').split('/');
  return <span className={styles.breadcrumb}>{parts.join(' / ')}</span>;
}

/**
 * The title is the file name (docs/vault-format.md §2): editing it renames the file on Enter or
 * when it loses focus. A new note opens with its title selected. A rename changes the tab's
 * path, which mounts a fresh pane, so `title` never changes under a mounted field.
 */
function TitleField({
  path,
  title,
  readOnly,
  beforeRename,
  onDone,
}: {
  path: string;
  title: string;
  readOnly: boolean;
  beforeRename: () => Promise<void>;
  onDone: () => void;
}) {
  const [value, setValue] = useState(title);
  const input = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const actions = useVaultActions();
  const renaming = useVaultUi((s) => s.renaming === path);
  const setRenaming = useVaultUi((s) => s.setRenaming);
  const setFocusText = useVaultUi((s) => s.setFocusText);

  useEffect(() => {
    if (!renaming) return;
    input.current?.focus();
    input.current?.select();
    setRenaming(null);
  }, [renaming, setRenaming]);

  /** Renames the note; resolves to its path afterwards (the old one when nothing changed). */
  const commit = async (): Promise<string> => {
    const next = value.trim();
    if (busy.current || next === title) return path;
    if (!next) {
      setValue(title);
      return path;
    }
    busy.current = true;
    try {
      await beforeRename();
      const moved = await actions.rename(path, join(parentOf(path), `${next}.md`));
      if (moved === null) setValue(title);
      return moved ?? path;
    } finally {
      busy.current = false;
    }
  };

  return (
    <input
      ref={input}
      className={styles.title}
      aria-label={t.note.title}
      value={value}
      readOnly={readOnly}
      spellCheck={false}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          void commit().then((now) => (now === path ? onDone() : setFocusText(now)));
        } else if (event.key === 'Escape') {
          setValue(title);
          onDone();
        }
      }}
    />
  );
}
