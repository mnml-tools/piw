import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Copy,
  Ellipsis,
  FileText,
  FolderInput,
  Pin,
  Tag,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import {
  MarkdownEditor,
  type MarkdownEditorHandle,
} from '@/components/app/MarkdownEditor/MarkdownEditor';
import { ViewToolbar } from '@/components/app/Page';
import { SpaceMenu } from '@/components/app/SpaceMenu';
import {
  Button,
  DropdownMenu,
  IconButton,
  SaveIndicator,
  iconProps,
  useToast,
  type MenuEntry,
} from '@/components/ui';
import { useNote, useSettings, useSpaces, useTags } from '@/lib/hooks/data';
import { useHotkeys } from '@/lib/hooks/useHotkeys';
import { api } from '@/lib/ipc/api';
import type { Note } from '@/lib/ipc/bindings/Note';
import { useWorkspace } from '@/state/workspace';
import { notesStrings as t } from '@/strings/notes';
import { inferTitle } from '@/lib/markdown';
import { initialSpace } from '@/lib/spaces';
import { copyText } from './clipboard';
import { LoadingLine, RegionError } from './RegionStates';
import { TagDialog } from './TagDialog';
import { useNoteActions } from './useNoteActions';
import { useNoteSession } from './useNoteSession';
import styles from './NoteEditor.module.css';

export interface NoteEditorHandle {
  /** Moves focus into the text, caret at the end. */
  focus: () => void;
  /** Persists pending edits (e.g. before the list acts on this note). */
  flush: () => Promise<void>;
  /**
   * Persists pending edits and keeps the record when the editor closes, even if its text is empty
   * (the list is about to move it to Trash, archive or convert it).
   */
  handOver: () => Promise<void>;
}

export interface NoteEditorProps {
  /** The note to edit, or `null` for a new unsaved draft. Render with `key` per note. */
  noteId: string | null;
  onBack: () => void;
  /** Where Back returns to: "Notes", "Inbox", "Search"… */
  backLabel: string;
  /** Hide Back (split view, where the list stays visible). Default true. */
  showBack?: boolean;
  /** Focus the text on open, caret at the end. Default true. */
  focusOnOpen?: boolean;
  /** A draft became a record (its first non-whitespace character was saved). */
  onCreated?: (id: string) => void;
  /** Esc in the text. Defaults to `onBack`. */
  onEscape?: () => void;
  ref?: Ref<NoteEditorHandle>;
}

type SessionProps = Omit<NoteEditorProps, 'noteId'> & { initialNote: Note | null };

/** Quick-note editor (docs/ui-design-system.md §10): live Markdown text, autosave, no toolbar. */
export function NoteEditor({ noteId, ...props }: NoteEditorProps) {
  // A draft keeps its editor when it becomes a record, so later `noteId` changes are ignored.
  const [initialId] = useState(noteId);
  if (initialId === null) return <EditorSession initialNote={null} {...props} />;
  return <ExistingNote noteId={initialId} {...props} />;
}

function BackButton({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      icon={<ArrowLeft {...iconProps} />}
      onClick={onBack}
      aria-label={t.editor.backTo(label)}
    >
      {label}
    </Button>
  );
}

function ExistingNote({ noteId, ...props }: Omit<NoteEditorProps, 'noteId'> & { noteId: string }) {
  const query = useNote(noteId);
  const asDocument = query.data?.kind === 'document' ? query.data : null;

  // Documents have their own view; replace the focus instead of stacking history.
  useEffect(() => {
    if (asDocument) useWorkspace.getState().replaceFocus({ type: 'document', id: asDocument.id });
  }, [asDocument]);

  if (query.data && !asDocument) return <EditorSession initialNote={query.data} {...props} />;
  return (
    <section className={styles.editor} aria-label={t.editor.label}>
      <ViewToolbar
        leading={
          props.showBack !== false && <BackButton label={props.backLabel} onBack={props.onBack} />
        }
      />
      <div className={styles.state}>
        {query.isError ? (
          <RegionError
            title={t.error.noteTitle}
            error={query.error}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <LoadingLine />
        )}
      </div>
    </section>
  );
}

