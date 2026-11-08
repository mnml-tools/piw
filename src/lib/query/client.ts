import { QueryClient } from '@tanstack/react-query';
import { IpcError } from '@/lib/ipc/client';

/**
 * Local IPC is fast and change events keep the cache fresh, so data never goes stale on a
 * timer. Only unexpected (`internal`) failures are retried once; validation, conflicts or
 * missing items will not fix themselves.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: Infinity,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) =>
          failureCount < 1 && (!(error instanceof IpcError) || error.code === 'internal'),
      },
      mutations: { retry: false },
    },
  });
}
