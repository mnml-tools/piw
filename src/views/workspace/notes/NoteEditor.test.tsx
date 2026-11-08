import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { installDomPolyfills, setPlatform } from '@/components/ui/test-utils';
import { api } from '@/lib/ipc/api';
import type { Note } from '@/lib/ipc/bindings/Note';
import { IpcError } from '@/lib/ipc/client';
import { keys } from '@/lib/query/keys';
import { useWorkspace } from '@/state/workspace';
import { note, spaces } from '@/test/fixtures';
import { renderWithProviders } from '@/test/render';
import { NoteEditor, type NoteEditorProps } from './NoteEditor';
import { fakeTimerUser, settings, settle, useFakeClock } from './test-helpers';
import { AUTOSAVE_DELAY_MS, RETRY_BASE_MS } from './useNoteSession';

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function renderEditor(noteId: string | null, props: Partial<NoteEditorProps> = {}) {
  const onBack = vi.fn();
  const view = renderWithProviders(
    <NoteEditor noteId={noteId} onBack={onBack} backLabel="Notes" {...props} />,
  );
  return { ...view, onBack };
}

const field = () => screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Note text' });

/** Echoes the saved text back with the next revision, like the database. */
function savesNextRev() {
  return vi
    .spyOn(api, 'updateNoteText')
    .mockImplementation(async (id, rev, patch) =>
      note({ id, rev: rev + 1, body: patch.body ?? null }),
    );
}

beforeAll(() => {
  installDomPolyfills();
  setPlatform('linux');
});

let restoreClock: () => void = () => {};

beforeEach(() => {
  restoreClock = useFakeClock();
  useWorkspace.setState({ area: 'notes', focus: { type: 'none' }, history: [], spaceId: null });
  vi.spyOn(api, 'listSpaces').mockResolvedValue(spaces);
  vi.spyOn(api, 'getSettings').mockResolvedValue(settings);
  vi.spyOn(api, 'listTags').mockResolvedValue([]);
  vi.spyOn(api, 'discardNoteIfEmpty').mockResolvedValue(true);
  vi.spyOn(api, 'moveNote').mockImplementation(async (id, spaceId) => note({ id, spaceId }));
});

afterEach(() => restoreClock());

describe('NoteEditor — new notes (no empty records)', () => {
  it('creates the record on the first non-whitespace character and keeps keystrokes typed meanwhile', async () => {
    const created = deferred<Note>();
    const create = vi.spyOn(api, 'createNote').mockReturnValue(created.promise);
    const update = savesNextRev();
    const onCreated = vi.fn();
    const user = userEvent.setup(fakeTimerUser);
    renderEditor(null, { onCreated });
    await settle();

    expect(field()).toHaveFocus();
    await user.type(field(), '  {Enter} ');
    expect(create).not.toHaveBeenCalled();

    await user.type(field(), 'Hi');
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({ body: '  \n H', spaceId: 'work' });

    // "i" was typed while the create was in flight: saved right after it, against its revision.
    await act(async () => created.resolve(note({ id: 'n9', body: '  \n H', rev: 1 })));
    expect(onCreated).toHaveBeenCalledWith('n9');
    await settle(AUTOSAVE_DELAY_MS);
    expect(update).toHaveBeenCalledWith('n9', 1, { body: '  \n Hi' });
    expect(create).toHaveBeenCalledTimes(1);
    expect(field()).toHaveValue('  \n Hi');
  });

  it('never creates a record for whitespace and discards nothing when left', async () => {
    const create = vi.spyOn(api, 'createNote');
    const user = userEvent.setup(fakeTimerUser);
    const { unmount } = renderEditor(null);
    await settle();

    await user.type(field(), '   {Enter}{Enter}\t');
    await settle(AUTOSAVE_DELAY_MS * 2);
    unmount();
    await settle();

    expect(create).not.toHaveBeenCalled();
    expect(api.discardNoteIfEmpty).not.toHaveBeenCalled();
  });

  it('creates the note in the space filter when one is active', async () => {
    useWorkspace.setState({ spaceId: 'personal' });
    const create = vi
      .spyOn(api, 'createNote')
      .mockResolvedValue(note({ id: 'n9', spaceId: 'personal', body: 'x' }));
    const user = userEvent.setup(fakeTimerUser);
    renderEditor(null);
    await settle();
    await user.type(field(), 'x');
    expect(create).toHaveBeenCalledWith({ body: 'x', spaceId: 'personal' });
  });
});

