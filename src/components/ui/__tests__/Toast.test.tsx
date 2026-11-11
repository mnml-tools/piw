import { act, fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useToast, type ToastApi, type ToastOptions } from '../Toast/toast-context';
import { ToastProvider } from '../Toast/ToastProvider';

const apiRef: { current: ToastApi | null } = { current: null };

function Capture() {
  const api = useToast();
  useEffect(() => {
    apiRef.current = api;
  }, [api]);
  return null;
}

function show(options: ToastOptions): string {
  let id = '';
  act(() => {
    id = apiRef.current?.toast(options) ?? '';
  });
  return id;
}

function renderProvider() {
  return render(
    <ToastProvider>
      <Capture />
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  apiRef.current = null;
});

describe('Toast', () => {
  it('shows a toast in a polite live region', () => {
    renderProvider();
    show({ message: 'Converted to document' });
    const list = screen.getByRole('list', { name: 'Notifications' });
    expect(list).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByText('Converted to document')).toBeInTheDocument();
  });

  it('runs the action and closes the toast', () => {
    const onAction = vi.fn();
    renderProvider();
    show({ message: '“Buy coffee” moved to Trash', action: { label: 'Undo', onAction } });
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('“Buy coffee” moved to Trash')).not.toBeInTheDocument();
  });

  it('auto-dismisses after its duration (default 8 s)', () => {
    renderProvider();
    show({ message: 'Short', duration: 3000 });
    show({ message: 'Default' });
    act(() => vi.advanceTimersByTime(2999));
    expect(screen.getByText('Short')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByText('Short')).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(4999));
    expect(screen.getByText('Default')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByText('Default')).not.toBeInTheDocument();
  });

  // fireEvent rather than user-event: Testing Library's async wrapper waits on a real
  // setTimeout that Vitest's fake timers never fire.
  it('pauses while hovered or focused and resumes with the remaining time', () => {
    renderProvider();
    show({ message: 'Paused toast', duration: 1000 });
    const toast = screen.getByRole('listitem');
    act(() => vi.advanceTimersByTime(400));
    fireEvent.pointerOver(toast);
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByText('Paused toast')).toBeInTheDocument();
    fireEvent.pointerOut(toast);
    act(() => vi.advanceTimersByTime(300));
    fireEvent.focus(screen.getByRole('button', { name: 'Dismiss' }));
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByText('Paused toast')).toBeInTheDocument();
    fireEvent.blur(screen.getByRole('button', { name: 'Dismiss' }));
    act(() => vi.advanceTimersByTime(299));
    expect(screen.getByText('Paused toast')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByText('Paused toast')).not.toBeInTheDocument();
  });

  it('keeps toasts without a duration until dismissed', () => {
    renderProvider();
    show({ message: 'Sticky', duration: 0 });
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByText('Sticky')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('Sticky')).not.toBeInTheDocument();
  });

  it('shows at most 3 toasts, dropping the oldest', () => {
    renderProvider();
    for (const n of [1, 2, 3, 4]) show({ message: `Toast ${n}` });
    expect(screen.queryByText('Toast 1')).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('replaces the previous undo toast with the newest one', () => {
    renderProvider();
    show({ message: 'First trashed', action: { label: 'Undo', onAction: () => {} } });
    show({ message: 'Info only' });
    show({ message: 'Second trashed', action: { label: 'Undo', onAction: () => {} } });
    expect(screen.queryByText('First trashed')).not.toBeInTheDocument();
    expect(screen.getByText('Info only')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Undo' })).toHaveLength(1);
  });

  it('announces error toasts as alerts and updates a toast by id', () => {
    renderProvider();
    show({ id: 'export', message: 'Exporting…', duration: 0 });
    show({ id: 'export', message: "Couldn't export", tone: 'error', duration: 0 });
    expect(screen.queryByText('Exporting…')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't export");
  });

  it('dismiss(id) removes a toast', () => {
    renderProvider();
    const id = show({ message: 'Removable', duration: 0 });
    act(() => apiRef.current?.dismiss(id));
    expect(screen.queryByText('Removable')).not.toBeInTheDocument();
  });

  it('throws a clear error outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Capture />)).toThrow(/ToastProvider/);
  });
});
