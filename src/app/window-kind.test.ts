import { describe, expect, it } from 'vitest';
import { parseWindowLabel, stickyLabel } from './window-kind';

describe('parseWindowLabel', () => {
  it('recognises the fixed windows', () => {
    expect(parseWindowLabel('main')).toEqual({ kind: 'main' });
    expect(parseWindowLabel('capture')).toEqual({ kind: 'capture' });
  });

  it('round-trips sticky labels', () => {
    const target = { kind: 'vault_tasks', id: '0190f1b2-7c3d-7a00-8000-000000000001' } as const;
    expect(parseWindowLabel(stickyLabel(target))).toEqual({ kind: 'sticky', target });
  });

  it('rejects unknown or malformed labels', () => {
    expect(parseWindowLabel('settings')).toBeNull();
    expect(parseWindowLabel('sticky:poem:abc')).toBeNull();
    // Piw 0.1's sticky kinds are gone (their stickies moved to vault notes).
    expect(parseWindowLabel('sticky:note:abc')).toBeNull();
    expect(parseWindowLabel('sticky:vault_note:')).toBeNull();
    expect(parseWindowLabel('sticky:vault_note:a:b')).toBeNull();
    expect(parseWindowLabel('sticky:vault_note:<script>')).toBeNull();
  });
});
