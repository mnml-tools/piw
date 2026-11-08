// Bundle part: marked only (dependency of @tiptap/markdown).
import { Marked } from 'marked'

;(window as unknown as Record<string, unknown>)['__probe'] = new Marked()
