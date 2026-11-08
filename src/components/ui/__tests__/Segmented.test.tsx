import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Segmented, type SegmentedOption } from '../Segmented/Segmented';

type Theme = 'system' | 'light' | 'dark';
const OPTIONS: SegmentedOption<Theme>[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

function Harness({ onChange }: { onChange?: (value: Theme) => void }) {
  const [value, setValue] = useState<Theme>('system');
  return (
    <Segmented
      aria-label="Theme"
      options={OPTIONS}
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

describe('Segmented', () => {
  it('is a radiogroup with one tab stop on the checked option', () => {
    render(<Harness />);
    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeInTheDocument();
    const radios = screen.getAllByRole('radio');
    expect(radios[0]).toBeChecked();
    expect(radios.map((radio) => radio.tabIndex)).toEqual([0, -1, -1]);
  });

  it('arrow keys move focus and select, wrapping at the ends', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);
    await user.tab();
    expect(screen.getByRole('radio', { name: 'System' })).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Light' })).toHaveFocus();
    expect(screen.getByRole('radio', { name: 'Light' })).toBeChecked();
    expect(onChange).toHaveBeenLastCalledWith('light');

    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked();

    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
    await user.keyboard('{Home}');
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked();
    await user.keyboard('{End}');
    expect(screen.getByRole('radio', { name: 'Dark' })).toHaveFocus();
    expect(screen.getByRole('radio', { name: 'Dark' }).tabIndex).toBe(0);
  });

  it('selects on click and skips disabled options', async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Segmented
        aria-label="Mode"
        options={[
          { value: 'note', label: 'Note' },
          { value: 'task', label: 'Task', disabled: true },
          { value: 'doc', label: 'Doc' },
        ]}
        value="note"
        onValueChange={onValueChange}
      />,
    );
    await user.click(screen.getByRole('radio', { name: 'Doc' }));
    expect(onValueChange).toHaveBeenLastCalledWith('doc');
    screen.getByRole('radio', { name: 'Note' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(onValueChange).toHaveBeenLastCalledWith('doc');
    expect(screen.getByRole('radio', { name: 'Doc' })).toHaveFocus();
  });

  it('keeps the same radiogroup semantics and keys in the text variant', async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Segmented
        aria-label="Task view"
        variant="text"
        options={[
          { value: 'today', label: 'Today' },
          { value: 'all', label: 'All' },
        ]}
        value="today"
        onValueChange={onValueChange}
      />,
    );
    expect(screen.getByRole('radiogroup', { name: 'Task view' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Today' })).toBeChecked();
    screen.getByRole('radio', { name: 'Today' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(onValueChange).toHaveBeenLastCalledWith('all');
  });
});
