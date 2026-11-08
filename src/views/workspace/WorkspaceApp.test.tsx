import { screen, within } from '@testing-library/react';
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
  it('is the top bar above one content region, with no sidebar and no status bar', async () => {
    renderWithProviders(<WorkspaceApp />);
    const bar = screen.getByRole('banner', { name: 'Piw' });
    expect(within(bar).getByRole('navigation', { name: 'Areas' })).toBeInTheDocument();
    const main = screen.getByRole('main');
    expect(await within(main).findByRole('heading', { name: 'Trash' })).toBeInTheDocument();
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sidebar/i })).not.toBeInTheDocument();
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
