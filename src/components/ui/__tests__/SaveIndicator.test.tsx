import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SaveIndicator, type SaveState } from '../SaveIndicator/SaveIndicator';

const LABELS = { saving: 'Saving…', saved: 'Saved', error: "Couldn't save", retry: 'Retry' };

function setup(
  initial: SaveState = 'idle',
  extra: { onRetry?: () => void; confirmSave?: boolean } = {},
) {
  const view = render(<SaveIndicator state={initial} labels={LABELS} {...extra} />);
  return {
    ...view,
    set(state: SaveState, more: { confirmSave?: boolean } = {}) {
      view.rerender(<SaveIndicator state={state} labels={LABELS} {...extra} {...more} />);
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SaveIndicator', () => {
  it('is hidden at rest', () => {
    const { container } = setup('idle');
    expect(container.firstElementChild).toBeEmptyDOMElement();
  });

  it('hides quick saves entirely', () => {
    const { set, container } = setup('idle');
    set('saving');
    act(() => vi.advanceTimersByTime(200));
    set('saved');
    expect(container.firstElementChild).toBeEmptyDOMElement();
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });

  it('shows "Saving…" after 500 ms, then "Saved" for 1.5 s', () => {
    const { set } = setup('idle');
    set('saving');
    act(() => vi.advanceTimersByTime(499));
    expect(screen.queryByText('Saving…')).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByText('Saving…')).toBeInTheDocument();

    set('saved');
    expect(screen.getByText('Saved')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1499));
    expect(screen.getByText('Saved')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });

  it('does not announce saving or saved', () => {
    const { set } = setup('saving');
    act(() => vi.advanceTimersByTime(600));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    set('saved');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('announces errors with a Retry button that stays while retrying', () => {
    const onRetry = vi.fn();
    const { set } = setup('saving', { onRetry });
    set('error');
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent("Couldn't save");
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);

    set('saving');
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByRole('alert')).toBeInTheDocument();

    // Recovery shows "Saved" even though the retry itself was quick.
    set('saved');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });

  it('confirms quick saves when asked (Mod+S)', () => {
    const { set } = setup('idle');
    set('saving', { confirmSave: true });
    set('saved', { confirmSave: true });
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });
});
