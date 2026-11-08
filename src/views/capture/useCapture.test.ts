import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/ipc/api';
import { IpcError } from '@/lib/ipc/client';
import type { Settings } from '@/lib/ipc/bindings/Settings';
import type { Space } from '@/lib/ipc/bindings/Space';
import { EMPTY_FORM, initialSpace, switchMode, useCapture } from './useCapture';

const spaces: Space[] = [
  {
    id: 'work',
    name: 'Work',
    color: 'sky',
    sortOrder: 0,
    isDefault: true,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'home',
    name: 'Personal',
    color: null,
    sortOrder: 1,
    isDefault: false,
    createdAt: '',
    updatedAt: '',
  },
];
const settings = { captureSpace: 'last_used', lastCaptureSpaceId: 'home' } as Settings;

beforeEach(() => {
  vi.spyOn(api, 'getCaptureDraft').mockResolvedValue(null);
  vi.spyOn(api, 'saveCaptureDraft').mockResolvedValue();
  vi.spyOn(api, 'clearCaptureDraft').mockResolvedValue();
  vi.spyOn(api, 'hideCapture').mockResolvedValue();
  vi.spyOn(api, 'rememberCaptureSpace').mockResolvedValue();
});
afterEach(() => vi.restoreAllMocks());

describe('switchMode', () => {
  it('is lossless in both directions', () => {
    const note = { ...EMPTY_FORM, text: 'a\nb\n\nc' };
    const task = switchMode(note, 'task');
    expect(task).toMatchObject({ text: 'a', description: 'b\n\nc' });
    expect(switchMode(task, 'note').text).toBe('a\nb\n\nc');
  });
});

describe('initialSpace', () => {
  it('prefers the last used space, falling back to the default', () => {
    expect(initialSpace(spaces, settings)).toBe('home');
    expect(initialSpace(spaces, { ...settings, lastCaptureSpaceId: 'gone' })).toBe('work');
    expect(initialSpace(spaces, { ...settings, captureSpace: 'default' })).toBe('work');
  });
});

describe('useCapture', () => {
  it('CA-01: saves a note, clears the draft and closes only after persisting', async () => {
    const order: string[] = [];
    vi.spyOn(api, 'createNote').mockImplementation(async () => {
      order.push('create');
      return { id: 'n1' } as never;
    });
    vi.mocked(api.hideCapture).mockImplementation(async () => {
      order.push('hide');
    });
    const { result } = renderHook(() => useCapture(spaces, settings));
    await act(() => result.current.open('note'));
    act(() => result.current.update({ text: 'Ligar ao fornecedor' }));
    await act(async () => {
      expect(await result.current.submit()).toBe(true);
    });
    expect(api.createNote).toHaveBeenCalledWith({ body: 'Ligar ao fornecedor', spaceId: 'home' });
    expect(order).toEqual(['create', 'hide']);
    expect(api.clearCaptureDraft).toHaveBeenCalled();
    expect(result.current.form.text).toBe('');
  });

  it('saves a task with title and description and pins it when asked', async () => {
    vi.spyOn(api, 'createTask').mockResolvedValue({ id: 't1' } as never);
    const sticky = vi.spyOn(api, 'openSticky').mockResolvedValue(1);
    const { result } = renderHook(() => useCapture(spaces, settings));
    await act(() => result.current.open('task'));
    act(() =>
      result.current.update({ text: 'Comprar café', description: 'No supermercado', pin: true }),
    );
    await act(() => result.current.submit());
    expect(api.createTask).toHaveBeenCalledWith({
      title: 'Comprar café',
      description: 'No supermercado',
      spaceId: 'home',
    });
    expect(sticky).toHaveBeenCalledWith({ kind: 'task', id: 't1' });
  });

  it('CA-08: a failed save keeps the text, stays open and keeps the draft', async () => {
    vi.spyOn(api, 'createNote').mockRejectedValue(new IpcError('storage', 'disk is full'));
    const { result } = renderHook(() => useCapture(spaces, settings));
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
      spaceId: 'work',
      dueDate: null,
      pin: false,
    });
    const { result } = renderHook(() => useCapture(spaces, settings));
    await act(() => result.current.open('note'));
    expect(result.current.restored).toBe(true);
    expect(result.current.form).toMatchObject({
      mode: 'task',
      text: 'half typed',
      spaceId: 'work',
    });
  });

  it('switching mode keeps every character', async () => {
    const { result } = renderHook(() => useCapture(spaces, settings));
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
    const { result } = renderHook(() => useCapture(spaces, settings));
    await act(() => result.current.open('note'));
    act(() => result.current.update({ text: 'throw away' }));
    await act(() => result.current.discard());
    expect(result.current.form.text).toBe('');
    expect(api.clearCaptureDraft).toHaveBeenCalled();
  });

  it('ignores empty submissions', async () => {
    const create = vi.spyOn(api, 'createNote');
    const { result } = renderHook(() => useCapture(spaces, settings));
    await act(() => result.current.open('note'));
    act(() => result.current.update({ text: '   ' }));
    await act(async () => {
      expect(await result.current.submit()).toBe(false);
    });
    expect(create).not.toHaveBeenCalled();
  });
});
