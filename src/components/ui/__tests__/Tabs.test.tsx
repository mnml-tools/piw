import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { TabPanel, Tabs, type TabItem, type TabsProps } from '../Tabs/Tabs';
import { installDomPolyfills } from '../test-utils';

beforeAll(installDomPolyfills);

const ITEMS: TabItem[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'impl', label: 'Implementation' },
  { id: 'todos', label: 'To-dos', srSuffix: '(tasks)' },
  { id: 'refs', label: 'References' },
];

function Harness(props: Partial<TabsProps> & { initial?: string }) {
  const { initial = 'overview', onReorder, ...rest } = props;
  const [items, setItems] = useState(ITEMS);
  const [value, setValue] = useState(initial);
  return (
    <>
      <Tabs
        aria-label="Document tabs"
        idBase="doc"
        items={items}
        value={value}
        onValueChange={setValue}
        onReorder={(from, to) => {
          setItems((current) => {
            const next = [...current];
            const [moved] = next.splice(from, 1);
            if (moved) next.splice(to, 0, moved);
            return next;
          });
          onReorder?.(from, to);
        }}
        {...rest}
      />
      <TabPanel idBase="doc" tabId={value}>
        Panel {value}
      </TabPanel>
    </>
  );
}

describe('Tabs', () => {
  it('exposes tablist semantics with a single tab stop', () => {
    render(<Harness />);
    expect(screen.getByRole('tablist', { name: 'Document tabs' })).toBeInTheDocument();
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(4);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1, -1]);
    expect(screen.getByRole('tab', { name: 'To-dos (tasks)' })).toBeInTheDocument();
    expect(screen.getByRole('tabpanel', { name: 'Overview' })).toHaveTextContent('Panel overview');
  });

  it('moves and selects with arrows (wrapping), Home and End', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('tab', { name: 'Overview' }));

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Implementation' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Implementation' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'References' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'References' })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Panel overview');
  });

  it('Ctrl+PageDown / Ctrl+PageUp select the next / previous tab', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('tab', { name: 'Overview' }));
    await user.keyboard('{Control>}{PageDown}{/Control}');
    expect(screen.getByRole('tab', { name: 'Implementation' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.keyboard('{Control>}{PageUp}{/Control}');
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
  });

  it('reorders with Alt+Arrow and keeps focus on the moved tab', async () => {
    const onReorder = vi.fn();
    const user = userEvent.setup();
    render(<Harness onReorder={onReorder} />);
    await user.click(screen.getByRole('tab', { name: 'Overview' }));

    await user.keyboard('{Alt>}{ArrowRight}{/Alt}');
    expect(onReorder).toHaveBeenLastCalledWith(0, 1);
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Implementation',
      'Overview',
      'To-dos (tasks)',
      'References',
    ]);
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveFocus();

    await user.keyboard('{Alt>}{ArrowLeft}{/Alt}');
    expect(onReorder).toHaveBeenLastCalledWith(1, 0);
    // At the first position there is nowhere to go.
    await user.keyboard('{Alt>}{ArrowLeft}{/Alt}');
    expect(onReorder).toHaveBeenCalledTimes(2);
  });

  it('skips disabled tabs', async () => {
    const user = userEvent.setup();
    render(
      <Tabs
        aria-label="Views"
        items={[
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B', disabled: true },
          { id: 'c', label: 'C' },
        ]}
        value="a"
        onValueChange={() => {}}
      />,
    );
    await user.click(screen.getByRole('tab', { name: 'A' }));
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'C' })).toHaveFocus();
  });

  it('calls onRename (F2 and double-click)', async () => {
    const onRename = vi.fn();
    const user = userEvent.setup();
    render(<Harness onRename={onRename} />);
    await user.click(screen.getByRole('tab', { name: 'Overview' }));
    await user.keyboard('{F2}');
    expect(onRename).toHaveBeenLastCalledWith('overview');
    await user.dblClick(screen.getByRole('tab', { name: 'References' }));
    expect(onRename).toHaveBeenLastCalledWith('refs');
  });
});
