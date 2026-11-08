import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';
import { afterEach, describe, expect, it } from 'vitest';
import { call, IpcError, toIpcError } from './client';

afterEach(() => clearMocks());

describe('call', () => {
  it('returns the command result', async () => {
    mockIPC((cmd, args) => (cmd === 'echo' ? args : null));
    await expect(call('echo', { value: 1 })).resolves.toEqual({ value: 1 });
  });

  it('maps Rust errors to IpcError with their code', async () => {
    mockIPC(() => {
      throw { code: 'conflict', message: 'note was changed elsewhere' };
    });
    const error = await call('save').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(IpcError);
    expect(error).toMatchObject({ code: 'conflict', message: 'note was changed elsewhere' });
  });
});

describe('toIpcError', () => {
  it('wraps unknown failures as internal errors', () => {
    expect(toIpcError('boom')).toMatchObject({ code: 'internal', message: 'boom' });
    expect(toIpcError(new Error('bad'))).toMatchObject({ code: 'internal', message: 'bad' });
  });
});
