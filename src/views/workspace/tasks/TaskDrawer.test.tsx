import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { installDomPolyfills, setPlatform } from '@/components/ui/test-utils';
import { api } from '@/lib/ipc/api';
import type { TaskDetail } from '@/lib/ipc/bindings/TaskDetail';
import { IpcError } from '@/lib/ipc/client';
import { spaces, task } from '@/test/fixtures';
import { renderWithProviders } from '@/test/render';
import { TaskDrawer } from './TaskDrawer';

let detail: TaskDetail;

function withTask(
  overrides: Parameters<typeof task>[0] = {},
  subtasks: TaskDetail['subtasks'] = [],
) {
  detail = {
    task: task({ id: 't1', title: 'Comprar café', rev: 3, ...overrides }),
    subtasks,
    parentTitle: null,
  };
}

function subtask(id: string, title: string, completed = false) {
  return task({
    id,
    title,
    parentTaskId: 't1',
    status: completed ? 'completed' : 'open',
    rev: 1,
  });
}

beforeAll(() => {
  installDomPolyfills();
  setPlatform('linux');
});

beforeEach(() => {
  withTask();
  vi.spyOn(api, 'getTask').mockImplementation(async () => detail);
  vi.spyOn(api, 'listSpaces').mockResolvedValue(spaces);
  vi.spyOn(api, 'listTags').mockResolvedValue([]);
  vi.spyOn(api, 'listNotes').mockResolvedValue([]);
});

afterEach(() => vi.restoreAllMocks());

async function setup() {
  const onClose = vi.fn();
  const user = userEvent.setup();
  const view = renderWithProviders(<TaskDrawer taskId="t1" onClose={onClose} mode="docked" />);
  const region = await screen.findByRole('region', { name: 'Task details' });
  const title = await within(region).findByRole('textbox', { name: 'Title' });
  const changed = () => act(() => view.client.invalidateQueries());
  return { user, onClose, region, title, changed, ...view };
}

