import { StateField, type EditorState, type Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { keymap, showTooltip, type Tooltip } from '@codemirror/view';
import { toggleWrap } from '@/lib/markdown';
import styles from './MarkdownEditor.module.css';

/** Lucide paths (24×24, stroked) for the menu's glyphs, drawn without innerHTML. */
const GLYPHS = {
  sticky: ['M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z', 'M15 3v4a2 2 0 0 0 2 2h4'],
  bold: ['M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8'],
  link: [
    'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71',
    'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  ],
} as const;

function glyph(paths: readonly string[]): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  for (const [name, value] of Object.entries({
    width: '13',
    height: '13',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
  })) {
    svg.setAttribute(name, value);
  }
  for (const d of paths) {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

export interface SelectionMenuOptions {
  /** "Create sticky from selection…": its label, shortcut, and what to do with the text. */
  sticky: { label: string; shortcut: string; run: (text: string) => void };
  /** Accessible names of the Bold and Link buttons. */
  bold: string;
  link: string;
}

/** `[selection]()` with the caret between the parentheses, ready for the address. */
function wrapInLink(view: EditorView): void {
  const { from, to } = view.state.selection.main;
  const text = view.state.sliceDoc(from, to);
  view.dispatch({
    changes: { from, to, insert: `[${text}]()` },
    selection: { anchor: from + text.length + 3 },
    userEvent: 'input',
  });
  view.focus();
}

function wrapInBold(view: EditorView): void {
  const { state } = view;
  const { from, to } = state.selection.main;
  const edit = toggleWrap(state.doc.toString(), from, to, '**');
  view.dispatch({
    changes: { from: edit.start, to: edit.end, insert: edit.text },
    selection: { anchor: edit.selectionStart, head: edit.selectionEnd },
    userEvent: 'input',
  });
  view.focus();
}

/**
 * The menu under a non-empty selection (docs/ui-design-system.md §10): "Create sticky from
 * selection…" (also its shortcut), then Bold and Link. It sits below the selection, so it never
 * covers the line being read.
 */
export function selectionMenu({ sticky, bold, link }: SelectionMenuOptions): Extension {
  const selected = (state: EditorState): { to: number; text: string } | null => {
    const { ranges, main } = state.selection;
    if (state.readOnly || main.empty || ranges.length > 1) return null;
    const text = state.sliceDoc(main.from, main.to);
    return text.trim() ? { to: main.to, text } : null;
  };
  const tooltip = (state: EditorState): Tooltip | null => {
    const found = selected(state);
    if (!found) return null;
    return {
      pos: found.to,
      above: false,
      create: (view) => {
        const dom = document.createElement('div');
        dom.className = styles.selectionMenu ?? '';
        dom.setAttribute('role', 'toolbar');
        const button = (
          label: string,
          paths: readonly string[],
          text: boolean,
          run: () => void,
        ) => {
          const element = document.createElement('button');
          element.type = 'button';
          element.className = styles.selectionButton ?? '';
          element.title = label;
          element.append(glyph(paths));
          if (text) element.append(document.createTextNode(label));
          else element.setAttribute('aria-label', label);
          // mousedown, so the selection is still there when the action runs.
          element.addEventListener('mousedown', (event) => {
            event.preventDefault();
            run();
          });
          return element;
        };
        const divider = document.createElement('span');
        divider.className = styles.selectionDivider ?? '';
        dom.append(
          button(sticky.label, GLYPHS.sticky, true, () => {
            view.dispatch({ selection: { anchor: view.state.selection.main.to } });
            sticky.run(found.text);
          }),
          divider,
          button(bold, GLYPHS.bold, false, () => wrapInBold(view)),
          button(link, GLYPHS.link, false, () => wrapInLink(view)),
        );
        return { dom, offset: { x: 0, y: 4 } };
      },
    };
  };
  const field = StateField.define<Tooltip | null>({
    create: tooltip,
    update: (value, tr) => (tr.docChanged || tr.selection ? tooltip(tr.state) : value),
    provide: (f) => showTooltip.from(f),
  });
  return [
    field,
    keymap.of([
      {
        key: sticky.shortcut,
        run: (view) => {
          const found = selected(view.state);
          if (!found) return false;
          view.dispatch({ selection: { anchor: view.state.selection.main.to } });
          sticky.run(found.text);
          return true;
        },
      },
    ]),
  ];
}
