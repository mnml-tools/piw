// Bundle part: baseline @tiptap/core + StarterKit only (no markdown, no lowlight, no custom nodes).
import { Editor } from '@tiptap/core'
import { StarterKit } from '@tiptap/starter-kit'

;(window as unknown as Record<string, unknown>)['__probe'] = (element: HTMLElement) =>
  new Editor({ element, extensions: [StarterKit] })
