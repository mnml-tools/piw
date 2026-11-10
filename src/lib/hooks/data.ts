/**
 * Data hooks for app-wide queries, keyed by `@/lib/query/keys`. Writes go through `api` and the
 * cache refreshes from the `piw://changed` event (all windows), so mutations don't need to
 * patch caches by hand. The vault's hooks live in `./vault`.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/ipc/api';
import { keys } from '@/lib/query/keys';

export function useAppStatus() {
  return useQuery({ queryKey: ['appStatus'], queryFn: api.appStatus });
}

export function useSettings() {
  return useQuery({ queryKey: keys.settings, queryFn: api.getSettings });
}

/** Whether Piw 0.1 left notes or tasks to import into the vault. */
export function useVaultImportStatus() {
  return useQuery({ queryKey: keys.vaultImport, queryFn: api.vaultImportStatus });
}
