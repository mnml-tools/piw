import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { installDomPolyfills, setPlatform } from '@/components/ui/test-utils';
import { api } from '@/lib/ipc/api';
import { IpcError } from '@/lib/ipc/client';
import { useWorkspace } from '@/state/workspace';
import { note, noteItem, spaces } from '@/test/fixtures';
import { renderWithProviders } from '@/test/render';
import NotesArea from './NotesArea';
import { editorText, settings } from './test-helpers';

const items = [
  noteItem({ id: 'n1', displayTitle: 'Ligar ao fornecedor', excerpt: 'Pedir orçamento revisto' }),
  noteItem({
    id: 'n2',
    displayTitle: 'Comprar café',
    spaceId: 'personal',
    checklistCount: 5,
    checklistDone: 1,
  }),
  noteItem({ id: 'd1', kind: 'document', displayTitle: 'Refactor 2FA', taskCount: 4 }),
];

const row = (name: string) => screen.getByRole('button', { name });
const findRow = (name: string) => screen.findByRole('button', { name });
const field = () => screen.findByRole('textbox', { name: 'Note text' });

beforeAll(() => {
  installDomPolyfills();
  setPlatform('linux');
});

beforeEach(() => {
  useWorkspace.setState({
    area: 'notes',
    focus: { type: 'none' },
    history: [],
    spaceId: null,
    notesSplit: false,
    notesSort: 'updated',
  });
  vi.spyOn(api, 'listSpaces').mockResolvedValue(spaces);
  vi.spyOn(api, 'getSettings').mockResolvedValue(settings);
  vi.spyOn(api, 'listTags').mockResolvedValue([]);
  vi.spyOn(api, 'listNotes').mockResolvedValue(items);
  vi.spyOn(api, 'getNote').mockImplementation(async (id) =>
    note({ id, body: `${items.find((item) => item.id === id)?.displayTitle ?? ''}\nbody` }),
  );
  vi.spyOn(api, 'updateNoteText').mockImplementation(async (id, rev, patch) =>
    note({ id, rev: rev + 1, body: patch.body ?? null }),
  );
  vi.spyOn(api, 'discardNoteIfEmpty').mockResolvedValue(false);
});

