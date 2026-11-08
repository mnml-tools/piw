import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { installDomPolyfills, setPlatform } from '@/components/ui/test-utils';
import { describeDueDate, formatDueDate } from '@/lib/dates';
import { api } from '@/lib/ipc/api';
import type { Settings } from '@/lib/ipc/bindings/Settings';
import type { Task } from '@/lib/ipc/bindings/Task';
import type { TaskQuery } from '@/lib/ipc/bindings/TaskQuery';
import { useWorkspace } from '@/state/workspace';
import { spaces, task } from '@/test/fixtures';
import { renderWithProviders } from '@/test/render';
import TasksArea from './TasksArea';

const settings = {
  captureShortcut: 'CommandOrControl+Shift+Space',
  captureSpace: 'last_used',
  lastCaptureSpaceId: null,
} as Settings;

const TODAY = '2026-11-06';

/** What `list_tasks` returns for any query (filtered like the server for "all" / "completed"). */
let server: Task[] = [];
let clock = 0;

function later(): string {
  clock += 1;
  return new Date(Date.UTC(2026, 10, 6, 11, 0, clock)).toISOString();
}

function serve(query: Partial<TaskQuery>): Task[] {
  const rows = server.filter((row) => !query.spaceId || row.spaceId === query.spaceId);
  return query.view === 'completed'
    ? rows.filter((row) => row.status === 'completed')
    : rows.filter((row) => row.status === 'open');
}

function mockCompletion() {
  return vi.spyOn(api, 'setTaskCompleted').mockImplementation(async (id, completed) => {
    const current = server.find((row) => row.id === id);
    if (!current) throw new Error('missing');
    const next: Task = {
      ...current,
      status: completed ? 'completed' : 'open',
      completedAt: completed ? later() : null,
      updatedAt: later(),
    };
    server = server.map((row) => (row.id === id ? next : row));
    return next;
  });
}

function rowTitles(): string[] {
  return screen
    .getAllByRole('listitem')
    .map((item) => within(item).getAllByRole('button')[0]!.textContent ?? '');
}

