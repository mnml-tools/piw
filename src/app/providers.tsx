import { QueryClientProvider } from '@tanstack/react-query';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { type ReactNode, useEffect, useState } from 'react';
import { ToastProvider } from '@/components/ui/Toast/ToastProvider';
import { useSettings } from '@/lib/hooks/data';
import { createQueryClient } from '@/lib/query/client';
import { subscribeToChanges } from '@/lib/query/sync';
import { applyAppearance, applyPlatform } from './theme';

/** Keeps `data-theme` / `data-accent` / `data-text-size` in sync with settings in every window. */
function AppearanceSync() {
  const settings = useSettings();
  useEffect(() => {
    if (settings.data) applyAppearance(settings.data);
  }, [settings.data]);
  return null;
}

/** Debug builds only: acknowledge the platform probe's multi-window pings (`PIW_SPIKE_PROBE`). */
function useProbeAcks() {
  useEffect(() => {
    if (!import.meta.env.DEV || !isTauri()) return undefined;
    const unlisten = listen<{ sequence: number }>('spike://ping', (event) => {
      void invoke('spike_ack', { sequence: event.payload.sequence }).catch(() => undefined);
    });
    return () => {
      void unlisten.then((stop) => stop());
    };
  }, []);
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [client] = useState(createQueryClient);
  useEffect(() => subscribeToChanges(client), [client]);
  useEffect(applyPlatform, []);
  useProbeAcks();
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <AppearanceSync />
        {children}
      </ToastProvider>
    </QueryClientProvider>
  );
}
