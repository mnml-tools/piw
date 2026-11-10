import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { todayString } from '@/lib/dates';
import type { StickyTarget } from '@/lib/ipc/bindings/StickyTarget';
import type { VaultTaskView } from '@/lib/ipc/bindings/VaultTaskView';
import { api } from '@/lib/ipc/api';
import { keys } from '@/lib/query/keys';

/** Reads of the vault (docs/redesign.md); every one refreshes on a `file` change. */
export function useVaultStatus() {
  return useQuery({ queryKey: keys.vaultStatus, queryFn: api.vaultStatus });
}

export function useVaultTree(enabled = true) {
  return useQuery({ queryKey: keys.vaultTree, queryFn: api.vaultTree, enabled });
}

export function useVaultNote(path: string, enabled = true) {
  return useQuery({
    queryKey: keys.vaultNote(path),
    queryFn: () => api.vaultReadNote(path),
    enabled,
  });
}

export function useVaultSearch(query: string, space: string | null) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: keys.vaultSearch(trimmed, space),
    queryFn: () => api.vaultSearch(trimmed, space),
    enabled: trimmed.length > 0,
    placeholderData: (previous) => previous,
  });
}

export function useVaultTrash() {
  return useQuery({ queryKey: keys.vaultTrash, queryFn: api.vaultListTrash });
}

export function useVaultTasks(view: VaultTaskView, space: string | null, today: string) {
  return useQuery({
    queryKey: keys.vaultTasks(view, space, today),
    queryFn: () => api.vaultTasks(view, space, today),
    placeholderData: (previous) => previous,
  });
}

/** The local date, refreshed every minute so the task views turn over at midnight. */
export function useToday(): string {
  const [today, setToday] = useState(todayString);
  useEffect(() => {
    const timer = setInterval(() => setToday(todayString()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return today;
}

export function useVaultPinned(enabled = true) {
  return useQuery({ queryKey: keys.vaultPinned, queryFn: api.vaultPinned, enabled });
}

export function useVaultStickyView(target: StickyTarget) {
  return useQuery({
    queryKey: keys.vaultStickyView(`sticky:${target.kind}:${target.id}`),
    queryFn: () => api.vaultStickyView(target),
  });
}
