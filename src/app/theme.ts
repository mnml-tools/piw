import type { Settings } from '@/lib/ipc/bindings/Settings';

export type Platform = 'macos' | 'windows' | 'linux';

export function detectPlatform(userAgent: string = navigator.userAgent): Platform {
  if (/Mac|iPhone|iPad/.test(userAgent)) return 'macos';
  if (/Windows/.test(userAgent)) return 'windows';
  return 'linux';
}

/** Applies appearance settings as `data-*` attributes consumed by tokens.css. */
export function applyAppearance(settings: Pick<Settings, 'theme' | 'textSize'>): void {
  const root = document.documentElement;
  if (settings.theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = settings.theme;
  if (settings.textSize === 'default') delete root.dataset.textSize;
  else root.dataset.textSize = settings.textSize;
}

export function applyPlatform(): void {
  document.documentElement.dataset.platform = detectPlatform();
}
