import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { installDomPolyfills, setPlatform } from '@/components/ui/test-utils';
import { api } from '@/lib/ipc/api';
import { useWorkspace } from '@/state/workspace';
import { spaces } from '@/test/fixtures';
import { renderWithProviders } from '@/test/render';
import { TopBar } from './TopBar';

function setNarrow(matches: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  );
}

function renderBar(onNewDocument = vi.fn()) {
  renderWithProviders(<TopBar onNewDocument={onNewDocument} />);
  return onNewDocument;
}

beforeAll(() => {
  installDomPolyfills();
  setPlatform('linux');
});

beforeEach(() => {
  setNarrow(false);
  useWorkspace.setState({
    area: 'tasks',
    focus: { type: 'none' },
    history: [],
    spaceId: null,
    searchOpen: false,
  });
  vi.spyOn(api, 'listSpaces').mockResolvedValue(spaces);
  vi.spyOn(api, 'inboxCount').mockResolvedValue(3);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('TopBar', () => {
  it('shows the areas as navigation with the current one marked', async () => {
    const user = userEvent.setup();
    renderBar();
    const nav = screen.getByRole('navigation', { name: 'Areas' });
    const tasks = within(nav).getByRole('button', { name: 'Tasks' });
    expect(tasks).toHaveAttribute('aria-current', 'page');
    expect(tasks).toHaveAttribute('aria-keyshortcuts', 'Control+3');

    expect(
      await within(nav).findByRole('button', { name: 'Inbox, 3 unorganised' }),
    ).not.toHaveAttribute('aria-current');

    await user.click(within(nav).getByRole('button', { name: 'Notes' }));
    expect(useWorkspace.getState().area).toBe('notes');
    expect(within(nav).getByRole('button', { name: 'Notes' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('opens the search palette and reaches Trash and Settings', async () => {
    const user = userEvent.setup();
    renderBar();
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(useWorkspace.getState().searchOpen).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Trash' }));
    expect(useWorkspace.getState().area).toBe('trash');
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(useWorkspace.getState().area).toBe('settings');
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('creates a note, a task or a document from the New menu', async () => {
    const user = userEvent.setup();
    const onNewDocument = renderBar();
    await user.click(screen.getByRole('button', { name: 'New' }));
    await user.click(await screen.findByRole('menuitem', { name: /New document/ }));
    expect(onNewDocument).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'New' }));
    await user.click(await screen.findByRole('menuitem', { name: /New note/ }));
    expect(useWorkspace.getState().focus).toEqual({ type: 'newNote' });
  });

  it('filters by space and edits or creates spaces from the switcher', async () => {
    const user = userEvent.setup();
    renderBar();
    await user.click(screen.getByRole('button', { name: 'Space filter: All spaces' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Work' }));
    expect(useWorkspace.getState().spaceId).toBe('work');

    await user.click(screen.getByRole('button', { name: 'Space filter: Work' }));
    expect(await screen.findByRole('menuitem', { name: 'Rename…' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Colour' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Delete…' })).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'New space…' }));
    expect(await screen.findByRole('dialog', { name: 'New space' })).toBeInTheDocument();
  });

  it('folds the areas into a menu and search into an icon in narrow windows', async () => {
    setNarrow(true);
    const user = userEvent.setup();
    renderBar();
    expect(screen.queryByRole('navigation', { name: 'Areas' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Search' })).not.toHaveTextContent('Search');

    await user.click(screen.getByRole('button', { name: 'Go to: Tasks' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Pinned' }));
    expect(useWorkspace.getState().area).toBe('pinned');
  });
});
