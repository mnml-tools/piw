import { lazy, Suspense } from 'react';
import { AppProviders } from './providers';
import type { WindowKind } from './window-kind';

// Each window only loads the code it needs; the capture popup must open instantly.
const WorkspaceApp = lazy(() => import('@/views/workspace/WorkspaceApp'));
const CaptureWindow = lazy(() => import('@/views/capture/CaptureWindow'));
const StickyWindow = lazy(() => import('@/views/sticky/StickyWindow'));
// Dev-only component gallery: the import is dropped from production bundles.
const Gallery = import.meta.env.DEV ? lazy(() => import('@/views/gallery/Gallery')) : () => null;

export function Root({ kind }: { kind: WindowKind }) {
  if (kind.kind === 'gallery') {
    return (
      <Suspense fallback={null}>
        <Gallery />
      </Suspense>
    );
  }
  return (
    <AppProviders>
      <Suspense fallback={null}>
        {kind.kind === 'main' && <WorkspaceApp />}
        {kind.kind === 'capture' && <CaptureWindow />}
        {kind.kind === 'sticky' && <StickyWindow target={kind.target} />}
      </Suspense>
    </AppProviders>
  );
}
