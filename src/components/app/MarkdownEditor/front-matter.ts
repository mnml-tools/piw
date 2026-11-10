import { StateEffect, StateField, type EditorState, type Extension } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import { frontMatterEnd } from './live-markdown';
import styles from './MarkdownEditor.module.css';

/** One property of the front matter as the summary shows it. */
interface Property {
  key: string;
  values: string[];
}

/**
 * The front matter's properties (docs/vault-format.md §2), read loosely for display only:
 * `key: value`, `key: [a, b]` and `key:` followed by `- item` lines. Nothing is written back.
 */
export function frontMatterProperties(lines: readonly string[]): Property[] {
  const found: Property[] = [];
  for (const line of lines) {
    const item = /^\s+-\s+(.*)$/.exec(line) ?? /^-\s+(.*)$/.exec(line);
    const last = found.at(-1);
    if (item && last) {
      last.values.push(unquote(item[1] ?? ''));
      continue;
    }
    const pair = /^([^:\s][^:]*):\s*(.*)$/.exec(line);
    if (!pair) continue;
    const [, key = '', raw = ''] = pair;
    const value = raw.trim();
    const values =
      value.startsWith('[') && value.endsWith(']')
        ? value
            .slice(1, -1)
            .split(',')
            .map((v) => unquote(v.trim()))
            .filter(Boolean)
        : value
          ? [unquote(value)]
          : [];
    found.push({ key: key.trim(), values });
  }
  return found;
}

function unquote(value: string): string {
  return value.replace(/^(['"])(.*)\1$/, '$2');
}

/** The summary in place of the folded front matter: `#tag` chips, then `key value` pairs. */
class Summary extends WidgetType {
  constructor(
    readonly properties: readonly Property[],
    readonly inside: number,
  ) {
    super();
  }

  override eq(other: Summary): boolean {
    return JSON.stringify(other.properties) === JSON.stringify(this.properties);
  }

  override toDOM(view: EditorView): HTMLElement {
    const dom = document.createElement('div');
    dom.className = styles.frontMatterSummary ?? '';
    for (const { key, values } of this.properties) {
      const part = document.createElement('span');
      part.className = styles.frontMatterProperty ?? '';
      if (key === 'tags' || key === 'tag') {
        for (const value of values) {
          const tag = document.createElement('span');
          tag.className = styles.liveTag ?? '';
          tag.textContent = `#${value.replace(/^#/, '')}`;
          part.append(tag);
        }
      } else {
        const name = document.createElement('span');
        name.className = styles.frontMatterKey ?? '';
        name.textContent = key;
        part.append(name, document.createTextNode(` ${values.join(', ')}`));
      }
      dom.append(part);
    }
    // A click opens the front matter for editing, with the caret on its first property.
    dom.addEventListener('mousedown', (event) => {
      event.preventDefault();
      view.dispatch({ selection: { anchor: this.inside } });
      view.focus();
    });
    return dom;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

const setFocused = StateEffect.define<boolean>();

interface Fold {
  focused: boolean;
  decorations: DecorationSet;
}

function fold(state: EditorState, focused: boolean): DecorationSet {
  const end = frontMatterEnd(state.doc);
  if (end === 0) return Decoration.none;
  const { head } = state.selection.main;
  if (focused && head <= end) return Decoration.none;
  const last = state.doc.lineAt(end).number;
  const lines: string[] = [];
  for (let n = 2; n < last; n += 1) lines.push(state.doc.line(n).text);
  const properties = frontMatterProperties(lines);
  const inside = state.doc.line(Math.min(2, last)).from;
  return Decoration.set([
    Decoration.replace({ widget: new Summary(properties, inside), block: true }).range(0, end),
  ]);
}

/**
 * Folds a note's front matter into a one-line summary of its properties (tags as `#tag`) unless
 * the caret is in it while the editor has focus, as live Markdown hides every marker it is not
 * editing. The text itself is never changed.
 */
export function frontMatterFold(): Extension {
  const field = StateField.define<Fold>({
    create: (state) => ({ focused: false, decorations: fold(state, false) }),
    update(value, tr) {
      let { focused } = value;
      for (const effect of tr.effects) if (effect.is(setFocused)) focused = effect.value;
      if (!tr.docChanged && !tr.selection && focused === value.focused) return value;
      return { focused, decorations: fold(tr.state, focused) };
    },
    provide: (f) => EditorView.decorations.from(f, (value) => value.decorations),
  });
  return [field, EditorView.focusChangeEffect.of((_, focusing) => setFocused.of(focusing))];
}
