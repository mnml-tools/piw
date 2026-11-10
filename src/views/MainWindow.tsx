import { lazy, Suspense } from 'react';
import { useAppStatus } from '@/lib/hooks/data';
import { useVaultStatus } from '@/lib/hooks/vault';
import { DataError } from './workspace/DataError';

const VaultApp = lazy(() => import('./vault/VaultApp'));

/**
 * The main window: the vault shell (docs/redesign.md). If Piw's own database cannot be opened
 * (settings, stickies), it says so instead; the notes in the vault are untouched either way.
 */
export default function MainWindow() {
  const app = useAppStatus();
  const status = useVaultStatus();
  if (app.data?.dataError) {
    return <DataError reason={app.data.dataError} path={app.data.dataPath} />;
  }
  if (!status.data) return null;
  return (
    <Suspense fallback={null}>
      <VaultApp status={status.data} />
    </Suspense>
  );
}
