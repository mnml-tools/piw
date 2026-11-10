import { syntaxTree } from '@codemirror/language';
import type { Extension, Range } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { Decoration, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { frontMatterEnd, revealedLines } from './live-markdown';
import styles from './MarkdownEditor.module.css';

/**
 * Vault links and tags in the live Markdown editor (docs/vault-format.md §4): `[[Note]]`,
 * `[[Note#Heading|label]]` and `#tag` render as accent text; the brackets and a link's target
 * hide unless the line is being edited, like every other marker. Mod+click on a link calls
 * `onOpen` with its target. Nothing inside code counts.
 */

/** `[[target#heading|label]]`: target, then an optional heading and label. */
const LINK = /\[\[([^[\]\n|#]+)(#[^[\]\n|]*)?(\|[^[\]\n]*)?\]\]/g;
/** A tag after the line start or whitespace, with at least one non-digit. */
const TAG = /(^|\s)#([\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)/gu;

export interface WikiLink {
  from: number;
  to: number;
  target: string;
  heading: string | null;
  label: string | null;
}

/** The links in one line of text, with offsets relative to the line. */
export function findLinks(text: string): WikiLink[] {
  return Array.from(text.matchAll(LINK), (match) => ({
    from: match.index,
    to: match.index + match[0].length,
    target: match[1]!.trim(),
    heading: match[2] ? match[2].slice(1) : null,
    label: match[3] ? match[3].slice(1) : null,
  })).filter((link) => link.target !== '');
}

/** The tags in one line of text: `[from, to)` of `#tag`, relative to the line. */
export function findTags(text: string): Array<{ from: number; to: number; tag: string }> {
  return Array.from(text.matchAll(TAG), (match) => {
    const from = match.index + match[1]!.length;
    return { from, to: from + 1 + match[2]!.length, tag: match[2]! };
  });
}

const CODE = new Set(['InlineCode', 'FencedCode', 'CodeBlock', 'CodeText']);

function inCode(view: EditorView, pos: number): boolean {
  for (
    let node: { name: string; parent: unknown } | null = syntaxTree(view.state).resolveInner(
      pos,
      1,
    );
    node;
    node = node.parent as typeof node
  ) {
    if (CODE.has(node.name)) return true;
  }
  return false;
}

const hidden = Decoration.replace({});
const muted = Decoration.mark({ class: styles.liveMark ?? '' });
const link = Decoration.mark({ class: styles.liveWikiLink ?? '' });
const tag = Decoration.mark({ class: styles.liveTag ?? '' });

function decorate(view: EditorView): DecorationSet {
  const { doc } = view.state;
  const revealed = revealedLines(view);
  const found: Range<Decoration>[] = [];
  const metadataEnd = frontMatterEnd(doc);
  for (const { from, to } of view.visibleRanges) {
    for (let n = doc.lineAt(from).number; n <= doc.lineAt(to).number; n += 1) {
      const line = doc.line(n);
      if (line.from < metadataEnd) continue;
      const shown = revealed.has(n);
      for (const item of findLinks(line.text)) {
        const start = line.from + item.from;
        const end = line.from + item.to;
        if (inCode(view, start)) continue;
        // The visible part: the label, else the target (and heading).
        const textFrom = item.label === null ? start + 2 : end - 2 - item.label.length;
        const textTo = end - 2;
        found.push(link.range(textFrom, textTo));
        if (shown) {
          found.push(muted.range(start, textFrom), muted.range(textTo, end));
        } else {
          found.push(hidden.range(start, textFrom), hidden.range(textTo, end));
        }
      }
      for (const item of findTags(line.text)) {
        const start = line.from + item.from;
        if (!inCode(view, start)) found.push(tag.range(start, line.from + item.to));
      }
    }
  }
  return Decoration.set(found, true);
}

/** The link under `pos`, if any. */
function linkAt(view: EditorView, pos: number): WikiLink | null {
  const line = view.state.doc.lineAt(pos);
  const offset = pos - line.from;
  return findLinks(line.text).find((l) => offset >= l.from && offset <= l.to) ?? null;
}

export function wikiLinks({ onOpen }: { onOpen: (target: string) => void }): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = decorate(view);
      }

      update(update: ViewUpdate) {
        if (
          update.docChanged ||
          update.selectionSet ||
          update.focusChanged ||
          update.viewportChanged ||
          syntaxTree(update.startState) !== syntaxTree(update.state)
        ) {
          this.decorations = decorate(update.view);
        }
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
      eventHandlers: {
        mousedown(event, view) {
          if (!(event.metaKey || event.ctrlKey) || event.button !== 0) return false;
          const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
          const found = pos === null ? null : linkAt(view, pos);
          if (!found || inCode(view, view.state.doc.lineAt(pos!).from + found.from)) return false;
          event.preventDefault();
          onOpen(found.target);
          return true;
        },
      },
    },
  );
}
