import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { installDomPolyfills, setPlatform } from '@/components/ui/test-utils';
import { api } from '@/lib/ipc/api';
import type { Settings } from '@/lib/ipc/bindings/Settings';
import { useWorkspace } from '@/state/workspace';
import { spaces } from '@/test/fixtures';
import { renderWithProviders } from '@/test/render';
import WorkspaceApp from './WorkspaceApp';

beforeAll(() => {
  installDomPolyfills();
  setPlatform('linux');
});

beforeEach(() => {
  useWorkspace.setState({
    area: 'trash',
    focus: { type: 'none' },
    history: [],
    spaceId: null,
    searchOpen: false,
  });
  vi.spyOn(api, 'appStatus').mockResolvedValue({
    version: '0.1.0',
    dataError: null,
    dataPath: null,
    schemaVersion: 1,
  });
  vi.spyOn(api, 'getSettings').mockResolvedValue({ trayNoticeShown: true } as Settings);
  vi.spyOn(api, 'listSpaces').mockResolvedValue(spaces);
  vi.spyOn(api, 'inboxCount').mockResolvedValue(0);
  vi.spyOn(api, 'listTrash').mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('WorkspaceApp shell', () => {
  it('is the title bar and the area tabs, one content region and the status bar, with no sidebar', async () => {
    renderWithProviders(<WorkspaceApp />);
    // The kit's title bar, then the area tabs under it.
    const bar = screen.getByRole('banner');
    expect(within(bar).getByText('piw')).toBeInTheDocument();
    const areas = screen.getByRole('navigation', { name: 'Areas' });
    expect(bar.compareDocumentPosition(areas) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const main = screen.getByRole('main');
    expect(await within(main).findByRole('heading', { name: 'Trash' })).toBeInTheDocument();
    const footer = screen.getByRole('contentinfo');
    expect(within(footer).getByText('PIW / All spaces')).toBeInTheDocument();
    expect(await within(footer).findByText(/in inbox/)).toBeInTheDocument();
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sidebar/i })).not.toBeInTheDocument();
  });

  it('drops a persisted space filter whose space no longer exists', async () => {
    useWorkspace.setState({ spaceId: 'gone' });
    renderWithProviders(<WorkspaceApp />);
    await waitFor(() => expect(useWorkspace.getState().spaceId).toBeNull());
  });

  it('keeps a persisted space filter whose space exists', async () => {
    useWorkspace.setState({ spaceId: 'work' });
    renderWithProviders(<WorkspaceApp />);
    await screen.findByRole('heading', { name: 'Trash' });
    expect(useWorkspace.getState().spaceId).toBe('work');
  });

  it('keeps the global shortcuts: Mod+K opens search, Mod+N starts a note', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkspaceApp />);
    await screen.findByRole('heading', { name: 'Trash' });
    await user.keyboard('{Control>}k{/Control}');
    expect(useWorkspace.getState().searchOpen).toBe(true);
    useWorkspace.setState({ searchOpen: false });
    await user.keyboard('{Control>}n{/Control}');
    expect(useWorkspace.getState().focus).toEqual({ type: 'newNote' });
  });
});
