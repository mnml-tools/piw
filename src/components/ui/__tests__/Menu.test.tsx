import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Button } from '../Button/Button';
import { ContextMenu } from '../Menu/ContextMenu';
import { DropdownMenu } from '../Menu/DropdownMenu';
import type { MenuEntry } from '../Menu/types';
import { installDomPolyfills, setPlatform } from '../test-utils';

beforeAll(() => {
  installDomPolyfills();
  setPlatform('linux');
});

function entries(handlers: { open?: () => void; trash?: () => void } = {}): MenuEntry[] {
  return [
    { id: 'open', label: 'Open', onSelect: handlers.open ?? (() => {}) },
    { id: 'pin', label: 'Pin to desktop', shortcut: 'Mod+Shift+P', onSelect: () => {} },
    { id: 'archive', label: 'Archive', disabled: true, onSelect: () => {} },
    { id: 'sep', type: 'separator' },
    { id: 'trash', label: 'Move to Trash', danger: true, onSelect: handlers.trash ?? (() => {}) },
  ];
}

describe('DropdownMenu', () => {
  it('opens on click, closes on Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    render(<DropdownMenu trigger={<Button>More</Button>} items={entries()} />);
    const trigger = screen.getByRole('button', { name: 'More' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');

    await user.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('menuitem')).toHaveLength(4);
    for (const name of ['Open', 'Pin to desktop', 'Archive', 'Move to Trash']) {
      expect(screen.getByRole('menuitem', { name })).toBeInTheDocument();
    }

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('opens from the keyboard and navigates with arrows, skipping disabled items', async () => {
    const onTrash = vi.fn();
    const user = userEvent.setup();
    render(<DropdownMenu trigger={<Button>More</Button>} items={entries({ trash: onTrash })} />);
    screen.getByRole('button', { name: 'More' }).focus();

    await user.keyboard('{Enter}');
    const items = await screen.findAllByRole('menuitem');
    await waitFor(() => expect(items[0]).toHaveFocus());

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Pin to desktop' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Move to Trash' })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('menuitem', { name: 'Open' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('menuitem', { name: 'Move to Trash' })).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(onTrash).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });

  it('runs the item handler on click and exposes shortcut hints', async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(<DropdownMenu trigger={<Button>More</Button>} items={entries({ open: onOpen })} />);
    await user.click(screen.getByRole('button', { name: 'More' }));
    const pin = screen.getByRole('menuitem', { name: 'Pin to desktop' });
    expect(pin).toHaveAttribute('aria-keyshortcuts', 'Control+Shift+P');
    expect(pin).toHaveTextContent('Ctrl+Shift+P');
    expect(screen.getByRole('menuitem', { name: 'Archive' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );

    await user.click(screen.getByRole('menuitem', { name: 'Open' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('supports checkbox and radio items', async () => {
    function Harness() {
      const [onTop, setOnTop] = useState(false);
      const [sort, setSort] = useState('edited');
      return (
        <DropdownMenu
          trigger={<Button>Options</Button>}
          items={[
            {
              id: 'top',
              type: 'checkbox',
              label: 'Keep on top',
              checked: onTop,
              onCheckedChange: setOnTop,
            },
            {
              id: 'sort',
              type: 'radio-group',
              label: 'Sort',
              value: sort,
              onValueChange: setSort,
              options: [
                { value: 'edited', label: 'Last edited' },
                { value: 'title', label: 'Title' },
              ],
            },
          ]}
        />
      );
    }
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Options' }));
    expect(screen.getByRole('menuitemcheckbox', { name: 'Keep on top' })).not.toBeChecked();
    expect(screen.getByRole('menuitemradio', { name: 'Last edited' })).toBeChecked();
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Keep on top' }));

    await user.click(screen.getByRole('button', { name: 'Options' }));
    expect(screen.getByRole('menuitemcheckbox', { name: 'Keep on top' })).toBeChecked();
    await user.click(screen.getByRole('menuitemradio', { name: 'Title' }));
    await user.click(screen.getByRole('button', { name: 'Options' }));
    expect(screen.getByRole('menuitemradio', { name: 'Title' })).toBeChecked();
  });

  it('opens submenus with ArrowRight and closes them with ArrowLeft', async () => {
    const onMove = vi.fn();
    const user = userEvent.setup();
    render(
      <DropdownMenu
        trigger={<Button>More</Button>}
        items={[
          {
            id: 'move',
            type: 'submenu',
            label: 'Move to space',
            items: [{ id: 'work', label: 'Work', onSelect: onMove }],
          },
        ]}
      />,
    );
    screen.getByRole('button', { name: 'More' }).focus();
    await user.keyboard('{Enter}');
    const sub = await screen.findByRole('menuitem', { name: 'Move to space' });
    await waitFor(() => expect(sub).toHaveFocus());
    await user.keyboard('{ArrowRight}');
    const work = await screen.findByRole('menuitem', { name: 'Work' });
    await waitFor(() => expect(work).toHaveFocus());
    await user.keyboard('{ArrowLeft}');
    await waitFor(() => expect(screen.queryByRole('menuitem', { name: 'Work' })).toBeNull());
    expect(sub).toHaveFocus();
  });
});

describe('ContextMenu', () => {
  it('opens on right click and runs the item', async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(
      <ContextMenu items={entries({ open: onOpen })}>
        <div>Row</div>
      </ContextMenu>,
    );
    fireEvent.contextMenu(screen.getByText('Row'), { clientX: 40, clientY: 20 });
    expect(await screen.findByRole('menu')).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Open' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('opens with Shift+F10 on the focused element and Escape returns focus', async () => {
    const user = userEvent.setup();
    render(
      <ContextMenu items={entries()}>
        <button type="button">Row button</button>
      </ContextMenu>,
    );
    const row = screen.getByRole('button', { name: 'Row button' });
    row.focus();
    await user.keyboard('{Shift>}{F10}{/Shift}');
    expect(await screen.findByRole('menu')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    await waitFor(() => expect(row).toHaveFocus());
  });

  it('re-anchors keyboard-initiated contextmenu events at (0, 0)', async () => {
    render(
      <ContextMenu items={entries()}>
        <button type="button">Row button</button>
      </ContextMenu>,
    );
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Row button' }));
    expect(await screen.findByRole('menu')).toBeInTheDocument();
  });
});
