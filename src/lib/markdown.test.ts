import { describe, expect, it } from 'vitest';
import {
  continueList,
  indentList,
  inferTitle,
  textLines,
  toggleTaskLine,
  toggleWrap,
  inlineText,
} from './markdown';

describe('toggleWrap', () => {
  it('wraps the selection and keeps it selected', () => {
    expect(toggleWrap('a word', 2, 6, '**')).toEqual({
      start: 2,
      end: 6,
      text: '**word**',
      selectionStart: 4,
      selectionEnd: 8,
    });
  });

  it('inserts an empty pair with the caret inside when nothing is selected', () => {
    expect(toggleWrap('ab', 1, 1, '_')).toMatchObject({ text: '__', selectionStart: 2 });
  });

  it('unwraps a selection that is already wrapped (inside or outside the markers)', () => {
    expect(toggleWrap('**word**', 2, 6, '**')).toMatchObject({ start: 0, end: 8, text: 'word' });
    expect(toggleWrap('**word**', 0, 8, '**')).toMatchObject({ start: 0, end: 8, text: 'word' });
  });
});

describe('continueList', () => {
  it('continues bullets, numbers and checkboxes with the same indentation', () => {
    expect(continueList('- a', 3, 3)?.text).toBe('\n- ');
    expect(continueList('  * a', 5, 5)?.text).toBe('\n  * ');
    expect(continueList('9. a', 4, 4)?.text).toBe('\n10. ');
    expect(continueList('- [x] done', 10, 10)?.text).toBe('\n- [ ] ');
  });

  it('removes the marker of an empty item', () => {
    expect(continueList('- a\n- ', 6, 6)).toMatchObject({ start: 4, end: 6, text: '' });
  });

  it('leaves other lines and the marker itself alone', () => {
    expect(continueList('plain', 5, 5)).toBeNull();
    expect(continueList('- a', 1, 1)).toBeNull();
    expect(continueList('-not a list', 11, 11)).toBeNull();
  });
});

describe('indentList', () => {
  it('indents and outdents list lines only', () => {
    expect(indentList('- a\n- b', 0, 7, false)).toMatchObject({ text: '  - a\n  - b' });
    expect(indentList('  - a', 5, 5, true)).toMatchObject({ text: '- a', selectionStart: 3 });
  });

  it('lets Tab move focus elsewhere (no trap)', () => {
    expect(indentList('plain text', 2, 2, false)).toBeNull();
    expect(indentList('- a\nplain', 0, 9, false)).toBeNull();
  });

  it('keeps Shift+Tab on an unindented list line without moving focus', () => {
    expect(indentList('- a', 3, 3, true)).toBe('none');
  });
});

describe('inferTitle', () => {
  it('uses the first non-empty line without Markdown markers', () => {
    expect(inferTitle('\n  # Call the supplier\nmore')).toBe('Call the supplier');
    expect(inferTitle('- [ ] buy coffee')).toBe('buy coffee');
    expect(inferTitle('   \n ')).toBe('');
    expect(inferTitle('x'.repeat(100))).toHaveLength(80);
  });
});

describe('textLines', () => {
  it('leaves out Markdown markers, empty lines and rules, as the database does', () => {
    const body =
      '## Mykid\n\n- [ ] Verify bug;\n-  [x] Menus\n  * nested\n2. Call\n> - [ ] Quoted\n___\nTest';
    expect(textLines(body)).toEqual([
      'Mykid',
      'Verify bug;',
      'Menus',
      'nested',
      'Call',
      'Quoted',
      'Test',
    ]);
    expect(textLines('#tag -1 2.5 [x]y')).toEqual(['#tag -1 2.5 [x]y']);
  });
});

describe('toggleTaskLine', () => {
  it('ticks and unticks a task item', () => {
    expect(toggleTaskLine('- [ ] Call Rita')).toBe('- [x] Call Rita');
    expect(toggleTaskLine('  - [X] Call Rita')).toBe('  - [ ] Call Rita');
  });

  it('turns a list item or a plain line into a task item', () => {
    expect(toggleTaskLine('- Call Rita')).toBe('- [ ] Call Rita');
    expect(toggleTaskLine('2. Call Rita')).toBe('2. [ ] Call Rita');
    expect(toggleTaskLine('  Call Rita')).toBe('  - [ ] Call Rita');
    expect(toggleTaskLine('   ')).toBeNull();
  });
});

describe('inlineText', () => {
  it('drops inline markers and keeps the words', () => {
    expect(inlineText('Reply to **Rita** about `verify()` and ~~old~~ _new_')).toBe(
      'Reply to Rita about verify() and old new',
    );
    expect(
      inlineText('See [[Onboarding#Week 1|the plan]], [[Atlas]] and [docs](https://x.y)'),
    ).toBe('See the plan, Atlas and docs');
    expect(inlineText('2 * 3 and snake_case_name')).toBe('2 * 3 and snake_case_name');
  });
});