describe('NotesArea — list', () => {
  it('lists notes and documents with title, snippet, date, space and task or checklist count', async () => {
    renderWithProviders(<NotesArea />);
    const list = await screen.findByRole('list', { name: 'Notes' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(api.listNotes).toHaveBeenCalledWith({ sort: 'updated', scope: 'active' });

    expect(row('Ligar ao fornecedor')).toHaveAccessibleDescription(/Work/);
    expect(screen.getByText('Pedir orçamento revisto')).toBeInTheDocument();
    expect(row('Comprar café')).toHaveAccessibleDescription(/Personal.*1 of 5 done/);
    const documentRow = row('Refactor 2FA');
    expect(documentRow).toHaveAccessibleDescription(/Document/);
    expect(documentRow).toHaveAccessibleDescription(/4 tasks/);
    expect(screen.getAllByRole('heading', { level: 1, name: 'Notes' })).toHaveLength(1);
  });

  it('filters by the active space and hides the space name', async () => {
    useWorkspace.setState({ spaceId: 'work' });
    renderWithProviders(<NotesArea />);
    await findRow('Ligar ao fornecedor');
    expect(api.listNotes).toHaveBeenCalledWith({
      sort: 'updated',
      scope: 'active',
      spaceId: 'work',
    });
    expect(row('Ligar ao fornecedor')).not.toHaveAccessibleDescription(/Work/);
  });

  it('has one tab stop and moves with arrows, j/k, Home and End', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NotesArea />);
    const first = await findRow('Ligar ao fornecedor');
    expect(first).toHaveAttribute('tabindex', '0');
    expect(row('Comprar café')).toHaveAttribute('tabindex', '-1');

    first.focus();
    await user.keyboard('{ArrowDown}');
    expect(row('Comprar café')).toHaveFocus();
    await user.keyboard('j');
    expect(row('Refactor 2FA')).toHaveFocus();
    await user.keyboard('k');
    expect(row('Comprar café')).toHaveFocus();
    await user.keyboard('{Home}');
    expect(first).toHaveFocus();
    await user.keyboard('{End}');
    expect(row('Refactor 2FA')).toHaveFocus();
    expect(row('Refactor 2FA')).toHaveAttribute('tabindex', '0');
  });

  it('Enter opens the note in the editor; Back restores the list and the row focus', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NotesArea />);
    (await findRow('Comprar café')).focus();
    await user.keyboard('{Enter}');

    expect(useWorkspace.getState().focus).toEqual({ type: 'note', id: 'n2' });
    const text = await field();
    expect(editorText(text)).toBe('Comprar café\nbody');
    expect(text).toHaveFocus();
    expect(screen.queryByRole('list', { name: 'Notes' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back to Notes' }));
    expect(await findRow('Comprar café')).toHaveFocus();
    expect(useWorkspace.getState().focus).toEqual({ type: 'none' });
  });

  it('opens documents in the document view', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NotesArea />);
    await user.click(await findRow('Refactor 2FA'));
    expect(useWorkspace.getState().focus).toEqual({ type: 'document', id: 'd1' });
    // The shell shows the document view; Notes renders nothing meanwhile.
    expect(screen.queryByRole('region', { name: 'Notes' })).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Notes' })).not.toBeInTheDocument();
  });

  it('Delete moves a note to Trash with an undo toast that restores it', async () => {
    const trash = vi.spyOn(api, 'trashNote').mockResolvedValue();
    const restore = vi.spyOn(api, 'restoreNote').mockResolvedValue(false);
    const user = userEvent.setup();
    renderWithProviders(<NotesArea />);
    (await findRow('Ligar ao fornecedor')).focus();

    await user.keyboard('{Delete}');
    expect(trash).toHaveBeenCalledWith('n1');
    expect(await screen.findByText('“Ligar ao fornecedor” moved to Trash')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(restore).toHaveBeenCalledWith('n1');
    await waitFor(() =>
      expect(screen.queryByText('“Ligar ao fornecedor” moved to Trash')).not.toBeInTheDocument(),
    );
  });

  it('asks what happens to linked tasks before moving a document to Trash', async () => {
    const trash = vi.spyOn(api, 'trashDocument').mockResolvedValue();
    const user = userEvent.setup();
    renderWithProviders(<NotesArea />);
    (await findRow('Refactor 2FA')).focus();

    await user.keyboard('{Delete}');
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Move “Refactor 2FA” to Trash?',
    });
    expect(dialog).toHaveTextContent('It has 4 linked tasks.');
    expect(within(dialog).getByRole('radio', { name: /Keep the tasks/ })).toBeChecked();
    await user.click(within(dialog).getByRole('radio', { name: 'Move the tasks to Trash too' }));
    await user.click(within(dialog).getByRole('button', { name: 'Move to Trash' }));

    expect(trash).toHaveBeenCalledWith('d1', 'trash');
    expect(await screen.findByText('“Refactor 2FA” moved to Trash')).toBeInTheDocument();
  });

  it('offers the row commands in a context menu (Shift+F10)', async () => {
    const archive = vi.spyOn(api, 'setNoteArchived').mockResolvedValue(note({ archivedAt: 'x' }));
    const user = userEvent.setup();
    renderWithProviders(<NotesArea />);
    (await findRow('Ligar ao fornecedor')).focus();

    await user.keyboard('{Shift>}{F10}{/Shift}');
    const menu = await screen.findByRole('menu');
    for (const name of [
      'Open',
      'Pin to desktop',
      'Convert to document',
      'Move to space',
      'Archive',
    ]) {
      expect(
        within(menu).getByRole('menuitem', { name: new RegExp(`^${name}`) }),
      ).toBeInTheDocument();
    }
    await user.click(within(menu).getByRole('menuitem', { name: 'Archive' }));
    expect(archive).toHaveBeenCalledWith('n1', true);
    expect(await screen.findByText('“Ligar ao fornecedor” archived')).toBeInTheDocument();
  });

  it('leads with a Favourites group and moves through both groups in screen order', async () => {
    vi.mocked(api.listNotes).mockResolvedValue([
      items[0]!,
      items[1]!,
      { ...items[2]!, sidebarOrder: 0 },
    ]);
    const setFavourite = vi.spyOn(api, 'setDocumentInSidebar').mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithProviders(<NotesArea />);

    const favourites = await screen.findByRole('list', { name: 'Favourites' });
    expect(within(favourites).getAllByRole('listitem')).toHaveLength(1);
    expect(within(favourites).getByRole('button', { name: 'Refactor 2FA' })).toBeInTheDocument();
    const others = screen.getByRole('list', { name: 'Notes' });
    expect(within(others).getAllByRole('listitem')).toHaveLength(2);

    // One tab stop: the first favourite; ↓ continues into the other group.
    const first = row('Refactor 2FA');
    expect(first).toHaveAttribute('tabindex', '0');
    first.focus();
    await user.keyboard('{ArrowDown}');
    expect(row('Ligar ao fornecedor')).toHaveFocus();

    first.focus();
    await user.keyboard('{Shift>}{F10}{/Shift}');
    const menu = await screen.findByRole('menu');
    await user.click(within(menu).getByRole('menuitem', { name: 'Remove from favourites' }));
    expect(setFavourite).toHaveBeenCalledWith('d1', false);
  });

  it('offers Add to favourites for a document that is not one', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NotesArea />);
    expect(screen.queryByRole('list', { name: 'Favourites' })).not.toBeInTheDocument();
    (await findRow('Refactor 2FA')).focus();
    await user.keyboard('{Shift>}{F10}{/Shift}');
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Add to favourites' })).toBeInTheDocument();
  });
});

