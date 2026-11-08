import { Editor } from '@tiptap/core'
import type { JSONContent } from '@tiptap/core'
import { marked } from 'marked'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createEditorExtensions } from '../src/extensions'
import { jsonToMarkdown, markdownToJson, normalizeDoc, serializeDoc } from '../src/serialization'
import { applyExternalContent, currentDocString } from '../src/sync'
import { readFixture } from './helpers'

const editors: Editor[] = []
function makeEditor(content?: JSONContent, onUpdate?: (json: JSONContent) => void): Editor {
  const element = document.createElement('div')
  document.body.append(element)
  const editor = new Editor({
    element,
    extensions: createEditorExtensions(),
    content: content ?? null,
    enableContentCheck: true,
    onUpdate: ({ editor: e }) => onUpdate?.(e.getJSON()),
  })
  editors.push(editor)
  return editor
}

afterEach(() => {
  editors.splice(0).forEach((e) => e.destroy())
})

const FULL = markdownToJson(readFixture('full.md'))

describe('determinism of the live editor', () => {
  it('getJSON() twice → identical string; equals normalizeDoc(input)', () => {
    const editor = makeEditor(FULL)
    const a = JSON.stringify(editor.getJSON())
    const b = JSON.stringify(editor.getJSON())
    expect(a).toBe(b)
    expect(a).toBe(serializeDoc(FULL))
  })

  it('two editors loaded with the same JSON produce the same string', () => {
    expect(currentDocString(makeEditor(FULL))).toBe(currentDocString(makeEditor(FULL)))
  })

  it('load → getJSON → reload is a fixed point (no drift across autosaves)', () => {
    let json: JSONContent = FULL
    for (let i = 0; i < 5; i += 1) {
      const editor = makeEditor(json)
      json = editor.getJSON()
    }
    expect(serializeDoc(json)).toBe(serializeDoc(FULL))
  })

  it('Markdown from the editor equals the headless export', () => {
    expect(jsonToMarkdown(makeEditor(FULL).getJSON())).toBe(readFixture('full.md'))
  })
})

describe('autosave and multiple windows', () => {
  it('setContent with emitUpdate:false does not fire onUpdate', () => {
    const onUpdate = vi.fn()
    const editor = makeEditor(undefined, onUpdate)
    editor.commands.setContent(FULL, { emitUpdate: false })
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('applyExternalContent: no-op when identical, silent when different, not undoable', () => {
    const onUpdate = vi.fn()
    const editor = makeEditor(markdownToJson('original\n'), onUpdate)

    expect(applyExternalContent(editor, markdownToJson('original\n'))).toBe(false)
    expect(applyExternalContent(editor, markdownToJson('de outra janela\n'))).toBe(true)
    expect(onUpdate).not.toHaveBeenCalled()

    // Undo must not "revert" another window's save.
    editor.commands.undo()
    expect(jsonToMarkdown(editor.getJSON())).toBe('de outra janela\n')
  })

  it('a user edit fires exactly one update with canonical JSON', () => {
    const onUpdate = vi.fn()
    const editor = makeEditor(markdownToJson('olá\n'), onUpdate)
    editor.commands.insertContentAt(editor.state.doc.content.size - 1, ' mundo')
    expect(onUpdate).toHaveBeenCalledTimes(1)
    const saved = onUpdate.mock.calls[0]?.[0] as JSONContent
    expect(jsonToMarkdown(saved)).toBe('olá mundo\n')
  })

  it('two windows editing the same tab converge without an update loop', () => {
    const store = { value: serializeDoc(markdownToJson('início\n')), writes: 0 }
    const windows: Editor[] = []
    const save = (from: Editor) => (json: JSONContent) => {
      const next = serializeDoc(json)
      if (next === store.value) return
      store.value = next
      store.writes += 1
      // "Rust emits doc-changed" → every other window applies it silently.
      windows.filter((w) => w !== from).forEach((w) => applyExternalContent(w, JSON.parse(next)))
    }
    const initial = JSON.parse(store.value) as JSONContent
    const a: Editor = makeEditor(initial, (json) => save(a)(json))
    const b: Editor = makeEditor(initial, (json) => save(b)(json))
    windows.push(a, b)

    a.commands.insertContentAt(a.state.doc.content.size - 1, ' (A)')
    b.commands.insertContentAt(b.state.doc.content.size - 1, ' (B)')

    expect(store.writes).toBe(2)
    expect(currentDocString(a)).toBe(store.value)
    expect(currentDocString(b)).toBe(store.value)
    expect(jsonToMarkdown(JSON.parse(store.value))).toBe('início (A) (B)\n')
  })
})

describe('invalid stored content', () => {
  it('enableContentCheck reports unknown nodes; normalizeDoc refuses them (do not autosave)', () => {
    const onContentError = vi.fn()
    const element = document.createElement('div')
    const stored = { type: 'doc', content: [{ type: 'futureWidget' }, { type: 'paragraph' }] }
    const editor = new Editor({
      element,
      extensions: createEditorExtensions(),
      content: stored,
      enableContentCheck: true,
      onContentError,
    })
    editors.push(editor)
    expect(onContentError).toHaveBeenCalledTimes(1)
    expect(() => normalizeDoc(stored)).toThrow()
    // Tiptap's fallback is an EMPTY document: autosaving it would erase the stored
    // content. The app must go read-only and skip autosave on contentError.
    expect(serializeDoc(editor.getJSON())).toBe('{"type":"doc","content":[{"type":"paragraph"}]}')
  })
})

describe('@tiptap/markdown global state (why serialization.ts uses a private Marked)', () => {
  it('each Editor with the Markdown extension registers its tokenizers on the global `marked`', () => {
    const count = () => marked.defaults.extensions?.inline?.length ?? 0
    const before = count()
    for (let i = 0; i < 5; i += 1) {
      editors.push(new Editor({ extensions: createEditorExtensions({ markdown: true }) }))
    }
    const after = count()
    // Grows with every instance (taskRef inline tokenizer + others) and is never removed.
    expect(after).toBeGreaterThanOrEqual(before + 5)
    console.info(`[marked global] inline extensions: before=${before} after 5 editors=${after}`)
  })
})