function EditorSession({
  initialNote,
  onBack,
  backLabel,
  showBack = true,
  focusOnOpen = true,
  onCreated,
  onEscape,
  ref,
}: SessionProps) {
  const fieldRef = useRef<MarkdownEditorHandle>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const spaces = useSpaces();
  const settings = useSettings();
  const knownTags = useTags();
  const spaceFilter = useWorkspace((state) => state.spaceId);
  const openDocument = useWorkspace((state) => state.openDocument);
  const actions = useNoteActions();
  const { toast } = useToast();
  const [draftSpace, setDraftSpace] = useState<string | null>(null);
  const [tagOpen, setTagOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // Mod+S shows "Saved" even when the save was too quick to show "Saving…".
  const [manualSave, setManualSave] = useState<'saving' | 'saved' | null>(null);

  const spaceList = spaces.data ?? [];
  // New items inherit the space filter; under All, the "New items go to" setting (§2.3).
  const inherited =
    spaceFilter && spaceList.some((space) => space.id === spaceFilter)
      ? spaceFilter
      : initialSpace(spaceList, settings.data);
  const newSpace = draftSpace ?? inherited;

  const session = useNoteSession({
    initial: initialNote,
    field: fieldRef,
    resolveSpace: () => newSpace,
    onCreated: (note) => onCreated?.(note.id),
  });
  const { id, flush, retry, release } = session;
  const note = session.note ?? initialNote ?? undefined;
  const tags = note?.tags ?? [];
  const trashed = Boolean(note?.deletedAt);
  const readOnly = busy || trashed || session.gone;
  const spaceValue = note?.spaceId ?? newSpace;
  const currentTitle = () => inferTitle(session.text()) || t.untitledNote;

  const focusEnd = useCallback(() => fieldRef.current?.focus('end'), []);

  useEffect(() => {
    if (focusOnOpen) focusEnd();
  }, [focusOnOpen, focusEnd]);

  useImperativeHandle(
    ref,
    () => ({
      focus: focusEnd,
      flush: async () => {
        await flush();
      },
      handOver: async () => {
        await flush();
        release(true);
      },
    }),
    [flush, focusEnd, release],
  );

  const saveNow = async () => {
    setManualSave('saving');
    const result = await flush();
    setManualSave(result === 'saved' ? 'saved' : null);
  };

  const handleChange = (text: string) => {
    if (manualSave) setManualSave(null);
    session.onText(text);
  };

  /** Saves, then hands the record to a command that takes it out of this editor. */
  const handOver = async (command: (noteId: string) => Promise<boolean>) => {
    if (!id) return false;
    setBusy(true);
    if ((await flush()) === 'failed') {
      setBusy(false);
      toast({ message: t.toasts.needsSave, tone: 'error' });
      return false;
    }
    release(true);
    const done = await command(id);
    if (!done) release(false);
    setBusy(false);
    return done;
  };

  const convert = async () => {
    const original = { title: note?.title ?? '', body: session.text() };
    if (id && (await handOver((noteId) => actions.convert(noteId, original)))) openDocument(id);
  };
  const archived = Boolean(note?.archivedAt);
  const archive = async () => {
    if (archived) {
      // Unarchiving keeps the note open here; it simply returns to Notes.
      if (id) await actions.setArchived({ id, title: currentTitle(), kind: 'quick_note' }, false);
      return;
    }
    const target = (noteId: string) =>
      actions.setArchived({ id: noteId, title: currentTitle(), kind: 'quick_note' }, true);
    if (await handOver(target)) onBack();
  };
  const trash = async () => {
    const target = (noteId: string) =>
      actions.trash({ id: noteId, title: currentTitle(), kind: 'quick_note' });
    if (await handOver(target)) onBack();
  };
  const pin = async () => {
    if (!id || readOnly) return;
    await flush();
    await actions.pin(id);
  };
  useHotkeys({
    'Mod+S': () => void saveNow(),
    'Mod+Shift+P': () => void pin(),
  });
  const copy = () => {
    copyText(session.text())
      .then(() => toast({ message: t.toasts.copied }))
      .catch(() => toast({ message: t.toasts.copyFailed, tone: 'error' }));
  };
  const changeSpace = (spaceId: string) => {
    if (id) void actions.move(id, spaceId);
    else setDraftSpace(spaceId);
  };
  const saveTags = async (next: string[]) => {
    if (!id) return false;
    try {
      await api.setNoteTags(id, next);
      return true;
    } catch {
      toast({ message: t.toasts.tagFailed, tone: 'error' });
      return false;
    }
  };
  const removeTag = (tag: string) => {
    moreRef.current?.focus();
    void saveTags(tags.filter((name) => name !== tag));
  };
  const resolveConflict = (choice: () => Promise<void>) => {
    choice()
      .then(() => fieldRef.current?.focus())
      .catch(() => toast({ message: t.toasts.reloadFailed, tone: 'error' }));
  };
  const restore = () => {
    if (!id) return;
    api.restoreNote(id).catch(() => toast({ message: t.toasts.restoreFailed, tone: 'error' }));
  };

  const needsRecord = !id || readOnly;
  const menu: MenuEntry[] = [
    {
      id: 'tag',
      label: t.menu.addTag,
      icon: <Tag {...iconProps} />,
      disabled: needsRecord,
      onSelect: () => setTagOpen(true),
    },
    {
      id: 'convert',
      label: t.menu.convert,
      icon: <FileText {...iconProps} />,
      disabled: needsRecord,
      onSelect: () => void convert(),
    },
    {
      id: 'move',
      type: 'submenu',
      label: t.menu.moveToSpace,
      icon: <FolderInput {...iconProps} />,
      disabled: readOnly || spaceList.length === 0,
      items: [
        {
          id: 'spaces',
          type: 'radio-group',
          label: t.editor.space,
          value: spaceValue ?? '',
          onValueChange: changeSpace,
          options: spaceList.map((space) => ({ value: space.id, label: space.name })),
        },
      ],
    },
    { id: 'copy', label: t.menu.copyMarkdown, icon: <Copy {...iconProps} />, onSelect: copy },
    {
      id: 'archive',
      label: archived ? t.menu.unarchive : t.menu.archive,
      icon: archived ? <ArchiveRestore {...iconProps} /> : <Archive {...iconProps} />,
      disabled: needsRecord,
      onSelect: () => void archive(),
    },
    { id: 'separator', type: 'separator' },
    {
      id: 'trash',
      label: t.menu.trash,
      icon: <Trash2 {...iconProps} />,
      danger: true,
      disabled: needsRecord,
      onSelect: () => void trash(),
    },
  ];

  return (
    <section className={styles.editor} aria-label={t.editor.label}>
      <ViewToolbar
        // The note's title is its first line; the breadcrumb names it (plain text, not a heading).
        title={note?.displayTitle || t.untitledNote}
        titleAs="span"
        leading={showBack && <BackButton label={backLabel} onBack={onBack} />}
        actions={
          <>
            {/* Retry lives in the error banner below, next to the explanation. */}
            <SaveIndicator
              state={manualSave ?? session.saveState}
              confirmSave={manualSave !== null}
              labels={t.editor.save}
            />
            <SpaceMenu
              spaces={spaceList}
              value={spaceValue}
              onChange={changeSpace}
              label={t.editor.space}
              disabled={readOnly}
            />
            <IconButton
              aria-label={t.editor.pin}
              shortcut="Mod+Shift+P"
              icon={<Pin {...iconProps} />}
              disabled={needsRecord}
              onClick={() => void pin()}
            />
            <DropdownMenu
              align="end"
              trigger={
                <IconButton
                  ref={moreRef}
                  aria-label={t.editor.more}
                  icon={<Ellipsis {...iconProps} />}
                />
              }
              items={menu}
            />
          </>
        }
      />

      {session.conflict && (
        <div className={styles.banners}>
          <div className={styles.banner} data-tone="warning" role="alert">
            <span className={styles.bannerText}>{t.editor.conflict}</span>
            <span className={styles.bannerActions}>
              <Button size="sm" onClick={() => resolveConflict(session.reload)}>
                {t.editor.reload}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => resolveConflict(session.keepMine)}>
                {t.editor.keepMine}
              </Button>
            </span>
          </div>
        </div>
      )}
      {session.failed && !session.conflict && !session.gone && !trashed && (
        // Announced by the SaveIndicator (role="alert"); this line explains it and offers Retry.
        <div className={styles.banners}>
          <div className={styles.banner} data-tone="danger">
            <span className={styles.bannerText}>{t.editor.errorBanner}</span>
            <Button size="sm" onClick={retry}>
              {t.editor.retry}
            </Button>
          </div>
        </div>
      )}
      {trashed && (
        <div className={styles.banners}>
          <div className={styles.banner} data-tone="neutral" role="status">
            <span className={styles.bannerText}>{t.editor.trashed}</span>
            <Button size="sm" onClick={restore}>
              {t.editor.restore}
            </Button>
          </div>
        </div>
      )}
      {session.gone && (
        <div className={styles.banners}>
          <div className={styles.banner} data-tone="neutral" role="status">
            <span className={styles.bannerText}>{t.editor.gone}</span>
          </div>
        </div>
      )}

      <div ref={scrollerRef} className={styles.scroller}>
        {tags.length > 0 && (
          <ul className={styles.tags} aria-label={t.editor.tags}>
            {tags.map((tag) => (
              <li key={tag} className={styles.tagItem}>
                <DropdownMenu
                  trigger={
                    <button type="button" className={styles.tag} disabled={readOnly}>
                      #{tag}
                    </button>
                  }
                  items={[
                    {
                      id: 'remove',
                      label: t.editor.removeTag(tag),
                      onSelect: () => removeTag(tag),
                    },
                  ]}
                />
              </li>
            ))}
          </ul>
        )}
        <MarkdownEditor
          ref={fieldRef}
          className={styles.text}
          defaultValue={initialNote?.body ?? ''}
          onChange={handleChange}
          onEscape={onEscape ?? onBack}
          label={t.editor.text}
          placeholder={t.editor.placeholder}
          readOnly={readOnly}
        />
      </div>

      <TagDialog
        open={tagOpen}
        onOpenChange={setTagOpen}
        existing={tags}
        suggestions={(knownTags.data ?? []).map((tag) => tag.name)}
        onAdd={(tag) => saveTags([...tags, tag])}
      />
    </section>
  );
}
