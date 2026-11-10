import { describe, expect, it } from 'vitest';
import { findLinks, findTags } from './wiki-links';

describe('wiki links and tags', () => {
  it('finds links with their heading and label', () => {
    expect(findLinks('See [[Reuniões]] and [[Onboarding#Week 1|the plan]].')).toEqual([
      { from: 4, to: 16, target: 'Reuniões', heading: null, label: null },
      { from: 21, to: 51, target: 'Onboarding', heading: 'Week 1', label: 'the plan' },
    ]);
    expect(findLinks('[[]] [[#Local]] [[a\nb]]')).toEqual([]);
  });

  it('finds tags after whitespace with at least one non-digit', () => {
    expect(findTags('#One and #two/sub, #123, a#b #α').map((t) => t.tag)).toEqual([
      'One',
      'two/sub',
      'α',
    ]);
  });
});
