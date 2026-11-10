import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/ipc/api';
import type { CaptureDraft } from '@/lib/ipc/bindings/CaptureDraft';
import type { CaptureMode } from '@/lib/ipc/bindings/CaptureMode';
import type { CaptureSpace } from '@/lib/ipc/bindings/CaptureSpace';
import { IpcError } from '@/lib/ipc/client';
import { initialSpace, rememberCaptureSpace } from '@/lib/vault/capture-space';

export { initialSpace };

export type CaptureState = 'idle' | 'saving' | 'error';

export interface CaptureForm {
  mode: CaptureMode;
  text: string;
  description: string;
  spaceId: string | null;
  dueDate: string | null;
  pin: boolean;
}

export const EMPTY_FORM: CaptureForm = {
  mode: 'note',
  text: '',
  description: '',
  spaceId: null,
  dueDate: null,
  pin: false,
};

const DRAFT_DELAY = 300;

export function hasContent(form: CaptureForm): boolean {
  return form.text.trim().length > 0 || form.description.trim().length > 0;
}

function toDraft(form: CaptureForm): CaptureDraft {
  return {
    mode: form.mode,
    text: form.text,
    description: form.description,
    spaceId: form.spaceId,
    dueDate: form.dueDate,
    pin: form.pin,
  };
}

/**
 * Switching modes never loses text (docs/ui-design-system.md §11): Note → Task makes the first line
 * the title and the rest the description; Task → Note joins title, newline and description.
 */
export function switchMode(form: CaptureForm, mode: CaptureMode): CaptureForm {
  if (form.mode === mode) return form;
  if (mode === 'task') {
    const [first = '', ...rest] = form.text.split('\n');
    const description = [rest.join('\n').trim(), form.description.trim()]
      .filter(Boolean)
      .join('\n\n');
    return { ...form, mode, text: first.trim(), description };
  }
  const text = [form.text, form.description].filter((part) => part.trim()).join('\n');
  return { ...form, mode, text, description: '' };
}

/**
 * Appends the capture to `<space>/Inbox.md` (a note's text, or a task line with its due date and
 * description). Resolves only after the file was written (docs/ui-design-system.md §11); Pin puts
 * that Inbox on the desktop.
 */
async function persistCapture(form: CaptureForm): Promise<void> {
  const path = await api.vaultCapture({
    space: form.spaceId,
    mode: form.mode,
    text: form.mode === 'task' ? form.text.trim() : form.text,
    description: form.description,
    due: form.mode === 'task' ? form.dueDate : null,
  });
  if (form.pin) await api.vaultPinNote(path).catch(() => undefined);
}

/**
 * State and behaviour of the Quick Capture window: draft recovery, lossless mode switching,
 * save-then-close, and errors that keep the text.
 */
export function useCapture(spaces: readonly string[] | undefined, setting: CaptureSpace) {
  const [rawForm, setForm] = useState<CaptureForm>(EMPTY_FORM);
  // Until the user picks one, the space follows settings (and arrives once spaces load).
  const form = useMemo(
    () =>
      rawForm.spaceId === null
        ? { ...rawForm, spaceId: initialSpace(spaces ?? [], setting) }
        : rawForm,
    [rawForm, spaces, setting],
  );
  const [state, setState] = useState<CaptureState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formRef = useRef(form);
  useEffect(() => {
    formRef.current = form;
  }, [form]);

  const saveDraft = useCallback((next: CaptureForm) => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      draftTimer.current = null;
      void api.saveCaptureDraft(toDraft(next)).catch(() => undefined);
    }, DRAFT_DELAY);
  }, []);

  const flushDraft = useCallback(async () => {
    if (!draftTimer.current) return;
    clearTimeout(draftTimer.current);
    draftTimer.current = null;
    await api.saveCaptureDraft(toDraft(formRef.current)).catch(() => undefined);
  }, []);

  const update = useCallback(
    (patch: Partial<CaptureForm>) => {
      setForm((current) => {
        const next = { ...current, ...patch };
        saveDraft(next.spaceId ? next : { ...next, spaceId: formRef.current.spaceId });
        return next;
      });
      if (state === 'error') setState('idle');
    },
    [saveDraft, state],
  );

  /** Called whenever the window is shown (shortcut, tray, CLI). */
  const open = useCallback(
    async (mode: CaptureMode | null) => {
      setError(null);
      setState('idle');
      const draft = await api.getCaptureDraft().catch(() => null);
      if (draft && (draft.text.trim() || draft.description.trim())) {
        setForm({
          mode: draft.mode,
          text: draft.text,
          description: draft.description,
          spaceId: draft.spaceId ?? initialSpace(spaces ?? [], setting),
          dueDate: draft.dueDate,
          pin: draft.pin,
        });
        setRestored(true);
        return;
      }
      setRestored(false);
      setForm((current) =>
        hasContent(current)
          ? switchMode(current, mode ?? current.mode)
          : {
              ...EMPTY_FORM,
              mode: mode ?? current.mode,
              spaceId: initialSpace(spaces ?? [], setting),
            },
      );
    },
    [spaces, setting],
  );

  const submit = useCallback(async (): Promise<boolean> => {
    const current = formRef.current;
    if (!hasContent(current) || state === 'saving') return false;
    if (current.mode === 'task' && !current.text.trim()) {
      setError('A task needs a title.');
      setState('error');
      return false;
    }
    setState('saving');
    setError(null);
    try {
      await persistCapture(current);
    } catch (cause) {
      // Keep the text and the draft so nothing is lost; the user can retry.
      setError(cause instanceof IpcError ? cause.message : 'Couldn’t save.');
      setState('error');
      await flushDraft();
      return false;
    }
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = null;
    await api.clearCaptureDraft().catch(() => undefined);
    if (current.spaceId) rememberCaptureSpace(current.spaceId);
    setForm({ ...EMPTY_FORM, mode: current.mode, spaceId: current.spaceId });
    setRestored(false);
    setState('idle');
    await api.hideCapture().catch(() => undefined);
    return true;
  }, [flushDraft, state]);

  const setMode = useCallback(
    (mode: CaptureMode) => {
      setForm((current) => {
        const next = switchMode(
          { ...current, spaceId: current.spaceId ?? formRef.current.spaceId },
          mode,
        );
        saveDraft(next);
        return next;
      });
    },
    [saveDraft],
  );

  /** "Draft restored · Discard": clears the text and the stored draft. */
  const discard = useCallback(async () => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = null;
    setForm((current) => ({ ...EMPTY_FORM, mode: current.mode, spaceId: current.spaceId }));
    setRestored(false);
    await api.clearCaptureDraft().catch(() => undefined);
  }, []);

  /** Esc / blur: keep the draft and hide. */
  const dismiss = useCallback(async () => {
    await flushDraft();
    await api.hideCapture().catch(() => undefined);
  }, [flushDraft]);

  return { form, update, setMode, open, submit, dismiss, discard, state, error, restored };
}
