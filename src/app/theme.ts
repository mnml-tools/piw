import type { Settings } from '@/lib/ipc/bindings/Settings';

export type Platform = 'macos' | 'windows' | 'linux';

export function detectPlatform(userAgent: string = navigator.userAgent): Platform {
  if (/Mac|iPhone|iPad/.test(userAgent)) return 'macos';
  if (/Windows/.test(userAgent)) return 'windows';
  return 'linux';
}

let stopFollowingSystem: (() => void) | null = null;

/**
 * Writes the system colour mode to `data-theme` and keeps it in step with the OS. The kit's
 * tokens (@mnml-tools/ui) only know `light` and `dark`, so "System" is resolved here.
 */
function followSystemTheme(root: HTMLElement): () => void {
  const query =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null;
  const apply = () => {
    root.dataset.theme = query?.matches ? 'dark' : 'light';
  };
  apply();
  query?.addEventListener('change', apply);
  return () => query?.removeEventListener('change', apply);
}

/** Applies appearance settings as `data-*` attributes consumed by the kit and tokens.css. */
export function applyAppearance(
  settings: Pick<Settings, 'theme' | 'textSize'> & Partial<Pick<Settings, 'accent'>>,
): void {
  const root = document.documentElement;
  stopFollowingSystem?.();
  stopFollowingSystem = null;
  if (settings.theme === 'system') stopFollowingSystem = followSystemTheme(root);
  else root.dataset.theme = settings.theme;
  root.dataset.accent = settings.accent ?? 'blue';
  if (settings.textSize === 'default') delete root.dataset.textSize;
  else root.dataset.textSize = settings.textSize;
}

export function applyPlatform(): void {
  document.documentElement.dataset.platform = detectPlatform();
}