describe('NotesArea — header', () => {
  it('sorts from the ⋯ menu and shows archived notes with a way back', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NotesArea />);
    await findRow('Ligar ao fornecedor');

    await user.click(screen.getByRole('button', { name: 'View options' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Title' }));
    expect(useWorkspace.getState().notesSort).toBe('title');

    await user.click(screen.getByRole('button', { name: 'View options' }));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Show archived' }));
    expect(await screen.findByText('Archived notes')).toBeInTheDocument();
    await waitFor(() =>
      expect(api.listNotes).toHaveBeenLastCalledWith({ sort: 'title', scope: 'archived' }),
    );
    await user.click(screen.getByRole('button', { name: 'Back to notes' }));
    expect(screen.queryByText('Archived notes')).not.toBeInTheDocument();
  });

  it('toggles split view; arrows load the editor while focus stays in the list', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NotesArea />);
    const toggle = await screen.findByRole('button', { name: 'Split view' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await user.click(toggle);
    expect(useWorkspace.getState().notesSplit).toBe(true);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Select a note to show it here.')).toBeInTheDocument();

    row('Ligar ao fornecedor').focus();
    await user.keyboard('{ArrowDown}');
    expect(useWorkspace.getState().focus).toEqual({ type: 'note', id: 'n2' });
    const text = await field();
    expect(editorText(text)).toBe('Comprar café\nbody');
    expect(row('Comprar café')).toHaveFocus();
    expect(row('Comprar café').closest('[aria-current]')).toHaveAttribute('aria-current', 'true');
    expect(useWorkspace.getState().history).toHaveLength(0);

    // Enter moves into the editor; Esc returns to the row.
    await user.keyboard('{Enter}');
    expect(text).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(row('Comprar café')).toHaveFocus();

    await user.keyboard('{Control>}{Shift>}\\{/Shift}{/Control}');
    expect(useWorkspace.getState().notesSplit).toBe(false);
  });

  it('keeps the split toggle visible but unavailable when the content is narrow', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ width: 600, height: 400 }),
    );
    const user = userEvent.setup();
    renderWithProviders(<NotesArea />);
    const toggle = await screen.findByRole('button', { name: 'Split view' });
    expect(toggle).toHaveAttribute('aria-disabled', 'true');
    expect(toggle).toHaveAccessibleDescription('Widen the window to use split view');
    expect(toggle.title).toMatch(/^Widen the window to use split view/);

    await user.click(toggle);
    await user.keyboard('{Control>}{Shift>}\\{/Shift}{/Control}');
    expect(useWorkspace.getState().notesSplit).toBe(false);
  });

  it('+ starts a draft that becomes the open note once it has text, in the same editor', async () => {
    vi.spyOn(api, 'createNote').mockResolvedValue(note({ id: 'n7', body: 'H', rev: 1 }));
    const user = userEvent.setup();
    renderWithProviders(<NotesArea />);
    await findRow('Ligar ao fornecedor');

    await user.click(screen.getByRole('button', { name: 'New note' }));
    expect(useWorkspace.getState().focus).toEqual({ type: 'newNote' });
    const text = await field();
    expect(text).toHaveFocus();

    await user.type(text, 'Hello');
    await waitFor(() => expect(useWorkspace.getState().focus).toEqual({ type: 'note', id: 'n7' }));
    expect(await field()).toBe(text);
    expect(editorText(text)).toBe('Hello');
    expect(text).toHaveFocus();
    expect(api.createNote).toHaveBeenCalledTimes(1);
  });
});

describe('NotesArea — states', () => {
  it('shows the empty state with one action that starts a note', async () => {
    vi.mocked(api.listNotes).mockResolvedValue([]);
    const user = userEvent.setup();
    renderWithProviders(<NotesArea />);
    expect(await screen.findByRole('heading', { name: 'No notes yet' })).toBeInTheDocument();
    expect(screen.getByText('Write something down — it saves as you type.')).toBeInTheDocument();

    const [, emptyAction] = screen.getAllByRole('button', { name: 'New note' });
    expect(emptyAction).toBeDefined();
    if (emptyAction) await user.click(emptyAction);
    expect(useWorkspace.getState().focus).toEqual({ type: 'newNote' });
  });

  it('offers "Show all spaces" when a space filter is empty', async () => {
    useWorkspace.setState({ spaceId: 'personal' });
    vi.mocked(api.listNotes).mockResolvedValue([]);
    const user = userEvent.setup();
    renderWithProviders(<NotesArea />);
    expect(
      await screen.findByRole('heading', { name: 'No notes in Personal' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show all spaces' }));
    expect(useWorkspace.getState().spaceId).toBeNull();
  });

  it('explains a loading error and retries', async () => {
    vi.mocked(api.listNotes)
      .mockRejectedValueOnce(new IpcError('storage', 'database is locked'))
      .mockResolvedValue(items);
    const user = userEvent.setup();
    renderWithProviders(<NotesArea />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Couldn’t load your notes');
    expect(alert).not.toHaveTextContent('database is locked');

    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await findRow('Ligar ao fornecedor')).toBeInTheDocument();
  });
});
