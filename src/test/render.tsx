import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { ToastProvider } from '@/components/ui/Toast/ToastProvider';

/** A fresh query client per test: no retries, no shared cache. */
function testQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
}

/**
 * Renders UI with the app providers (TanStack Query + toasts). Mock data access with
 * `vi.spyOn(api, 'listTasks').mockResolvedValue(...)` from `@/lib/ipc/api`.
 */
export function renderWithProviders(
  ui: ReactElement,
  { client = testQueryClient(), ...options }: RenderOptions & { client?: QueryClient } = {},
) {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
  return { client, ...render(ui, { wrapper: Wrapper, ...options }) };
}