beforeAll(() => {
  installDomPolyfills();
  setPlatform('linux');
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 6, 12, 0, 0)); // Friday 6 November 2026
  server = [];
  clock = 0;
  useWorkspace.setState({
    area: 'tasks',
    tasksView: 'all',
    spaceId: null,
    drawerTaskId: null,
    selectedTaskId: null,
    addTaskRequest: 0,
  });
  vi.spyOn(api, 'listTasks').mockImplementation(async (query = {}) => serve(query));
  vi.spyOn(api, 'countCompletedTasks').mockImplementation(
    async () => server.filter((row) => row.status === 'completed').length,
  );
  vi.spyOn(api, 'listSpaces').mockResolvedValue(spaces);
  vi.spyOn(api, 'getSettings').mockResolvedValue(settings);
  vi.spyOn(api, 'listTags').mockResolvedValue([]);
  vi.spyOn(api, 'listNotes').mockResolvedValue([]);
  vi.spyOn(api, 'getTask').mockImplementation(async (id) => ({
    task: server.find((row) => row.id === id) ?? task({ id }),
    subtasks: [],
    parentTitle: null,
  }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function setup() {
  const user = userEvent.setup();
  const view = renderWithProviders(<TasksArea />);
  /** Simulates the `piw://changed` event that follows every write. */
  const changed = () => act(() => view.client.invalidateQueries());
  return { user, changed, ...view };
}

describe('TasksArea', () => {
  it('CA-02: a task with no metadata appears and completes with one click', async () => {
    const { user, changed } = setup();
    expect(await screen.findByRole('heading', { name: 'No tasks' })).toBeInTheDocument();

    vi.spyOn(api, 'createTask').mockImplementation(async (input) => {
      const created = task({ id: 't1', title: input.title, spaceId: input.spaceId ?? 'work' });
      server = [...server, created];
      return created;
    });
    const add = screen.getByRole('textbox', { name: 'Add task' });
    await user.type(add, 'Comprar café{Enter}');
    expect(api.createTask).toHaveBeenCalledWith({ title: 'Comprar café', spaceId: 'work' });
    await changed();

    const box = await screen.findByRole('checkbox', { name: 'Comprar café' });
    const complete = mockCompletion();
    await user.click(box);
    expect(complete).toHaveBeenCalledWith('t1', true);
    await changed();
    expect(api.listTasks).toHaveBeenLastCalledWith({ view: 'all' });
    // The list no longer contains it, but the row stays (checked) until the view changes.
    expect(screen.getByRole('checkbox', { name: 'Comprar café' })).toBeChecked();
  });

  it('renders the All sections with an Overdue count and accessible due dates', async () => {
    server = [
      task({ id: 'late', title: 'Enviar fatura', dueDate: '2026-11-03' }),
      task({
        id: 'now',
        title: 'Adicionar testes',
        dueDate: '2026-11-06',
        subtaskCount: 3,
        subtaskDone: 1,
      }),
      task({ id: 'soon', title: 'Rever PR', dueDate: '2026-11-10' }),
      task({ id: 'free', title: 'Comprar café', spaceId: 'personal' }),
    ];
    setup();
    for (const name of [
      'Overdue, 1 task',
      'Today, 1 task',
      'Upcoming, 1 task',
      'No date, 1 task',
    ]) {
      expect(await screen.findByRole('heading', { level: 2, name })).toBeInTheDocument();
    }
    expect(screen.getByRole('checkbox', { name: 'Enviar fatura' })).toHaveAccessibleDescription(
      `${describeDueDate('2026-11-03', TODAY)}, Work`, // "Overdue, 3 November, Work"
    );
    expect(screen.getByRole('checkbox', { name: 'Adicionar testes' })).toHaveAccessibleDescription(
      `${describeDueDate(TODAY, TODAY)}, Work, 1 of 3 subtasks done`,
    );
    expect(screen.getByRole('checkbox', { name: 'Comprar café' })).toHaveAccessibleDescription(
      'Personal',
    );
    // The Today heading already says the date: the row leaves it out, the description keeps it.
    const now = screen
      .getByRole('checkbox', { name: 'Adicionar testes' })
      .closest('[data-task-id]');
    expect(within(now as HTMLElement).queryByText('Today')).not.toBeInTheDocument();
    const soon = screen.getByRole('checkbox', { name: 'Rever PR' }).closest('[data-task-id]');
    expect(soon).toHaveTextContent(formatDueDate('2026-11-10', TODAY));
  });

  it('shows at most 5 overdue rows, then "Show N more"', async () => {
    server = Array.from({ length: 7 }, (_, i) =>
      task({ id: `o${i}`, title: `Late ${i}`, dueDate: '2026-11-01', sortOrder: i }),
    );
    const { user } = setup();
    await screen.findByRole('heading', { name: 'Overdue, 7 tasks' });
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    await user.click(screen.getByRole('button', { name: 'Show 2 more' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(7);
    expect(screen.getByRole('checkbox', { name: 'Late 5' })).toHaveFocus();
  });

  it('keeps a completed row in place after the refetch drops it', async () => {
    server = ['A', 'B', 'C'].map((title, i) => task({ id: title, title, sortOrder: i }));
    const { user, changed } = setup();
    const complete = mockCompletion();
    await user.click(await screen.findByRole('checkbox', { name: 'B' }));
    await waitFor(() => expect(complete).toHaveBeenCalledWith('B', true));
    await changed();
    expect(serve({ view: 'all' }).map((row) => row.id)).toEqual(['A', 'C']);

    expect(rowTitles()).toEqual(['A', 'B', 'C']);
    const box = screen.getByRole('checkbox', { name: 'B' });
    expect(box).toBeChecked();
    expect(box.closest('[data-task-id]')).toHaveAttribute('data-completed');

    // Unchecking restores it, still in place.
    await user.click(box);
    await changed();
    expect(rowTitles()).toEqual(['A', 'B', 'C']);
    expect(screen.getByRole('checkbox', { name: 'B' })).not.toBeChecked();
  });

  it('forgets kept rows when the user leaves the view', async () => {
    server = ['A', 'B'].map((title, i) => task({ id: title, title, sortOrder: i }));
    const { user, changed } = setup();
    mockCompletion();
    await user.click(await screen.findByRole('checkbox', { name: 'A' }));
    await changed();
    expect(screen.getByRole('checkbox', { name: 'A' })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Completed' }));
    await screen.findByRole('checkbox', { name: 'A' });
    await user.click(screen.getByRole('radio', { name: 'All' }));
    await screen.findByRole('checkbox', { name: 'B' });
    expect(screen.queryByRole('checkbox', { name: 'A' })).not.toBeInTheDocument();
  });

  it('moves with arrows / j k / Home End, toggles with Space and opens with Enter', async () => {
    server = ['A', 'B', 'C'].map((title, i) => task({ id: title, title, sortOrder: i }));
    const { user } = setup();
    const complete = mockCompletion();
    const first = await screen.findByRole('checkbox', { name: 'A' });
    // One tab stop for the whole list.
    expect(screen.getAllByRole('checkbox').filter((box) => box.tabIndex === 0)).toEqual([first]);
    first.focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('checkbox', { name: 'B' })).toHaveFocus();
    await user.keyboard('j');
    expect(screen.getByRole('checkbox', { name: 'C' })).toHaveFocus();
    await user.keyboard('k');
    expect(screen.getByRole('checkbox', { name: 'B' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('checkbox', { name: 'C' })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(first).toHaveFocus();

    await user.keyboard(' ');
    expect(complete).toHaveBeenCalledWith('A', true);
    expect(first).toBeChecked();

    await user.keyboard('{ArrowDown}{Enter}');
    expect(useWorkspace.getState().drawerTaskId).toBe('B');
    expect(await screen.findByRole('region', { name: 'Task details' })).toBeInTheDocument();
  });

  it('the drawer follows the selection and Esc gives focus back to the row', async () => {
    server = ['A', 'B'].map((title, i) => task({ id: title, title, sortOrder: i }));
    const { user } = setup();
    const first = await screen.findByRole('checkbox', { name: 'A' });
    first.focus();
    await user.keyboard('{Enter}');
    const drawer = await screen.findByRole('region', { name: 'Task details' });
    await waitFor(() =>
      expect(within(drawer).getByRole('textbox', { name: 'Title' })).toHaveValue('A'),
    );
    first.focus();
    await user.keyboard('{ArrowDown}');
    expect(useWorkspace.getState().drawerTaskId).toBe('B');
    await waitFor(() =>
      expect(within(drawer).getByRole('textbox', { name: 'Title' })).toHaveValue('B'),
    );
    within(drawer).getByRole('textbox', { name: 'Title' }).focus();
    await user.keyboard('{Escape}');
    expect(useWorkspace.getState().drawerTaskId).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'B' })).toHaveFocus();
  });

  it('Delete moves the task to Trash with an undo toast', async () => {
    server = [task({ id: 't1', title: 'Comprar café' }), task({ id: 't2', title: 'Ligar' })];
    const { user } = setup();
    const trash = vi.spyOn(api, 'trashTask').mockResolvedValue();
    const restore = vi.spyOn(api, 'restoreTask').mockResolvedValue(false);
    (await screen.findByRole('checkbox', { name: 'Comprar café' })).focus();
    await user.keyboard('{Delete}');
    expect(trash).toHaveBeenCalledWith('t1');
    expect(await screen.findByText('“Comprar café” moved to Trash')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Ligar' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(restore).toHaveBeenCalledWith('t1');
  });

  it('Alt+↓ reorders within No date and keeps focus on the moved row', async () => {
    server = ['A', 'B', 'C'].map((title, i) => task({ id: title, title, sortOrder: i }));
    const { user } = setup();
    const reorder = vi.spyOn(api, 'reorderTasks').mockResolvedValue();
    (await screen.findByRole('checkbox', { name: 'A' })).focus();
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');
    expect(reorder).toHaveBeenCalledWith(['B', 'A', 'C']);
    expect(rowTitles()).toEqual(['B', 'A', 'C']);
    expect(screen.getByRole('checkbox', { name: 'A' })).toHaveFocus();
  });

  it('dated sections are not reorderable', async () => {
    server = [
      task({ id: 'a', title: 'A', dueDate: '2026-11-10' }),
      task({ id: 'b', title: 'B', dueDate: '2026-11-11' }),
    ];
    const { user } = setup();
    const reorder = vi.spyOn(api, 'reorderTasks').mockResolvedValue();
    (await screen.findByRole('checkbox', { name: 'A' })).focus();
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');
    expect(reorder).not.toHaveBeenCalled();
  });

  describe('Add task', () => {
    it('inherits Today (removable) and the space filter (named, not a chip), and keeps focus', async () => {
      useWorkspace.setState({ tasksView: 'today', spaceId: 'personal' });
      const { user } = setup();
      const create = vi
        .spyOn(api, 'createTask')
        .mockImplementation(async (input) =>
          task({ id: 'n', ...input, dueDate: input.dueDate ?? null }),
        );
      const add = await screen.findByRole('textbox', { name: 'Add task' });
      // The space filter has one place (the toolbar / shell), never a chip in the add row.
      await waitFor(() =>
        expect(add).toHaveAccessibleDescription('New tasks: due Today, in Personal'),
      );
      expect(screen.queryByRole('button', { name: 'Don’t add to Personal' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Due date: Today' })).toBeInTheDocument();

      await user.type(add, 'Ligar ao fornecedor{Enter}');
      expect(create).toHaveBeenCalledWith({
        title: 'Ligar ao fornecedor',
        spaceId: 'personal',
        dueDate: '2026-11-06',
      });
      await waitFor(() => expect(add).toHaveValue(''));
      expect(add).toHaveFocus();

      await user.click(screen.getByRole('button', { name: 'Remove date' }));
      await user.type(add, 'Sem data{Enter}');
      expect(create).toHaveBeenLastCalledWith({ title: 'Sem data', spaceId: 'personal' });
    });

    it('defaults to Tomorrow in Upcoming', async () => {
      useWorkspace.setState({ tasksView: 'upcoming' });
      const { user } = setup();
      const create = vi.spyOn(api, 'createTask').mockResolvedValue(task({ id: 'n' }));
      const add = await screen.findByRole('textbox', { name: 'Add task' });
      await screen.findByRole('button', { name: 'Due date: Tomorrow' });
      await user.type(add, 'Rever PR{Enter}');
      expect(create).toHaveBeenCalledWith({
        title: 'Rever PR',
        spaceId: 'work',
        dueDate: '2026-11-07',
      });
    });

    it('keeps the text when creating fails', async () => {
      const { user } = setup();
      vi.spyOn(api, 'createTask').mockRejectedValue(new Error('disk full'));
      const add = await screen.findByRole('textbox', { name: 'Add task' });
      await user.type(add, 'Não perder{Enter}');
      expect(
        await screen.findByText('Couldn’t add the task. Your text is kept.'),
      ).toBeInTheDocument();
      expect(add).toHaveValue('Não perder');
    });

    it('Mod+T focuses it, leaving Completed for All', async () => {
      useWorkspace.setState({ tasksView: 'completed' });
      setup();
      await screen.findByRole('heading', { name: 'No completed tasks yet' });
      expect(screen.queryByRole('textbox', { name: 'Add task' })).not.toBeInTheDocument();
      act(() => useWorkspace.getState().requestAddTask());
      const add = await screen.findByRole('textbox', { name: 'Add task' });
      expect(useWorkspace.getState().tasksView).toBe('all');
      await waitFor(() => expect(add).toHaveFocus());
    });
  });

  describe('views and states', () => {
    it('filters by the active space', async () => {
      useWorkspace.setState({ spaceId: 'work' });
      server = [
        task({ id: 'w', title: 'Work task' }),
        task({ id: 'p', title: 'Home', spaceId: 'personal' }),
      ];
      setup();
      await screen.findByRole('checkbox', { name: 'Work task' });
      expect(api.listTasks).toHaveBeenCalledWith({ view: 'all', spaceId: 'work' });
      expect(screen.queryByRole('checkbox', { name: 'Home' })).not.toBeInTheDocument();
    });

    it('All shows "Show N completed", which opens Completed', async () => {
      server = [
        task({ id: 'o', title: 'Open' }),
        task({ id: 'd', title: 'Done', status: 'completed' }),
      ];
      const { user } = setup();
      const show = await screen.findByRole('button', { name: 'Show 1 completed task' });
      expect(show).toHaveTextContent('Show 1 completed');
      await user.click(show);
      expect(useWorkspace.getState().tasksView).toBe('completed');
      expect(await screen.findByRole('checkbox', { name: 'Done' })).toBeChecked();
    });

    it('shows one empty state per view, with one action', async () => {
      useWorkspace.setState({ tasksView: 'today' });
      const { user } = setup();
      expect(await screen.findByRole('heading', { name: 'Nothing due today' })).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Show all tasks' }));
      expect(useWorkspace.getState().tasksView).toBe('all');
      expect(await screen.findByRole('heading', { name: 'No tasks' })).toBeInTheDocument();
      expect(
        screen.getByText('Add one here, or press Ctrl+Shift+Space in any app.'),
      ).toBeInTheDocument();
    });

    it('offers Show all spaces when a space filter hides everything', async () => {
      useWorkspace.setState({ spaceId: 'personal' });
      const { user } = setup();
      await user.click(await screen.findByRole('button', { name: 'Show all spaces' }));
      expect(useWorkspace.getState().spaceId).toBeNull();
    });

    it('shows an error with Try again', async () => {
      vi.mocked(api.listTasks).mockRejectedValueOnce(new Error('boom'));
      server = [task({ id: 'a', title: 'Back again' })];
      const { user } = setup();
      expect(
        await screen.findByRole('heading', { name: 'Couldn’t load your tasks' }),
      ).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Try again' }));
      expect(await screen.findByRole('checkbox', { name: 'Back again' })).toBeInTheDocument();
    });
  });
});
