import { EditorContent, useEditor } from '@tiptap/react';
import type { Editor, JSONContent } from '@tiptap/react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { createEditorExtensions } from '../extensions';
import { normalizeDoc } from '../serialization';
import type { DocJSON } from '../serialization';
import { applyExternalContent } from '../sync';
import { TaskRefWithReactView } from './TaskRefView';

/*
 * Usage (one instance per open content tab):
 *
 *   <TaskRefProvider store={taskStore} onToggle={(id) => ipc.toggleTask(id)}>
 *     <DocumentEditor
 *       content={tab.contentJson}               // from SQLite via Rust
 *       onChange={(json) => autosave.schedule(tab.id, json)}   // caller debounces
 *     />
 *   </TaskRefProvider>
 *
 * On save, send Rust: serializeDoc(json) (stored), jsonToPlainText(json) (FTS)
 * and extractTaskRefIds(json) (optional link index). When Rust broadcasts that
 * the tab changed in another window, pass the new JSON object as `content`.
 */
export interface DocumentEditorProps {
  /**
   * Content of the tab (canonical JSON from SQLite). Passing a NEW object
   * applies it as an external update (other window, reload) without calling
   * onChange. Do not feed onChange output back here on every keystroke.
   */
  content: JSONContent;
  /** Every user edit, as canonical JSON. Debounce/persist in the caller. */
  onChange: (json: DocJSON) => void;
  editable?: boolean;
  placeholder?: string;
  /** Stored content does not fit the schema: shown read-only, never autosaved. */
  onContentError?: (error: Error) => void;
  onReady?: (editor: Editor) => void;
  className?: string;
}

type Validated = { ok: true } | { ok: false; error: Error };

function validate(content: JSONContent): Validated {
  try {
    normalizeDoc(content);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
  }
}

export function DocumentEditor(props: DocumentEditorProps) {
  // Validate BEFORE Tiptap sees the content: on invalid JSON Tiptap falls back
  // to an empty document, and an autosave would then erase the stored data.
  const validated = useMemo(() => validate(props.content), [props.content]);
  const { onContentError } = props;
  useEffect(() => {
    if (!validated.ok) onContentError?.(validated.error);
  }, [validated, onContentError]);

  if (!validated.ok) {
    return (
      <div role="alert" className="document-editor document-editor--invalid">
        This content was created by a newer version of Piw or is damaged. It has not been changed.
      </div>
    );
  }
  // Pass the caller's object (already validated) so LiveEditor can recognise its own echo by identity.
  return <LiveEditor {...props} />;
}

function LiveEditor({
  content,
  onChange,
  editable = true,
  placeholder,
  onContentError,
  onReady,
  className,
}: DocumentEditorProps) {
  const callbacks = useRef({ onChange, onContentError, onReady });
  useLayoutEffect(() => {
    callbacks.current = { onChange, onContentError, onReady };
  });
  const lastEmitted = useRef<JSONContent | null>(null);
  const blocked = useRef(false);

  // Created ONCE per mounted tab. Recreating the editor (new extensions or deps)
  // would reload `content` and drop unsaved keystrokes, so placeholder changes
  // after mount are ignored and content changes go through applyExternalContent.
  const [extensions] = useState(() =>
    createEditorExtensions({
      taskRef: TaskRefWithReactView,
      ...(placeholder !== undefined ? { placeholder } : {}),
    }),
  );
  const [initialContent] = useState(content);
  const [initialEditable] = useState(editable);

  const editor = useEditor(
    {
      extensions,
      content: initialContent,
      editable: initialEditable,
      immediatelyRender: true,
      shouldRerenderOnTransaction: false,
      enableContentCheck: true,
      onCreate: ({ editor: e }) => callbacks.current.onReady?.(e),
      onContentError: ({ editor: e, error }) => {
        blocked.current = true;
        e.setEditable(false, false);
        callbacks.current.onContentError?.(error);
      },
      onUpdate: ({ editor: e }) => {
        if (blocked.current) return;
        const json = e.getJSON() as DocJSON;
        lastEmitted.current = json;
        callbacks.current.onChange(json);
      },
    },
    [],
  );

  // External updates: skip our own echo cheaply (identity), then compare canonically.
  useEffect(() => {
    if (content === lastEmitted.current) return;
    applyExternalContent(editor, content);
  }, [editor, content]);

  useEffect(() => {
    // emitUpdate=false: toggling editability must not look like an edit (autosave).
    editor.setEditable(editable && !blocked.current, false);
  }, [editor, editable]);

  return <EditorContent editor={editor} className={className ?? 'document-editor'} />;
}
