import type { AnyExtension, JSONContent, MarkdownRendererHelpers } from '@tiptap/core'
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight'
import { isAllowedUri, Link } from '@tiptap/extension-link'
import { Placeholder } from '@tiptap/extensions'
import { Markdown } from '@tiptap/markdown'
import { StarterKit } from '@tiptap/starter-kit'
import { common, createLowlight } from 'lowlight'

import { Checklist, ChecklistItem, CHECKLIST_ITEM_NODE_NAME, CHECKLIST_NODE_NAME } from './checklist'
import { TaskRef } from './task-ref'

/** Link protocols allowed in content (and therefore in pasted/imported HTML/Markdown). */
export const ALLOWED_LINK_PROTOCOLS = ['http', 'https', 'mailto'] as const

type Lowlight = ReturnType<typeof createLowlight>

/**
 * Single URL policy for links typed, pasted, or imported from Markdown:
 * upstream validation (blocks javascript:, data:, vbscript:…) + an allow-list.
 * Relative URLs and fragments are allowed; the app must still open links
 * through the Tauri opener, never by navigating the webview.
 */
export function isSafeHref(url: unknown): url is string {
  if (typeof url !== 'string' || url.trim() === '') return false
  if (!isAllowedUri(url, [...ALLOWED_LINK_PROTOCOLS])) return false
  // eslint-disable-next-line no-control-regex
  const compact = url.replace(/[\s\u0000-\u001f\u007f-\u009f]/g, '')
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(compact)?.[1]?.toLowerCase()
  return scheme === undefined || (ALLOWED_LINK_PROTOCOLS as readonly string[]).includes(scheme)
}

/**
 * Link mark with a minimal canonical shape: only `href` and `title` are
 * stored. Upstream also stores target/rel/class, which (a) lets pasted HTML
 * inject arbitrary classes/targets into our JSON and (b) freezes the rel
 * policy into every saved document. Here rel is applied at render time only.
 * Markdown import also goes through the URL policy (upstream does not check
 * hrefs coming from Markdown).
 */
const SafeLink = Link.extend({
  addAttributes() {
    return {
      href: { default: null, parseHTML: (element: HTMLElement) => element.getAttribute('href') },
      title: { default: null },
    }
  },
  parseMarkdown(token, helpers) {
    const content = helpers.parseInline(token.tokens ?? [])
    if (!isSafeHref(token['href'])) return content
    return helpers.applyMark('link', content, {
      href: token['href'],
      title: typeof token['title'] === 'string' && token['title'] !== '' ? token['title'] : null,
    })
  },
})

let defaultLowlight: Lowlight | null = null

/** Shared lowlight instance with highlight.js "common" grammars (37 languages). */
export function getDefaultLowlight(): Lowlight {
  defaultLowlight ??= createLowlight(common)
  return defaultLowlight
}

export interface EditorExtensionOptions {
  /** Placeholder for the empty editor. Omit to disable the extension. */
  placeholder?: string
  /** Syntax highlighter; defaults to lowlight + highlight.js "common". */
  lowlight?: Lowlight
  /**
   * Replace the headless TaskRef with a variant that adds a NodeView (e.g. the
   * React one from src/react). The schema MUST stay identical (same name/attrs).
   */
  taskRef?: typeof TaskRef
  /** Register the Markdown extension (editor.getMarkdown(), contentType: 'markdown'). */
  markdown?: boolean
}

/** Longest run of consecutive backticks in a string. */
function longestBacktickRun(text: string): number {
  let longest = 0
  for (const match of text.matchAll(/`+/g)) {
    longest = Math.max(longest, match[0].length)
  }
  return longest
}

/**
 * Code block with highlighting. Overrides upstream renderMarkdown, which always
 * uses a ``` fence and therefore corrupts code that itself contains ```.
 * The fence is now always longer than any backtick run inside the code.
 */
const CodeBlock = CodeBlockLowlight.extend({
  renderMarkdown(node: JSONContent, helpers: MarkdownRendererHelpers) {
    const language = typeof node.attrs?.['language'] === 'string' ? node.attrs['language'] : ''
    const body = node.content ? helpers.renderChildren(node.content) : ''
    const fence = '`'.repeat(Math.max(3, longestBacktickRun(body) + 1))
    return `${fence}${language}\n${body}\n${fence}`
  },
})

/**
 * The single source of truth for the document schema used by content tabs.
 * Every consumer (editor, Markdown export, HTML paste/import, tests) must use
 * the same list, otherwise JSON produced by one window could be rejected or
 * silently stripped by another.
 */
export function createEditorExtensions(options: EditorExtensionOptions = {}): AnyExtension[] {
  const extensions: AnyExtension[] = [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      // Replaced by CodeBlock (lowlight) below.
      codeBlock: false,
      // No Markdown equivalent; keeping it would make the export lossy.
      underline: false,
      // Replaced by SafeLink below.
      link: false,
      listKeymap: {
        listTypes: [
          { itemName: 'listItem', wrapperNames: ['bulletList', 'orderedList'] },
          { itemName: CHECKLIST_ITEM_NODE_NAME, wrapperNames: [CHECKLIST_NODE_NAME] },
        ],
      },
    }),
    SafeLink.configure({
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
      defaultProtocol: 'https',
      protocols: [...ALLOWED_LINK_PROTOCOLS],
      isAllowedUri: (url) => isSafeHref(url),
      HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: null, class: null },
    }),
    CodeBlock.configure({
      lowlight: options.lowlight ?? getDefaultLowlight(),
      defaultLanguage: null,
      enableTabIndentation: true,
      tabSize: 2,
    }),
    Checklist,
    ChecklistItem,
    options.taskRef ?? TaskRef,
  ]

  if (options.placeholder !== undefined) {
    extensions.push(Placeholder.configure({ placeholder: options.placeholder }))
  }
  if (options.markdown ?? false) {
    extensions.push(Markdown.configure({ indentation: { style: 'space', size: 2 } }))
  }
  return extensions
}
