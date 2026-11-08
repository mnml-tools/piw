import { describe, expect, it } from 'vitest';
import { parseWindowLabel, stickyLabel } from './window-kind';

describe('parseWindowLabel', () => {
  it('recognises the fixed windows', () => {
    expect(parseWindowLabel('main')).toEqual({ kind: 'main' });
    expect(parseWindowLabel('capture')).toEqual({ kind: 'capture' });
  });

  it('round-trips sticky labels', () => {
    const target = { kind: 'tasks_tab', id: '0190f1b2-7c3d-7a00-8000-000000000001' } as const;
    expect(parseWindowLabel(stickyLabel(target))).toEqual({ kind: 'sticky', target });
  });

  it('rejects unknown or malformed labels', () => {
    expect(parseWindowLabel('settings')).toBeNull();
    expect(parseWindowLabel('sticky:poem:abc')).toBeNull();
    expect(parseWindowLabel('sticky:note:')).toBeNull();
    expect(parseWindowLabel('sticky:note:a:b')).toBeNull();
    expect(parseWindowLabel('sticky:note:<script>')).toBeNull();
  });
});
