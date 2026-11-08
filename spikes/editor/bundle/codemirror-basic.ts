// Bundle probe B (typical): `codemirror` basicSetup (search, autocomplete, folding, lint…) + lang-markdown.
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { basicSetup, EditorView } from 'codemirror'

;(window as unknown as Record<string, unknown>)['__probe'] = (parent: HTMLElement, doc: string) =>
  new EditorView({ parent, doc, extensions: [basicSetup, markdown({ base: markdownLanguage })] })
