import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Button } from '../Button/Button';
import { ConfirmDialog } from '../Dialog/ConfirmDialog';
import { Dialog } from '../Dialog/Dialog';
import { DropdownMenu } from '../Menu/DropdownMenu';
import { installDomPolyfills } from '../test-utils';

beforeAll(installDomPolyfills);

function DialogHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open settings</Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Piw keeps running in the tray"
        closeLabel="Close"
        footer={<Button onClick={() => setOpen(false)}>Keep running</Button>}
      >
        <p>Body</p>
      </Dialog>
    </>
  );
}

describe('Dialog', () => {
  it('is a labelled modal dialog that Escape closes, returning focus to the invoker', async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);
    const opener = screen.getByRole('button', { name: 'Open settings' });
    await user.click(opener);

    const dialog = await screen.findByRole('dialog', { name: 'Piw keeps running in the tray' });
    await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement));

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('closes with the × button', async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);
    await user.click(screen.getByRole('button', { name: 'Open settings' }));
    await user.click(await screen.findByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('traps Tab inside the dialog', async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);
    await user.click(screen.getByRole('button', { name: 'Open settings' }));
    const dialog = await screen.findByRole('dialog');
    for (let i = 0; i < 4; i += 1) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
  });

  it('returns focus to the menu trigger when opened from a menu item', async () => {
    function MenuHarness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <DropdownMenu
            trigger={<Button>More</Button>}
            items={[{ id: 'notice', label: 'Show notice…', onSelect: () => setOpen(true) }]}
          />
          <Dialog open={open} onOpenChange={setOpen} title="Notice" />
        </>
      );
    }
    const user = userEvent.setup();
    render(<MenuHarness />);
    const trigger = screen.getByRole('button', { name: 'More' });
    await user.click(trigger);
    await user.click(screen.getByRole('menuitem', { name: 'Show notice…' }));
    await screen.findByRole('dialog', { name: 'Notice' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});

function ConfirmHarness({ onConfirm }: { onConfirm: () => void | Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Empty trash…</Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Permanently delete 14 items?"
        description="This can't be undone."
        confirmLabel="Delete forever"
        cancelLabel="Cancel"
        destructive
        onConfirm={onConfirm}
      />
    </>
  );
}

describe('ConfirmDialog', () => {
  it('is an alertdialog with initial focus on Cancel', async () => {
    const user = userEvent.setup();
    render(<ConfirmHarness onConfirm={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Empty trash…' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Permanently delete 14 items?' });
    expect(dialog).toHaveAccessibleDescription("This can't be undone.");
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus());
  });

  it('calls onConfirm and closes', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<ConfirmHarness onConfirm={onConfirm} />);
    const opener = screen.getByRole('button', { name: 'Empty trash…' });
    await user.click(opener);
    await user.click(await screen.findByRole('button', { name: 'Delete forever' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('Escape cancels without confirming', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<ConfirmHarness onConfirm={onConfirm} />);
    await user.click(screen.getByRole('button', { name: 'Empty trash…' }));
    await screen.findByRole('alertdialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('stays open and busy while an async confirm runs', async () => {
    let resolve: () => void = () => {};
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    const user = userEvent.setup();
    render(<ConfirmHarness onConfirm={onConfirm} />);
    await user.click(screen.getByRole('button', { name: 'Empty trash…' }));
    const confirm = await screen.findByRole('button', { name: 'Delete forever' });
    await user.click(confirm);
    expect(confirm).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    resolve();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });
});
