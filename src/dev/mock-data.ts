/**
 * Dev-only starting data for the browser mock: a small sample vault (`?mock=empty` for an empty one).
 */
import { todayString } from '@/lib/dates';
import { DEFAULT_SETTINGS, type Store } from './mock-store';
import { seedVault } from './mock-vault';

export type MockMode = 'demo' | 'empty';

export function seedStore(mode: MockMode, at: Date = new Date()): Store {
  const vault = seedVault(todayString(at));
  if (mode === 'empty') {
    vault.files = {};
    vault.folders = [];
  }
  return {
    stickies: [],
    settings: { ...DEFAULT_SETTINGS, trayNoticeShown: true },
    draft: null,
    vault,
    importPending: false,
  };
}
