import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Checkbox } from '../Checkbox/Checkbox';

function Controlled({ onChange }: { onChange?: (checked: boolean) => void }) {
  const [checked, setChecked] = useState(false);
  return (
    <Checkbox
      aria-label="Comprar café"
      checked={checked}
      onChange={(event) => {
        setChecked(event.target.checked);
        onChange?.(event.target.checked);
      }}
    />
  );
}

describe('Checkbox', () => {
  it('is a native checkbox named by aria-label', () => {
    render(<Controlled />);
    const box = screen.getByRole('checkbox', { name: 'Comprar café' });
    expect(box.tagName).toBe('INPUT');
    expect(box).not.toBeChecked();
  });

  it('toggles on click', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Controlled onChange={onChange} />);
    const box = screen.getByRole('checkbox');
    await user.click(box);
    expect(box).toBeChecked();
    await user.click(box);
    expect(box).not.toBeChecked();
    expect(onChange.mock.calls).toEqual([[true], [false]]);
  });

  it('toggles with Space', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    await user.tab();
    const box = screen.getByRole('checkbox');
    expect(box).toHaveFocus();
    await user.keyboard(' ');
    expect(box).toBeChecked();
    await user.keyboard(' ');
    expect(box).not.toBeChecked();
  });

  it('can carry a visible label and toggles from the label', async () => {
    const user = userEvent.setup();
    render(<Checkbox label="Confirmar prazos" defaultChecked={false} />);
    const box = screen.getByRole('checkbox', { name: 'Confirmar prazos' });
    await user.click(screen.getByText('Confirmar prazos'));
    expect(box).toBeChecked();
  });

  it('does not toggle when disabled', async () => {
    const user = userEvent.setup();
    render(<Checkbox aria-label="Locked" disabled />);
    const box = screen.getByRole('checkbox', { name: 'Locked' });
    await user.click(box);
    expect(box).not.toBeChecked();
    expect(box).toBeDisabled();
  });
});
