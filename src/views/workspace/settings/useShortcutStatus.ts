import { isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useEffect, useState } from 'react';
import { api } from '@/lib/ipc/api';
import type { PlatformInfo } from '@/lib/ipc/bindings/PlatformInfo';
import type { ShortcutStatus } from '@/lib/ipc/bindings/ShortcutStatus';

/** Live global-shortcut status (Rust broadcasts `piw://shortcut/status` on every change). */
export function useShortcutStatus() {
  const [info, setInfo] = useState<PlatformInfo | null>(null);
  const [status, setStatus] = useState<ShortcutStatus | null>(null);
  useEffect(() => {
    if (!isTauri()) return undefined;
    void api.platformInfo().then((value) => {
      setInfo(value);
      setStatus(value.shortcut);
    });
    const unlisten = listen<ShortcutStatus>('piw://shortcut/status', (event) =>
      setStatus(event.payload),
    );
    return () => {
      void unlisten.then((stop) => stop());
    };
  }, []);
  return { info, status };
}
