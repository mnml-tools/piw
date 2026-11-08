import type { StickyColor } from '@/components/ui';
import type { Space } from '@/lib/ipc/bindings/Space';

/** Colour token name for a space's dot (`plain` when it has none). */
export function spaceColor(space: Space | undefined): StickyColor {
  return space?.color ?? 'plain';
}
