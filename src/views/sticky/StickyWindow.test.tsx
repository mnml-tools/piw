import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { installDomPolyfills, setPlatform } from '@/components/ui/test-utils';
import { todayString } from '@/lib/dates';
import { api } from '@/lib/ipc/api';
import type { StickyRecord } from '@/lib/ipc/bindings/StickyRecord';
import type { VaultNote } from '@/lib/ipc/bindings/VaultNote';
import { renderWithProviders } from '@/test/render';
import StickyWindow from './StickyWindow';

const TARGET = { kind: 'vault_note', id: 'n1' } as const;
const PATH = 'Work/Fornecedor.md';

/** The editor's lines as shown (rendered Markdown, markers hidden while unfocused). */
function lines(field: HTMLElement): string[] {
  return [...field.querySelectorAll('.cm-line')].map((line) => line.textContent ?? '');
}

function note(text: string): VaultNote {
  return { path: PATH, title: 'Fornecedor', space: 'Work', text, hash: 'h1' };
}

function record(overrides: Partial<StickyRecord> = {}): StickyRecord {
  return {
    placement: { x: null, y: null, width: 300, height: 260, alwaysOnTop: false },
    color: null,
    isOpen: true,
    ...overrides,
  };
}

beforeAll(() => {
  installDomPolyfills();
  setPlatform('linux');
});

beforeEach(() => {
  vi.spyOn(api, 'getSticky').mockResolvedValue(record());
  vi.spyOn(api, 'vaultStickyView').mockResolvedValue({
    kind: 'note',
    path: PATH,
    title: 'Fornecedor',
  });
  vi.spyOn(api, 'vaultReadNote').mockResolvedValue(
    note('Ligar ao fornecedor\nPedir orçamento revisto.'),
  );
  vi.spyOn(api, 'setStickyColor').mockResolvedValue();
  vi.spyOn(api, 'setStickyAlwaysOnTop').mockResolvedValue();
  vi.spyOn(api, 'closeSticky').mockResolvedValue();
});
afterEach(() => vi.restoreAllMocks());

describe('StickyWindow', () => {
  it('keeps the drag strip and every control reachable by name', async () => {
    renderWithProviders(<StickyWindow target={TARGET} />);
    const field = await screen.findByRole('textbox', { name: 'Note text' });
    expect(lines(field)).toEqual(['Ligar ao fornecedor', 'Pedir orçamento revisto.']);

    const strip = screen.getByRole('banner');
    expect(strip).toHaveAttribute('data-tauri-drag-region');
    for (const name of ['Keep on top', 'Open in Piw', 'More actions', 'Hide from desktop']) {
      expect(within(strip).getByRole('button', { name })).toBeInTheDocument();
    }
    expect(await within(strip).findByText('Fornecedor')).toBeInTheDocument();

    await userEvent.click(within(strip).getByRole('button', { name: 'Hide from desktop' }));
    expect(api.closeSticky).toHaveBeenCalledWith(TARGET);
  });

  it('titles a task view with its view and space', async () => {
    vi.mocked(api.vaultStickyView).mockResolvedValue({
      kind: 'tasks',
      view: 'today',
      space: 'Work',
    });
    vi.spyOn(api, 'vaultTasks').mockResolvedValue([]);
    renderWithProviders(<StickyWindow target={{ kind: 'vault_tasks', id: 'today' }} />);
    expect(await within(screen.getByRole('banner')).findByText('Today · Work')).toBeInTheDocument();
  });

  it('applies the palette and lists the colours, with swatches, in More', async () => {
    vi.mocked(api.getSticky).mockResolvedValue(record({ color: 'peach' }));
    const { container } = renderWithProviders(<StickyWindow target={TARGET} />);
    await waitFor(() =>
      expect(container.querySelector('[data-sticky-color]')).toHaveAttribute(
        'data-sticky-color',
        'peach',
      ),
    );

    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    const menu = await screen.findByRole('menu');
    const labels = within(menu)
      .getAllByRole('menuitemradio')
      .map((item) => item.textContent);
    expect(labels).toEqual(['Warm gray', 'Yellow', 'Clay', 'Rose', 'Sage', 'Blue', 'Lavender']);
    expect(within(menu).getByRole('menuitemradio', { name: 'Clay' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(within(menu).getByRole('menuitem', { name: 'Remove from desktop' })).toBeInTheDocument();

    await userEvent.click(within(menu).getByRole('menuitemradio', { name: 'Sage' }));
    expect(api.setStickyColor).toHaveBeenCalledWith(TARGET, 'mint');
  });

  it('shows keep-on-top as a pressed toggle and turns it off', async () => {
    vi.mocked(api.getSticky).mockResolvedValue(
      record({ placement: { x: 0, y: 0, width: 300, height: 260, alwaysOnTop: true } }),
    );
    renderWithProviders(<StickyWindow target={TARGET} />);
    const toggle = await screen.findByRole('button', { name: 'Stop keeping on top' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(toggle);
    expect(api.setStickyAlwaysOnTop).toHaveBeenCalledWith(TARGET, false);
  });

  it('renders the note as Markdown, counts its task items and ticks them', async () => {
    vi.mocked(api.vaultReadNote).mockResolvedValue(
      note('## Mykid\n\n- [x] Verify archive bug\n- [ ] Reply to **Rita**'),
    );
    const write = vi
      .spyOn(api, 'vaultWriteNote')
      .mockImplementation(async (_path, text) => ({ ...note(text), hash: 'h2' }));
    renderWithProviders(<StickyWindow target={TARGET} />);
    const field = await screen.findByRole('textbox', { name: 'Note text' });
    expect(lines(field)).toEqual(['Mykid', '', 'Verify archive bug', 'Reply to Rita']);

    const strip = screen.getByRole('banner');
    expect(within(strip).getByLabelText('1 of 2 done')).toHaveTextContent('1/2');

    const reply = within(field).getByRole('checkbox', { name: 'Reply to **Rita**' });
    expect(reply).not.toBeChecked();
    await userEvent.pointer({ keys: '[MouseLeft>]', target: reply });
    expect(within(strip).getByLabelText('2 of 2 done')).toBeInTheDocument();
    await waitFor(() =>
      expect(write).toHaveBeenCalledWith(
        PATH,
        `## Mykid\n\n- [x] Verify archive bug\n- [x] Reply to **Rita** ✅ ${todayString()}`,
        'h1',
      ),
    );
  });
});
