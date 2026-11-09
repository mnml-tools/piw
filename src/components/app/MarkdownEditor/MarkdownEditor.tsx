import { Compartment, EditorSelection, EditorState } from '@codemirror/state';
import { EditorView, placeholder as placeholderText } from '@codemirror/view';
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { cx } from '@/components/ui/utils';
import { liveMarkdown, replaceText } from './live-markdown';
import styles from './MarkdownEditor.module.css';

export interface MarkdownEditorHandle {
  /** Moves focus into the text; `end` puts the caret after the last character. */
  focus: (at?: 'end') => void;
  /** The current text. */
  text: () => string;
  /** Adopts text from elsewhere, keeping the caret: not an edit (no `onChange`, no undo). */
  replaceText: (text: string) => void;
}

export interface MarkdownEditorProps {
  /** Initial text; later text arrives through the handle's `replaceText`. */
  defaultValue: string;
  /** Accessible name of the text. */
  label: string;
  placeholder?: string;
  readOnly?: boolean;
  /** Every edit made in the editor. */
  onChange: (text: string) => void;
  /** Esc without modifiers. When absent, Esc does nothing here. */
  onEscape?: () => void;
  /** Sets the typography and `--md-inset` (see MarkdownEditor.module.css). */
  className?: string;
  ref?: Ref<MarkdownEditorHandle>;
}

/**
 * A quick note's text as live Markdown (live-markdown.ts): uncontrolled, so typing never
 * re-renders the host. Shared by the workspace note editor and the note sticky.
 */
export function MarkdownEditor({
  defaultValue,
  label,
  placeholder,
  readOnly = false,
  onChange,
  onEscape,
  className,
  ref,
}: MarkdownEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const callbacks = useRef({ onChange, onEscape });
  const [access] = useState(() => new Compartment());
  const [hint] = useState(() => new Compartment());
  // Read once: the editor is created per mount, as the textarea's `defaultValue`.
  const initial = useRef({ defaultValue, label, placeholder, readOnly });

  useEffect(() => {
    callbacks.current = { onChange, onEscape };
  }, [onChange, onEscape]);

  useEffect(() => {
    const parent = host.current;
    if (!parent) return;
    const start = initial.current;
    const editor = new EditorView({
      parent,
      state: EditorState.create({
        doc: start.defaultValue,
        extensions: [
          liveMarkdown({
            onEdit: (text) => callbacks.current.onChange(text),
            onEscape: () => callbacks.current.onEscape?.(),
          }),
          EditorView.contentAttributes.of({ 'aria-label': start.label }),
          access.of(readOnlyExtension(start.readOnly)),
          hint.of(start.placeholder ? placeholderText(start.placeholder) : []),
        ],
      }),
    });
    view.current = editor;
    return () => {
      editor.destroy();
      view.current = null;
    };
  }, [access, hint]);

  useEffect(() => {
    view.current?.dispatch({ effects: access.reconfigure(readOnlyExtension(readOnly)) });
  }, [access, readOnly]);

  useEffect(() => {
    view.current?.dispatch({
      effects: hint.reconfigure(placeholder ? placeholderText(placeholder) : []),
    });
  }, [hint, placeholder]);

  useImperativeHandle(
    ref,
    () => ({
      focus: (at) => {
        const editor = view.current;
        if (!editor) return;
        editor.focus();
        if (at === 'end') {
          editor.dispatch({
            selection: EditorSelection.cursor(editor.state.doc.length),
            scrollIntoView: true,
          });
        }
      },
      text: () => view.current?.state.doc.toString() ?? '',
      replaceText: (text) => {
        if (view.current) replaceText(view.current, text);
      },
    }),
    [],
  );

  return <div ref={host} className={cx(styles.root, className)} />;
}

function readOnlyExtension(readOnly: boolean) {
  return [
    EditorState.readOnly.of(readOnly),
    EditorView.contentAttributes.of(readOnly ? { 'aria-readonly': 'true' } : {}),
  ];
}
