import { act, render } from '@testing-library/react';
import { StrictMode, useEffect } from 'react';
import type { Autosaver } from '@/lib/autosave';
import { describe, expect, it, vi } from 'vitest';
import { useAutosave } from './useAutosave';

function Editor({ save }: { save: (value: string, rev: number) => Promise<number> }) {
  const { saver } = useAutosave({ value: 'a', rev: 1 }, save, { delay: 10 });
  useEffect(() => {
    saver.update('ab');
  }, [saver]);
  return null;
}

function Probe({
  save,
  onSaver,
}: {
  save: (value: string, rev: number) => Promise<number>;
  onSaver: (saver: Autosaver<string>) => void;
}) {
  const { saver } = useAutosave({ value: 'a', rev: 1 }, save, { delay: 10 });
  useEffect(() => {
    onSaver(saver);
  }, [saver, onSaver]);
  return null;
}

describe('useAutosave', () => {
  it('saves edits made after the StrictMode remount', async () => {
    const save = vi.fn(async (_value: string, rev: number) => rev + 1);
    let saver: Autosaver<string> | undefined;
    render(
      <StrictMode>
        <Probe save={save} onSaver={(s) => (saver = s)} />
      </StrictMode>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    act(() => saver?.update('later'));
    await vi.waitFor(() => expect(save).toHaveBeenCalledWith('later', 1));
  });

  it('keeps saving under StrictMode (effects mount, unmount and mount again)', async () => {
    const save = vi.fn(async (_value: string, rev: number) => rev + 1);
    render(
      <StrictMode>
        <Editor save={save} />
      </StrictMode>,
    );
    await vi.waitFor(() => expect(save).toHaveBeenCalledWith('ab', 1));
  });

  it('flushes pending edits when the editor unmounts', async () => {
    const save = vi.fn(async (_value: string, rev: number) => rev + 1);
    const { unmount } = render(<Editor save={save} />);
    await act(async () => unmount());
    expect(save).toHaveBeenCalledWith('ab', 1);
  });
});
