/** Space and sticky colours (tokens `--sticky-<name>-*`). UI names: Plain, Yellow, Peach… */
export const STICKY_COLORS = [
  'plain',
  'yellow',
  'peach',
  'rose',
  'mint',
  'sky',
  'lavender',
] as const;
export type StickyColor = (typeof STICKY_COLORS)[number];
