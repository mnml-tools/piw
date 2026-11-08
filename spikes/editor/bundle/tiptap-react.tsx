// Bundle probe A+React: kit + @tiptap/react bindings (react/react-dom are external: the app ships them anyway).
import { createRoot } from 'react-dom/client'

import { createMemoryTaskRefStore, DocumentEditor, TaskRefProvider } from '../src/react'
import { markdownToJson } from '../src/serialization'

;(window as unknown as Record<string, unknown>)['__probe'] = (element: HTMLElement, md: string) => {
  createRoot(element).render(
    <TaskRefProvider store={createMemoryTaskRefStore()}>
      <DocumentEditor content={markdownToJson(md)} onChange={() => undefined} />
    </TaskRefProvider>,
  )
}
