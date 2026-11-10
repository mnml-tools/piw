import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/ipc/api';
import { IpcError } from '@/lib/ipc/client';
import { EMPTY_FORM, initialSpace, switchMode, useCapture } from './useCapture';

const spaces = ['Work', 'Personal'];
const KEY = 'piw.vault.captureSpace';

beforeEach(() => {
  vi.spyOn(api, 'getCaptureDraft').mockResolvedValue(null);
  vi.spyOn(api, 'saveCaptureDraft').mockResolvedValue();
  vi.spyOn(api, 'clearCaptureDraft').mockResolvedValue();
  vi.spyOn(api, 'hideCapture').mockResolvedValue();
  vi.spyOn(api, 'vaultCapture').mockResolvedValue('Personal/Inbox.md');
  localStorage.setItem(KEY, 'Personal');
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('switchMode', () => {
  it('is lossless in both directions', () => {
    const note = { ...EMPTY_FORM, text: 'a\nb\n\nc' };
    const task = switchMode(note, 'task');
    expect(task).toMatchObject({ text: 'a', description: 'b\n\nc' });
    expect(switchMode(task, 'note').text).toBe('a\nb\n\nc');
  });
});

describe('initialSpace', () => {
  it('prefers the last used space, falling back to the first', () => {
    expect(initialSpace(spaces, 'last_used')).toBe('Personal');
    expect(initialSpace(spaces, 'default')).toBe('Work');
    localStorage.setItem(KEY, 'Gone');
    expect(initialSpace(spaces, 'last_used')).toBe('Work');
    expect(initialSpace([], 'last_used')).toBeNull();
  });
});

describe('useCapture', () => {
  it('CA-01: saves a note, clears the draft and closes only after persisting', async () => {
    const order: string[] = [];
    vi.mocked(api.vaultCapture).mockImplementation(async () => {
      order.push('create');
      return 'Personal/Inbox.md';
    });
    vi.mocked(api.hideCapture).mockImplementation(async () => {
      order.push('hide');
    });
    const { result } = renderHook(() => useCapture(spaces, 'last_used'));
    await act(() => result.current.open('note'));
    act(() => result.current.update({ text: 'Ligar ao fornecedor' }));
    await act(async () => {
      expect(await result.current.submit()).toBe(true);
    });
    expect(api.vaultCapture).toHaveBeenCalledWith({
      space: 'Personal',
      mode: 'note',
      text: 'Ligar ao fornecedor',
      description: '',
      due: null,
    });
    expect(order).toEqual(['create', 'hide']);
    expect(api.clearCaptureDraft).toHaveBeenCalled();
    expect(result.current.form.text).toBe('');
  });

  it('saves a task with title and description and pins it when asked', async () => {
    const sticky = vi.spyOn(api, 'vaultPinNote').mockResolvedValue(1);
    const { result } = renderHook(() => useCapture(spaces, 'last_used'));
    await act(() => result.current.open('task'));
    act(() =>
      result.current.update({ text: 'Comprar café', description: 'No supermercado', pin: true }),
    );
    await act(() => result.current.submit());
    expect(api.vaultCapture).toHaveBeenCalledWith({
      space: 'Personal',
      mode: 'task',
      text: 'Comprar café',
      description: 'No supermercado',
      due: null,
    });
    expect(sticky).toHaveBeenCalledWith('Personal/Inbox.md');
  });

  it('CA-08: a failed save keeps the text, stays open and keeps the draft', async () => {
    vi.mocked(api.vaultCapture).mockRejectedValue(new IpcError('storage', 'disk is full'));
    const { result } = renderHook(() => useCapture(spaces, 'last_used'));
    await act(() => result.current.open('note'));
    act(() => result.current.update({ text: 'do not lose me' }));
    await act(async () => {
      expect(await result.current.submit()).toBe(false);
    });
    expect(result.current.state).toBe('error');
    expect(result.current.error).toBe('disk is full');
    expect(result.current.form.text).toBe('do not lose me');
    expect(api.hideCapture).not.toHaveBeenCalled();
    expect(api.saveCaptureDraft).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'do not lose me' }),
    );
  });

  it('restores a draft left by an accidental close', async () => {
    vi.mocked(api.getCaptureDraft).mockResolvedValue({
      mode: 'task',
      text: 'half typed',
      description: '',
      spaceId: 'Work',
      dueDate: null,
      pin: false,
    });
    const { result } = renderHook(() => useCapture(spaces, 'last_used'));
    await act(() => result.current.open('note'));
    expect(result.current.restored).toBe(true);
    expect(result.current.form).toMatchObject({
      mode: 'task',
      text: 'half typed',
      spaceId: 'Work',
    });
  });

  it('switching mode keeps every character', async () => {
    const { result } = renderHook(() => useCapture(spaces, 'last_used'));
    await act(() => result.current.open('note'));
    act(() => result.current.update({ text: 'Title line\nmore detail' }));
    act(() => result.current.setMode('task'));
    expect(result.current.form).toMatchObject({
      mode: 'task',
      text: 'Title line',
      description: 'more detail',
    });
    act(() => result.current.setMode('note'));
    expect(result.current.form).toMatchObject({ mode: 'note', text: 'Title line\nmore detail' });
  });

  it('discard clears the text and the stored draft', async () => {
    const { result } = renderHook(() => useCapture(spaces, 'last_used'));
    await act(() => result.current.open('note'));
    act(() => result.current.update({ text: 'throw away' }));
    await act(() => result.current.discard());
    expect(result.current.form.text).toBe('');
    expect(api.clearCaptureDraft).toHaveBeenCalled();
  });

  it('ignores empty submissions', async () => {
    const { result } = renderHook(() => useCapture(spaces, 'last_used'));
    await act(() => result.current.open('note'));
    act(() => result.current.update({ text: '   ' }));
    await act(async () => {
      expect(await result.current.submit()).toBe(false);
    });
    expect(api.vaultCapture).not.toHaveBeenCalled();
  });
});
