import { describe, expect, it } from 'vitest';
import { continueList, indentList, inferTitle, toggleWrap } from './markdown';

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
    expect(inferTitle('\n  # Ligar ao fornecedor\nmais')).toBe('Ligar ao fornecedor');
    expect(inferTitle('- [ ] comprar café')).toBe('comprar café');
    expect(inferTitle('   \n ')).toBe('');
    expect(inferTitle('x'.repeat(100))).toHaveLength(80);
  });
});
