// Bundle probe B (minimal): state + view + commands + language + lang-markdown (GFM).
import { EditorView } from '@codemirror/view'

import { createMarkdownSourceState, scanSource } from '../src/codemirror/markdown-source'

;(window as unknown as Record<string, unknown>)['__probe'] = (parent: HTMLElement, md: string) => {
  const view = new EditorView({ parent, state: createMarkdownSourceState(md) })
  return scanSource(view.state)
}
