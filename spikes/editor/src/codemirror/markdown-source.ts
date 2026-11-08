/**
 * Candidate B (evaluation only — NOT the chosen editor): CodeMirror 6 as a
 * Markdown *source* editor. Kept small: just enough to test fidelity, the
 * checklist-vs-taskRef distinction, and bundle size.
 */
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown, markdownKeymap, markdownLanguage } from '@codemirror/lang-markdown'
import { defaultHighlightStyle, ensureSyntaxTree, syntaxHighlighting } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import type { Extension } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'

export function markdownSourceExtensions(): Extension[] {
  return [
    history(),
    keymap.of([...markdownKeymap, ...defaultKeymap, ...historyKeymap]),
    // GFM flavour: task lists, strikethrough, autolinks, tables.
    markdown({ base: markdownLanguage }),
    syntaxHighlighting(defaultHighlightStyle),
    EditorView.lineWrapping,
  ]
}

export function createMarkdownSourceState(doc: string): EditorState {
  return EditorState.create({ doc, extensions: markdownSourceExtensions() })
}

export interface SourceScan {
  /** GFM task-list items found by the Lezer parser (editorial checklist). */
  checklistItems: number
  /** `[[task:<uuid>]]` occurrences outside code (would need a custom Lezer extension). */
  taskRefIds: string[]
}

const TASK_REF_RE =
  /\[\[task:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\]\]/g

/**
 * In a source editor a "taskRef" is only a substring: we must re-scan the text
 * and consult the syntax tree to skip code. Nothing makes it atomic.
 */
export function scanSource(state: EditorState): SourceScan {
  const tree = ensureSyntaxTree(state, state.doc.length, 5_000)
  if (tree === null) throw new Error('Lezer parse did not finish')
  let checklistItems = 0
  const codeRanges: [number, number][] = []
  tree.iterate({
    enter: (node) => {
      if (node.name === 'Task') checklistItems += 1
      if (node.name === 'InlineCode' || node.name === 'FencedCode' || node.name === 'CodeBlock') {
        codeRanges.push([node.from, node.to])
      }
    },
  })
  const text = state.doc.toString()
  const taskRefIds: string[] = []
  for (const match of text.matchAll(TASK_REF_RE)) {
    const at = match.index
    const inCode = codeRanges.some(([from, to]) => at >= from && at < to)
    if (!inCode && match[1] !== undefined) taskRefIds.push(match[1].toLowerCase())
  }
  return { checklistItems, taskRefIds }
}
