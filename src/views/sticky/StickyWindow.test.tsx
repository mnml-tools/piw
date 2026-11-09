import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { installDomPolyfills, setPlatform } from '@/components/ui/test-utils';
import { api } from '@/lib/ipc/api';
import type { StickyRecord } from '@/lib/ipc/bindings/StickyRecord';
import { note, task } from '@/test/fixtures';
import { renderWithProviders } from '@/test/render';
import StickyWindow from './StickyWindow';

/** The editor's lines as shown (rendered Markdown, markers hidden while unfocused). */
function lines(field: HTMLElement): string[] {
  return [...field.querySelectorAll('.cm-line')].map((line) => line.textContent ?? '');
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
  vi.spyOn(api, 'getNote').mockResolvedValue(
    note({ body: 'Ligar ao fornecedor\nPedir orçamento revisto.' }),
  );
  vi.spyOn(api, 'setStickyColor').mockResolvedValue();
  vi.spyOn(api, 'setStickyAlwaysOnTop').mockResolvedValue();
  vi.spyOn(api, 'closeSticky').mockResolvedValue();
});
afterEach(() => vi.restoreAllMocks());

describe('StickyWindow', () => {
  it('keeps the drag strip and every control reachable by name', async () => {
    renderWithProviders(<StickyWindow target={{ kind: 'note', id: 'n1' }} />);
    const field = await screen.findByRole('textbox', { name: 'Note text' });
    expect(lines(field)).toEqual(['Ligar ao fornecedor', 'Pedir orçamento revisto.']);

    const strip = screen.getByRole('banner');
    expect(strip).toHaveAttribute('data-tauri-drag-region');
    for (const name of ['Keep on top', 'Open in Piw', 'More actions', 'Hide from desktop']) {
      expect(within(strip).getByRole('button', { name })).toBeInTheDocument();
    }
    // A quick note's title is its first line: the strip does not repeat it.
    expect(within(strip).queryByText('Ligar ao fornecedor')).not.toBeInTheDocument();

    await userEvent.click(within(strip).getByRole('button', { name: 'Hide from desktop' }));
    expect(api.closeSticky).toHaveBeenCalledWith({ kind: 'note', id: 'n1' });
  });

  it('shows the note title in the strip only when it differs from the text', async () => {
    vi.mocked(api.getNote).mockResolvedValue(
      note({ title: 'Fornecedor', displayTitle: 'Fornecedor', body: 'Pedir orçamento.' }),
    );
    renderWithProviders(<StickyWindow target={{ kind: 'note', id: 'n1' }} />);
    expect(await within(screen.getByRole('banner')).findByText('Fornecedor')).toBeInTheDocument();
  });

  it('applies the palette and lists the colours, with swatches, in More', async () => {
    vi.mocked(api.getSticky).mockResolvedValue(record({ color: 'peach' }));
    const { container } = renderWithProviders(<StickyWindow target={{ kind: 'note', id: 'n1' }} />);
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
    expect(api.setStickyColor).toHaveBeenCalledWith({ kind: 'note', id: 'n1' }, 'mint');
  });

  it('shows keep-on-top as a pressed toggle and turns it off', async () => {
    vi.mocked(api.getSticky).mockResolvedValue(
      record({ placement: { x: 0, y: 0, width: 300, height: 260, alwaysOnTop: true } }),
    );
    renderWithProviders(<StickyWindow target={{ kind: 'note', id: 'n1' }} />);
    const toggle = await screen.findByRole('button', { name: 'Stop keeping on top' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(toggle);
    expect(api.setStickyAlwaysOnTop).toHaveBeenCalledWith({ kind: 'note', id: 'n1' }, false);
  });

  it('renders the note as Markdown, counts its task items and ticks them', async () => {
    vi.mocked(api.getNote).mockResolvedValue(
      note({ body: '## Mykid\n\n- [x] Verify archive bug\n- [ ] Reply to **Rita**' }),
    );
    const update = vi
      .spyOn(api, 'updateNoteText')
      .mockImplementation(async (_id, rev, patch) =>
        note({ body: patch.body ?? '', rev: rev + 1 }),
      );
    renderWithProviders(<StickyWindow target={{ kind: 'note', id: 'n1' }} />);
    const field = await screen.findByRole('textbox', { name: 'Note text' });
    expect(lines(field)).toEqual(['Mykid', '', 'Verify archive bug', 'Reply to Rita']);

    const strip = screen.getByRole('banner');
    expect(within(strip).getByLabelText('1 of 2 done')).toHaveTextContent('1/2');

    const reply = within(field).getByRole('checkbox', { name: 'Reply to **Rita**' });
    expect(reply).not.toBeChecked();
    await userEvent.pointer({ keys: '[MouseLeft>]', target: reply });
    expect(within(strip).getByLabelText('2 of 2 done')).toBeInTheDocument();
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith('n1', expect.any(Number), {
        body: '## Mykid\n\n- [x] Verify archive bug\n- [x] Reply to **Rita**',
      }),
    );
  });

  it('renders a task with its checkbox, subtasks and the "Task" strip title', async () => {
    vi.spyOn(api, 'getTask').mockResolvedValue({
      task: task({ id: 't1', title: 'Comprar café', description: 'Grão, não moído' }),
      subtasks: [task({ id: 's1', title: 'Ver preços', parentTaskId: 't1' })],
      parentTitle: null,
    });
    renderWithProviders(<StickyWindow target={{ kind: 'task', id: 't1' }} />);
    expect(await screen.findByRole('checkbox', { name: 'Comprar café' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Ver preços' })).toBeInTheDocument();
    expect(screen.getByText('Grão, não moído')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Add subtask' })).toBeInTheDocument();
    expect(within(screen.getByRole('banner')).getByText('Task')).toBeInTheDocument();
  });
});
