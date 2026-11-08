import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Button } from '../Button/Button';
import { DateQuickPicker } from '../DateQuickPicker/DateQuickPicker';
import { installDomPolyfills } from '../test-utils';

beforeAll(installDomPolyfills);

const LABELS = {
  today: 'Today',
  tomorrow: 'Tomorrow',
  nextWeek: 'Next week',
  pick: 'Pick a date…',
  clear: 'Remove date',
  pickInput: 'Due date',
  apply: 'Set date',
};

function renderPicker(value: string | null, onChange = vi.fn()) {
  render(
    <DateQuickPicker
      value={value}
      onChange={onChange}
      labels={LABELS}
      today="2026-11-06"
      trigger={<Button variant="ghost">{value ?? 'No date'}</Button>}
    />,
  );
  return onChange;
}

describe('DateQuickPicker', () => {
  it.each([
    ['Today', '2026-11-06'],
    ['Tomorrow', '2026-11-07'],
    ['Next week', '2026-11-09'],
  ])('%s returns %s relative to the injected today', async (label, expected) => {
    const user = userEvent.setup();
    const onChange = renderPicker(null);
    await user.click(screen.getByRole('button', { name: 'No date' }));
    await user.click(screen.getByRole('menuitem', { name: new RegExp(`^${label}`) }));
    expect(onChange).toHaveBeenCalledWith(expected);
  });

  it('disables "Remove date" without a value', async () => {
    const user = userEvent.setup();
    renderPicker(null);
    await user.click(screen.getByRole('button', { name: 'No date' }));
    expect(screen.getByRole('menuitem', { name: 'Remove date' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('Remove date returns null', async () => {
    const user = userEvent.setup();
    const onChange = renderPicker('2026-11-20');
    await user.click(screen.getByRole('button', { name: '2026-11-20' }));
    await user.click(screen.getByRole('menuitem', { name: 'Remove date' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('Pick a date… shows a native date field; Enter sets the date', async () => {
    const user = userEvent.setup();
    const onChange = renderPicker('2026-11-20');
    await user.click(screen.getByRole('button', { name: '2026-11-20' }));
    await user.click(screen.getByRole('menuitem', { name: 'Pick a date…' }));
    const input = await screen.findByLabelText('Due date');
    expect(input).toHaveAttribute('type', 'date');
    await waitFor(() => expect(input).toHaveFocus());
    expect(input).toHaveValue('2026-11-20');

    await user.clear(input);
    await user.type(input, '2026-12-24');
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('2026-12-24');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });

  it('opens from the keyboard and Escape closes it', async () => {
    const user = userEvent.setup();
    renderPicker(null);
    const trigger = screen.getByRole('button', { name: 'No date' });
    trigger.focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('menu')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