describe('NoteEditor — autosave', () => {
  it('saves 400 ms after the last keystroke and chains the returned revision', async () => {
    vi.spyOn(api, 'getNote').mockResolvedValue(note({ body: 'Ligar', rev: 1 }));
    const update = savesNextRev();
    const user = userEvent.setup(fakeTimerUser);
    renderEditor('n1');
    await settle();
    expect(field()).toHaveValue('Ligar');
    expect(field()).toHaveFocus();
    expect(field().selectionStart).toBe(5);

    await user.type(field(), ' já');
    await settle(AUTOSAVE_DELAY_MS - 1);
    expect(update).not.toHaveBeenCalled();
    await settle(1);
    expect(update).toHaveBeenLastCalledWith('n1', 1, { body: 'Ligar já' });

    await user.type(field(), '!');
    await settle(AUTOSAVE_DELAY_MS);
    expect(update).toHaveBeenLastCalledWith('n1', 2, { body: 'Ligar já!' });
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('Mod+S saves at once and shows "Saved"', async () => {
    vi.spyOn(api, 'getNote').mockResolvedValue(note({ body: 'a', rev: 1 }));
    const update = savesNextRev();
    const user = userEvent.setup(fakeTimerUser);
    renderEditor('n1');
    await settle();

    await user.type(field(), 'b');
    await user.keyboard('{Control>}s{/Control}');
    await settle();
    expect(update).toHaveBeenCalledWith('n1', 1, { body: 'ab' });
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });

  it('keeps the text editable after a failed save and retries (by hand and on its own)', async () => {
    vi.spyOn(api, 'getNote').mockResolvedValue(note({ body: 'a', rev: 1 }));
    const update = vi
      .spyOn(api, 'updateNoteText')
      .mockRejectedValue(new IpcError('storage', 'disk full'));
    const user = userEvent.setup(fakeTimerUser);
    renderEditor('n1');
    await settle();

    await user.type(field(), 'b');
    await settle(AUTOSAVE_DELAY_MS);
    expect(update).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t save');
    expect(screen.getByText(/Your text is kept/)).toBeInTheDocument();
    expect(field()).not.toHaveAttribute('readonly');
    expect(field()).toHaveValue('ab');

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await settle();
    expect(update).toHaveBeenCalledTimes(2);

    await settle(RETRY_BASE_MS);
    expect(update).toHaveBeenCalledTimes(3);
    expect(update).toHaveBeenLastCalledWith('n1', 1, { body: 'ab' });
  });

  it('adopts a newer version from another window when there are no local edits', async () => {
    vi.spyOn(api, 'getNote').mockResolvedValue(note({ body: 'Mine', rev: 1 }));
    const update = savesNextRev();
    const { client } = renderEditor('n1');
    await settle();

    act(() => client.setQueryData(keys.note('n1'), note({ body: 'From the sticky', rev: 2 })));
    await settle();
    expect(field()).toHaveValue('From the sticky');
    await settle(AUTOSAVE_DELAY_MS * 2);
    expect(update).not.toHaveBeenCalled();
  });

  it('wraps the selection in Markdown with Mod+B and Mod+I', async () => {
    vi.spyOn(api, 'getNote').mockResolvedValue(note({ body: 'hello world', rev: 1 }));
    const update = savesNextRev();
    const user = userEvent.setup(fakeTimerUser);
    renderEditor('n1');
    await settle();

    field().setSelectionRange(0, 5);
    await user.keyboard('{Control>}b{/Control}');
    expect(field()).toHaveValue('**hello** world');
    expect([field().selectionStart, field().selectionEnd]).toEqual([2, 7]);
    await user.keyboard('{Control>}i{/Control}');
    expect(field()).toHaveValue('**_hello_** world');
    await settle(AUTOSAVE_DELAY_MS);
    expect(update).toHaveBeenLastCalledWith('n1', 1, { body: '**_hello_** world' });
  });

  it('continues list lines on Enter', async () => {
    vi.spyOn(api, 'getNote').mockResolvedValue(note({ body: '- [ ] leite', rev: 1 }));
    savesNextRev();
    const user = userEvent.setup(fakeTimerUser);
    renderEditor('n1');
    await settle();

    await user.keyboard('{Enter}pão');
    expect(field()).toHaveValue('- [ ] leite\n- [ ] pão');
  });
});

describe('NoteEditor — conflicts', () => {
  async function conflicted() {
    vi.spyOn(api, 'getNote')
      .mockResolvedValueOnce(note({ body: 'Ligar', rev: 1 }))
      .mockResolvedValue(note({ body: 'Theirs', rev: 5 }));
    const update = vi
      .spyOn(api, 'updateNoteText')
      .mockRejectedValueOnce(new IpcError('conflict', 'note changed'))
      .mockImplementation(async (id, rev, patch) =>
        note({ id, rev: rev + 1, body: patch.body ?? null }),
      );
    const user = userEvent.setup(fakeTimerUser);
    renderEditor('n1');
    await settle();
    await user.type(field(), ' mine');
    await settle(AUTOSAVE_DELAY_MS);
    return { update, user };
  }

  it('shows a banner and never overwrites the other window silently', async () => {
    const { update } = await conflicted();
    expect(screen.getByRole('alert')).toHaveTextContent('This note changed in another window');
    await settle(AUTOSAVE_DELAY_MS * 5);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('Keep mine saves this text over the latest revision', async () => {
    const { update, user } = await conflicted();
    await user.click(screen.getByRole('button', { name: 'Keep mine' }));
    await settle();
    expect(update).toHaveBeenLastCalledWith('n1', 5, { body: 'Ligar mine' });
    expect(screen.queryByText('This note changed in another window')).not.toBeInTheDocument();
    expect(field()).toHaveValue('Ligar mine');
  });

  it('Reload adopts the other window’s text', async () => {
    const { update, user } = await conflicted();
    await user.click(screen.getByRole('button', { name: 'Reload' }));
    await settle();
    expect(field()).toHaveValue('Theirs');
    expect(screen.queryByText('This note changed in another window')).not.toBeInTheDocument();
    await settle(AUTOSAVE_DELAY_MS * 2);
    expect(update).toHaveBeenCalledTimes(1);
  });
});

describe('NoteEditor — leaving', () => {
  it('discards a note whose text was emptied, after saving the empty text', async () => {
    vi.spyOn(api, 'getNote').mockResolvedValue(note({ body: 'abc', rev: 1 }));
    const order: string[] = [];
    vi.spyOn(api, 'updateNoteText').mockImplementation(async (id, rev, patch) => {
      order.push(`save:${patch.body ?? ''}`);
      return note({ id, rev: rev + 1, body: patch.body ?? null });
    });
    vi.mocked(api.discardNoteIfEmpty).mockImplementation(async () => {
      order.push('discard');
      return true;
    });
    const user = userEvent.setup(fakeTimerUser);
    const { unmount } = renderEditor('n1');
    await settle();

    await user.clear(field());
    unmount();
    await settle();
    expect(order).toEqual(['save:', 'discard']);
    expect(api.discardNoteIfEmpty).toHaveBeenCalledWith('n1');
  });

  it('keeps notes that still have text', async () => {
    vi.spyOn(api, 'getNote').mockResolvedValue(note({ body: 'abc', rev: 1 }));
    savesNextRev();
    const { unmount } = renderEditor('n1');
    await settle();
    unmount();
    await settle();
    expect(api.discardNoteIfEmpty).not.toHaveBeenCalled();
  });

  it('Esc goes back without losing text', async () => {
    vi.spyOn(api, 'getNote').mockResolvedValue(note({ body: 'abc', rev: 1 }));
    const update = savesNextRev();
    const user = userEvent.setup(fakeTimerUser);
    const { onBack, unmount } = renderEditor('n1');
    await settle();
    await user.type(field(), 'd{Escape}');
    expect(onBack).toHaveBeenCalledTimes(1);
    unmount();
    await settle();
    expect(update).toHaveBeenCalledWith('n1', 1, { body: 'abcd' });
  });
});

describe('NoteEditor — commands', () => {
  it('converts to a document after saving, with an undo that restores the original text', async () => {
    vi.spyOn(api, 'getNote').mockResolvedValue(note({ body: 'Refactor 2FA', rev: 1 }));
    const update = savesNextRev();
    const convert = vi.spyOn(api, 'convertNoteToDocument').mockImplementation(async () => {
      expect(update).toHaveBeenCalledWith('n1', 1, { body: 'Refactor 2FA\nSMS' });
      return { note: note({ kind: 'document', body: null }), tabs: [] };
    });
    const revert = vi.spyOn(api, 'revertDocumentConversion').mockResolvedValue(note());
    const user = userEvent.setup(fakeTimerUser);
    renderEditor('n1');
    await settle();

    await user.type(field(), '{Enter}SMS');
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Convert to document' }));
    await settle();
    expect(convert).toHaveBeenCalledWith('n1');
    expect(useWorkspace.getState().focus).toEqual({ type: 'document', id: 'n1' });

    expect(screen.getByText('Converted to document')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await settle();
    expect(revert).toHaveBeenCalledWith('n1', '', 'Refactor 2FA\nSMS');
    expect(useWorkspace.getState().focus).toEqual({ type: 'note', id: 'n1' });
  });

  it('moves to Trash with an undo toast and goes back', async () => {
    vi.spyOn(api, 'getNote').mockResolvedValue(note({ body: 'Comprar café', rev: 1 }));
    savesNextRev();
    const trash = vi.spyOn(api, 'trashNote').mockResolvedValue();
    const restore = vi.spyOn(api, 'restoreNote').mockResolvedValue(false);
    const user = userEvent.setup(fakeTimerUser);
    const { onBack, unmount } = renderEditor('n1');
    await settle();

    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Move to Trash' }));
    await settle();
    expect(trash).toHaveBeenCalledWith('n1');
    expect(onBack).toHaveBeenCalled();
    expect(screen.getByText('“Comprar café” moved to Trash')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await settle();
    expect(restore).toHaveBeenCalledWith('n1');
    unmount();
    await settle();
    expect(api.discardNoteIfEmpty).not.toHaveBeenCalled();
  });

  it('moves the note to another space from the space selector', async () => {
    vi.spyOn(api, 'getNote').mockResolvedValue(note({ body: 'a', rev: 1 }));
    const user = userEvent.setup(fakeTimerUser);
    renderEditor('n1');
    await settle();

    await user.click(screen.getByRole('button', { name: 'Space: Work' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Personal' }));
    await settle();
    expect(api.moveNote).toHaveBeenCalledWith('n1', 'personal');
  });

  it('pins the note to the desktop', async () => {
    vi.spyOn(api, 'getNote').mockResolvedValue(note({ body: 'a', rev: 1 }));
    const open = vi.spyOn(api, 'openSticky').mockResolvedValue(1);
    const user = userEvent.setup(fakeTimerUser);
    renderEditor('n1');
    await settle();

    await user.click(screen.getByRole('button', { name: 'Pin to desktop' }));
    await settle();
    expect(open).toHaveBeenCalledWith({ kind: 'note', id: 'n1' });
  });
});
