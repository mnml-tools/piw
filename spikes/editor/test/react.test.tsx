import type { Editor, JSONContent } from '@tiptap/react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DocumentEditor } from '../src/react/DocumentEditor'
import { createMemoryTaskRefStore, TaskRefProvider } from '../src/react/task-ref-store'
import { extractTaskRefIds, jsonToMarkdown, markdownToJson, serializeDoc } from '../src/serialization'

const A = '0190a6e4-7b5c-7d3e-9f10-2a3b4c5d6e7f'
const MISSING = '9b2f5c1e-3d4a-4b6c-8e9f-0a1b2c3d4e5f'

afterEach(cleanup)

function setup(content: JSONContent = markdownToJson(`Rever [[task:${A}]] e [[task:${MISSING}]]\n`)) {
  const store = createMemoryTaskRefStore([{ id: A, title: 'Rever PR #42', status: 'open' }])
  store.remove(MISSING)
  const onChange = vi.fn()
  const onToggle = vi.fn()
  let editor: Editor | null = null
  const ui = (doc: JSONContent) => (
    <TaskRefProvider store={store} onToggle={onToggle}>
      <DocumentEditor content={doc} onChange={onChange} onReady={(e) => (editor = e)} />
    </TaskRefProvider>
  )
  const view = render(ui(content))
  return {
    store,
    onChange,
    onToggle,
    rerender: (doc: JSONContent) => view.rerender(ui(doc)),
    editor: () => {
      if (editor === null) throw new Error('editor not ready')
      return editor
    },
  }
}

describe('React integration (@tiptap/react + ReactNodeViewRenderer)', () => {
  it('renders task data from the store, never from the document', async () => {
    const t = setup()
    expect(await screen.findByText('Rever PR #42')).toBeTruthy()
    expect(screen.getByText('Tarefa indisponível')).toBeTruthy()
    await waitFor(() => t.editor())
    const json = serializeDoc(t.editor().getJSON())
    expect(json).not.toContain('Rever PR')
    expect(json).toContain(`{"type":"taskRef","attrs":{"taskId":"${A}"}}`)
    expect(t.onChange).not.toHaveBeenCalled()
  })

  it('task changes elsewhere re-render the NodeView without touching the document', async () => {
    const t = setup()
    await screen.findByText('Rever PR #42')
    act(() => t.store.set({ id: A, title: 'Rever PR #42 (renomeada)', status: 'done' }))
    expect(await screen.findByText('Rever PR #42 (renomeada)')).toBeTruthy()
    expect(screen.getByRole('checkbox').getAttribute('aria-checked')).toBe('true')
    expect(t.onChange).not.toHaveBeenCalled()
  })

  it('toggling calls the task action (IPC) and leaves the JSON unchanged', async () => {
    const t = setup()
    await screen.findByText('Rever PR #42')
    await waitFor(() => t.editor())
    const before = serializeDoc(t.editor().getJSON())
    fireEvent.click(screen.getByRole('checkbox'))
    expect(t.onToggle).toHaveBeenCalledWith(A)
    expect(serializeDoc(t.editor().getJSON())).toBe(before)
    expect(t.onChange).not.toHaveBeenCalled()
  })

  it('user edits call onChange with canonical JSON; external content does not', async () => {
    const t = setup(markdownToJson('olá\n'))
    await waitFor(() => t.editor())
    act(() => {
      t.editor().commands.insertContentAt(t.editor().state.doc.content.size - 1, ' mundo')
    })
    expect(t.onChange).toHaveBeenCalledTimes(1)
    expect(jsonToMarkdown(t.onChange.mock.calls[0]?.[0] as JSONContent)).toBe('olá mundo\n')

    t.rerender(markdownToJson(`de outra janela [[task:${A}]]\n`))
    await screen.findByText('Rever PR #42')
    expect(jsonToMarkdown(t.editor().getJSON())).toBe(`de outra janela [[task:${A}]]\n`)
    expect(extractTaskRefIds(t.editor().getJSON())).toEqual([A])
    expect(t.onChange).toHaveBeenCalledTimes(1)
  })

  it('invalid stored content is never mounted (no silent data loss)', () => {
    const onContentError = vi.fn()
    render(
      <DocumentEditor
        content={{ type: 'doc', content: [{ type: 'futureWidget' }] }}
        onChange={vi.fn()}
        onContentError={onContentError}
      />,
    )
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(onContentError).toHaveBeenCalledTimes(1)
  })

  it('unmounting unsubscribes NodeViews from the store', async () => {
    const t = setup()
    await screen.findByText('Rever PR #42')
    expect(t.store.listenerCount(A)).toBeGreaterThan(0)
    cleanup()
    await waitFor(() => expect(t.store.listenerCount(A)).toBe(0))
  })
})
