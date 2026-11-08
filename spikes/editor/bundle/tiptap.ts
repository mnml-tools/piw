// Bundle probe A: headless Tiptap kit as the app would ship it
// (StarterKit subset + checklist + taskRef + lowlight "common" + @tiptap/markdown/marked).
import { Editor } from '@tiptap/core'

import { createEditorExtensions } from '../src/extensions'
import { extractTaskRefIds, jsonToMarkdown, jsonToPlainText, markdownToJson } from '../src/serialization'

;(window as unknown as Record<string, unknown>)['__probe'] = (element: HTMLElement, md: string) => {
  const editor = new Editor({ element, extensions: createEditorExtensions(), content: markdownToJson(md) })
  const json = editor.getJSON()
  return { md: jsonToMarkdown(json), text: jsonToPlainText(json), refs: extractTaskRefIds(json) }
}
