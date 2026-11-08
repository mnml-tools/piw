import type { Settings } from '@/lib/ipc/bindings/Settings';
import type { Space } from '@/lib/ipc/bindings/Space';

/** Space new items go to under "All": the last used one if configured and still present. */
export function initialSpace(spaces: Space[], settings: Settings | undefined): string | null {
  const fallback = spaces.find((s) => s.isDefault)?.id ?? spaces[0]?.id ?? null;
  if (settings?.captureSpace === 'last_used' && settings.lastCaptureSpaceId) {
    return spaces.some((s) => s.id === settings.lastCaptureSpaceId)
      ? settings.lastCaptureSpaceId
      : fallback;
  }
  return fallback;
}
