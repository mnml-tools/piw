import { useEffect, useState } from 'react';
import { Autosaver, type SaveStatus } from '@/lib/autosave';

/**
 * React binding for {@link Autosaver}. One saver lives for the component's lifetime: render
 * the editor with `key={recordId}` so another record gets a fresh saver. Pending edits are
 * flushed when the window loses focus or is hidden and when the component unmounts, so
 * switching notes or closing the window never drops text.
 */
export function useAutosave<T>(
  initial: { value: T; rev: number },
  save: (value: T, rev: number) => Promise<number>,
  options: { delay?: number; equals?: (a: T, b: T) => boolean } = {},
) {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [saver] = useState(
    () => new Autosaver<T>(initial, { save, onStatus: setStatus, ...options }),
  );

  useEffect(() => {
    saver.setSave(save);
  }, [saver, save]);

  useEffect(() => {
    saver.activate();
    const onHidden = () => {
      if (document.visibilityState === 'hidden') void saver.flush();
    };
    const onBlur = () => void saver.flush();
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('blur', onBlur);
      // flush() starts the pending save synchronously, so disposing right after cannot drop it.
      // Disposing later (after the promise) would run after StrictMode's remount `activate()`
      // and silence the saver for good.
      void saver.flush();
      saver.dispose();
    };
  }, [saver]);

  return { saver, status };
}
