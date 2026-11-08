import { Editor } from '@tiptap/core'
import { afterEach, describe, expect, it } from 'vitest'

import { createEditorExtensions } from '../src/extensions'
import { htmlToJson, jsonToMarkdown, jsonToPlainText, markdownToJson, serializeDoc } from '../src/serialization'

/** Typical hostile clipboard content. */
const HOSTILE_HTML = [
  '<p>antes</p>',
  '<script>window.__pwned = true</script>',
  '<img src="x" onerror="window.__pwned = true">',
  '<p onclick="window.__pwned = true" style="color:red" class="evil">estilo</p>',
  '<a href="javascript:window.__pwned=true">js</a>',
  '<a href="https://ok.pt" target="_blank" rel="opener" class="x" onmouseover="alert(1)">ok</a>',
  '<a href="data:text/html;base64,PHNjcmlwdD4=">data</a>',
  '<iframe src="https://evil.example"></iframe>',
  '<svg><script>alert(1)</script><circle onload="alert(1)"/></svg>',
  '<style>body{display:none}</style>',
  '<object data="x.swf"></object><embed src="x.swf">',
  '<form action="https://evil.example"><input value="campo"></form>',
  '<h4>nível 4</h4>',
  '<p>depois</p>',
].join('')

const FORBIDDEN = [
  'script',
  'onerror',
  'onclick',
  'onmouseover',
  'onload',
  'javascript:',
  'data:',
  'style',
  'iframe',
  'img',
  'svg',
  'evil',
  'target',
  'opener',
  '__pwned',
  'form',
  'input',
]

function expectSanitised(serialized: string): void {
  for (const needle of FORBIDDEN) {
    expect(serialized, `must not contain ${needle}`).not.toContain(needle)
  }
}

describe('HTML is sanitised by the schema (paste / import)', () => {
  it('htmlToJson (generateJSON) keeps text and drops everything else', () => {
    const json = htmlToJson(HOSTILE_HTML)
    const serialized = serializeDoc(json)
    expectSanitised(serialized)
    // The three <a> are adjacent inline siblings → one paragraph "js" + "ok" + "data".
    expect(jsonToPlainText(json)).toBe('antes\nestilo\njsokdata\nnível 4\ndepois')
    expect(serialized).toContain('"type":"link","attrs":{"href":"https://ok.pt","title":null}')
    expect(jsonToMarkdown(json)).toBe('antes\n\nestilo\n\njs[ok](https://ok.pt)data\n\nnível 4\n\ndepois\n')
  })

  it('Markdown with embedded HTML is sanitised the same way', () => {
    const md = '<script>window.__pwned = true</script>\n\nok <img src=x onerror="window.__pwned=true">\n'
    const json = markdownToJson(md)
    expectSanitised(serializeDoc(json))
    expect(jsonToPlainText(json)).toBe('ok ')
  })
})

/** jsdom has no ClipboardEvent; ProseMirror only forwards the event to handlePaste hooks. */
const pasteEvent = () => Object.assign(new Event('paste'), { clipboardData: null }) as ClipboardEvent

describe('real editor paste path (ProseMirror clipboard parser)', () => {
  let editor: Editor | null = null
  afterEach(() => {
    editor?.destroy()
    editor = null
    delete (window as unknown as Record<string, unknown>)['__pwned']
  })

  it('view.pasteHTML drops scripts/handlers/unsafe links and never executes them', async () => {
    const element = document.createElement('div')
    document.body.append(element)
    editor = new Editor({ element, extensions: createEditorExtensions() })

    const handled = editor.view.pasteHTML(HOSTILE_HTML, pasteEvent())
    expect(handled).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 50))

    const serialized = serializeDoc(editor.getJSON())
    expectSanitised(serialized)
    expect(editor.getHTML()).not.toMatch(/<script|onerror|onclick|javascript:/i)
    expect(jsonToPlainText(editor.getJSON())).toContain('antes')
    expect(jsonToPlainText(editor.getJSON())).toContain('depois')
    expect((window as unknown as Record<string, unknown>)['__pwned']).toBeUndefined()
  })

  it('setContent(html) goes through the same schema rules', () => {
    editor = new Editor({ extensions: createEditorExtensions() })
    editor.commands.setContent(HOSTILE_HTML, { emitUpdate: false })
    expectSanitised(serializeDoc(editor.getJSON()))
  })

  it('pasting a taskRef span copies only the reference', () => {
    const element = document.createElement('div')
    document.body.append(element)
    editor = new Editor({ element, extensions: createEditorExtensions() })
    const id = '0190a6e4-7b5c-7d3e-9f10-2a3b4c5d6e7f'
    editor.view.pasteHTML(`<p><span data-task-ref="${id}">Título antigo ✅</span></p>`, pasteEvent())
    const serialized = serializeDoc(editor.getJSON())
    expect(serialized).toContain(`{"type":"taskRef","attrs":{"taskId":"${id}"}}`)
    expect(serialized).not.toContain('Título antigo')
  })
})
