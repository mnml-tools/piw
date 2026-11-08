import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Badge } from '../Badge/Badge';
import { SpaceDot } from '../Badge/SpaceDot';
import { Button } from '../Button/Button';
import { Drawer } from '../Drawer/Drawer';
import { EmptyState } from '../EmptyState/EmptyState';
import { IconButton } from '../IconButton/IconButton';
import { ListRow } from '../ListRow/ListRow';
import { installDomPolyfills, setPlatform } from '../test-utils';
import { TextArea } from '../TextArea/TextArea';
import { TextInput } from '../TextInput/TextInput';

beforeAll(() => {
  installDomPolyfills();
  setPlatform('macos');
});

describe('Drawer', () => {
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <div>
        <button type="button" onClick={() => setOpen(true)}>
          Adicionar testes
        </button>
        <Drawer open={open} onClose={() => setOpen(false)} title="Task" regionLabel="Task details">
          <input aria-label="Title" />
        </Drawer>
      </div>
    );
  }

  it('is a labelled non-modal region; Esc closes it and focus returns to the row', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const row = screen.getByRole('button', { name: 'Adicionar testes' });
    await user.click(row);
    const region = screen.getByRole('region', { name: 'Task details' });
    expect(screen.getByRole('heading', { name: 'Task' })).toHaveFocus();
    expect(region).not.toHaveAttribute('aria-modal');

    await user.click(screen.getByRole('textbox', { name: 'Title' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    await waitFor(() => expect(row).toHaveFocus());
  });

  it('closes with ×', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Adicionar testes' }));
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });
});

describe('small components', () => {
  it('IconButton has a name, a tooltip with the OS shortcut and toggle state', () => {
    render(<IconButton aria-label="Keep on top" icon={<span />} shortcut="Mod+Shift+T" pressed />);
    const button = screen.getByRole('button', { name: 'Keep on top' });
    expect(button).toHaveAttribute('title', 'Keep on top (⌘⇧T)');
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).toHaveAttribute('aria-keyshortcuts', 'Meta+Shift+T');
  });

  it('Button loading sets aria-busy and ignores clicks', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toHaveAttribute('aria-busy', 'true');
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('ListRow sets aria-selected only for roles that support it', () => {
    render(
      <div role="listbox" aria-label="Results">
        <ListRow role="option" selected title="Refactor 2FA" />
      </div>,
    );
    expect(screen.getByRole('option')).toHaveAttribute('aria-selected', 'true');
    render(
      <div role="list">
        <ListRow role="listitem" selected current title="Nota" />
      </div>,
    );
    const item = screen.getByRole('listitem');
    expect(item).not.toHaveAttribute('aria-selected');
    expect(item).toHaveAttribute('aria-current', 'true');
  });

  it('SpaceDot never relies on colour alone', () => {
    render(<SpaceDot color="mint" label="Work" />);
    expect(screen.getByText('Work')).toBeInTheDocument();
  });

  it('Badge, EmptyState and fields render accessible content', () => {
    render(
      <>
        <Badge>Overdue</Badge>
        <EmptyState
          title="No notes yet"
          description="Write something down — it saves as you type."
          action={<Button>New note</Button>}
        />
        <TextInput label="Space name" error="A space needs a name" />
        <TextArea aria-label="Description" autoGrow />
      </>,
    );
    expect(screen.getByText('Overdue')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No notes yet' })).toBeInTheDocument();
    const input = screen.getByRole('textbox', { name: 'Space name' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('A space needs a name');
    expect(screen.getByRole('textbox', { name: 'Description' })).toBeInTheDocument();
  });
});