describe('TaskDrawer', () => {
  it('autosaves the title with the expected revision', async () => {
    const save = vi
      .spyOn(api, 'updateTaskText')
      .mockImplementation(async (id, _rev, patch) => task({ id, ...patch, rev: 4 }));
    const { user, title } = await setup();
    expect(title).toHaveValue('Comprar café');
    await user.type(title, ' moído');
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith('t1', 3, { title: 'Comprar café moído', description: '' }),
    );
    expect(save).toHaveBeenCalledTimes(1);

    // The next save uses the new revision.
    await user.type(screen.getByRole('textbox', { name: 'Description' }), 'Na loja');
    await waitFor(() =>
      expect(save).toHaveBeenLastCalledWith('t1', 4, {
        title: 'Comprar café moído',
        description: 'Na loja',
      }),
    );
  });

  it('never saves an empty title: it shows a hint and reverts on blur', async () => {
    const save = vi.spyOn(api, 'updateTaskText');
    const { user, title } = await setup();
    await user.clear(title);
    expect(screen.getByText('A task needs a title')).toBeInTheDocument();
    expect(title).toHaveAccessibleDescription('A task needs a title');
    await user.tab();
    expect(title).toHaveValue('Comprar café');
    expect(screen.queryByText('A task needs a title')).not.toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it('on a conflict shows Reload / Keep mine and never overwrites silently', async () => {
    const save = vi
      .spyOn(api, 'updateTaskText')
      .mockRejectedValueOnce(new IpcError('conflict', 'stale revision'))
      .mockImplementation(async (id, rev, patch) => task({ id, ...patch, rev: rev + 1 }));
    const { user, title } = await setup();
    await user.type(title, '!');
    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent('Changed in another window');
    expect(save).toHaveBeenCalledTimes(1);

    // Another window saved revision 5 meanwhile.
    withTask({ title: 'Comprar chá', rev: 5 });
    await user.click(within(banner).getByRole('button', { name: 'Keep mine' }));
    await waitFor(() =>
      expect(save).toHaveBeenLastCalledWith('t1', 5, { title: 'Comprar café!', description: '' }),
    );
    expect(title).toHaveValue('Comprar café!');
  });

  it('Reload adopts the other window’s text', async () => {
    vi.spyOn(api, 'updateTaskText').mockRejectedValue(new IpcError('conflict', 'stale'));
    const { user, title } = await setup();
    await user.type(title, '!');
    const banner = await screen.findByRole('alert');
    withTask({ title: 'Comprar chá', rev: 5 });
    await user.click(within(banner).getByRole('button', { name: 'Reload' }));
    await waitFor(() => expect(title).toHaveValue('Comprar chá'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows changes made in other windows live while nothing is pending', async () => {
    const { title, changed } = await setup();
    withTask({ title: 'Comprar café (sticky)', description: 'Editado', rev: 4 });
    await changed();
    await waitFor(() => expect(title).toHaveValue('Comprar café (sticky)'));
    expect(screen.getByRole('textbox', { name: 'Description' })).toHaveValue('Editado');
  });

  it('completes the task from its checkbox', async () => {
    const complete = vi
      .spyOn(api, 'setTaskCompleted')
      .mockResolvedValue(task({ id: 't1', status: 'completed' }));
    const { user, region } = await setup();
    const box = within(region).getByRole('checkbox', { name: 'Comprar café' });
    await user.click(box);
    expect(complete).toHaveBeenCalledWith('t1', true);
    expect(box).toBeChecked();
  });

  it('Esc closes the drawer', async () => {
    const { user, onClose, title } = await setup();
    title.focus();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  describe('subtasks', () => {
    beforeEach(() => {
      withTask({ subtaskCount: 2, subtaskDone: 1 }, [
        subtask('s1', 'Testar serviço TOTP', true),
        subtask('s2', 'Testar recuperação'),
      ]);
    });

    it('lists them with their progress and toggles them', async () => {
      const complete = vi
        .spyOn(api, 'setTaskCompleted')
        .mockResolvedValue(subtask('s2', 'Testar recuperação', true));
      const { user } = await setup();
      expect(screen.getByRole('heading', { name: 'Subtasks, 1 of 2 done' })).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: 'Testar serviço TOTP' })).toBeChecked();
      await user.click(screen.getByRole('checkbox', { name: 'Testar recuperação' }));
      expect(complete).toHaveBeenCalledWith('s2', true);
      expect(screen.getByRole('heading', { name: 'Subtasks, 2 of 2 done' })).toBeInTheDocument();
    });

    it('Enter in "Add subtask" adds one and keeps focus for the next', async () => {
      const create = vi
        .spyOn(api, 'createTask')
        .mockResolvedValue(subtask('s3', 'Testar migração'));
      const { user } = await setup();
      const add = screen.getByRole('textbox', { name: 'Add subtask' });
      await user.type(add, 'Testar migração{Enter}');
      expect(create).toHaveBeenCalledWith({ title: 'Testar migração', parentTaskId: 't1' });
      await waitFor(() => expect(add).toHaveValue(''));
      expect(add).toHaveFocus();
    });

    it('Backspace on an empty subtask deletes it with an undo toast', async () => {
      const trash = vi.spyOn(api, 'trashTask').mockResolvedValue();
      const restore = vi.spyOn(api, 'restoreTask').mockResolvedValue(false);
      const save = vi.spyOn(api, 'updateTaskText');
      const { user } = await setup();
      const [first, second] = screen.getAllByRole('textbox', { name: 'Subtask title' });
      await user.clear(second!);
      await user.keyboard('{Backspace}');
      expect(trash).toHaveBeenCalledWith('s2');
      expect(first).toHaveFocus();
      expect(await screen.findByText('Subtask “Testar recuperação” deleted')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Undo' }));
      expect(restore).toHaveBeenCalledWith('s2');
      expect(save).not.toHaveBeenCalled();
    });

    it('Alt+↑ reorders subtasks', async () => {
      const reorder = vi.spyOn(api, 'reorderTasks').mockResolvedValue();
      const { user } = await setup();
      const second = screen.getAllByRole('textbox', { name: 'Subtask title' })[1]!;
      second.focus();
      await user.keyboard('{Alt>}{ArrowUp}{/Alt}');
      expect(reorder).toHaveBeenCalledWith(['s2', 's1']);
      const titles = screen
        .getAllByRole('textbox', { name: 'Subtask title' })
        .map((input) => (input as HTMLInputElement).value);
      expect(titles).toEqual(['Testar recuperação', 'Testar serviço TOTP']);
      await waitFor(() =>
        expect(screen.getAllByRole('textbox', { name: 'Subtask title' })[0]).toHaveFocus(),
      );
    });
  });

  describe('properties and actions', () => {
    it('shows empty properties as actions, never "None"', async () => {
      await setup();
      expect(screen.getByRole('button', { name: 'Due date: Add date' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Link to document…' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Add tag' })).toBeInTheDocument();
      expect(screen.queryByText(/none/i)).not.toBeInTheDocument();
    });

    it('adds a tag', async () => {
      const setTags = vi.spyOn(api, 'setTaskTags').mockResolvedValue(['compras']);
      const { user } = await setup();
      await user.click(screen.getByRole('button', { name: 'Add tag' }));
      await user.type(screen.getByRole('combobox', { name: 'Tag name' }), '#compras{Enter}');
      expect(setTags).toHaveBeenCalledWith('t1', ['compras']);
    });

    it('opens the linked document', async () => {
      withTask({ documentId: 'd1', documentTitle: 'Refactor 2FA' });
      vi.spyOn(api, 'getDocument').mockResolvedValue({
        note: {} as never,
        tabs: [
          { id: 'tab-content', kind: 'content' } as never,
          { id: 'tab-tasks', kind: 'tasks' } as never,
        ],
      });
      const { user } = await setup();
      expect(screen.getByText('Refactor 2FA')).toBeInTheDocument();
      await waitFor(() => expect(api.getDocument).toHaveBeenCalledWith('d1'));
      const { useWorkspace } = await import('@/state/workspace');
      await user.click(screen.getByRole('button', { name: 'Open document' }));
      await waitFor(() =>
        expect(useWorkspace.getState().focus).toEqual({
          type: 'document',
          id: 'd1',
          tabId: 'tab-tasks',
        }),
      );
    });

    it('pins to the desktop', async () => {
      const pin = vi.spyOn(api, 'openSticky').mockResolvedValue(1);
      const { user, region } = await setup();
      await user.click(within(region).getByRole('button', { name: 'Pin to desktop' }));
      expect(pin).toHaveBeenCalledWith({ kind: 'task', id: 't1' });
    });

    it('moves to Trash from ⋯ with an undo toast, then closes', async () => {
      const trash = vi.spyOn(api, 'trashTask').mockResolvedValue();
      const { user, onClose, region } = await setup();
      await user.click(within(region).getByRole('button', { name: 'More actions' }));
      await user.click(await screen.findByRole('menuitem', { name: 'Move to Trash' }));
      expect(trash).toHaveBeenCalledWith('t1');
      await waitFor(() => expect(onClose).toHaveBeenCalled());
      expect(await screen.findByText('“Comprar café” moved to Trash')).toBeInTheDocument();
    });

    it('says when the task is no longer available', async () => {
      withTask({ deletedAt: '2026-11-06T10:00:00.000Z' });
      renderWithProviders(<TaskDrawer taskId="t1" onClose={() => {}} />);
      expect(
        await screen.findByRole('heading', { name: 'This task is no longer available' }),
      ).toBeInTheDocument();
    });
  });
});
