import { listen } from '@tauri-apps/api/event';
import { isTauri } from '@tauri-apps/api/core';
import { AlertCircle, CalendarDays, Pin } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { SpaceMenu } from '@/components/app/SpaceMenu';
import {
  Button,
  cx,
  DateQuickPicker,
  IconButton,
  iconProps,
  Kbd,
  Segmented,
  TextArea,
  TextInput,
} from '@/components/ui';
import { formatDueDate, todayString } from '@/lib/dates';
import { useSettings, useSpaces } from '@/lib/hooks/data';
import { useHotkeys } from '@/lib/hooks/useHotkeys';
import type { CaptureOpenPayload } from '@/lib/ipc/bindings/CaptureOpenPayload';
import type { CaptureMode } from '@/lib/ipc/bindings/CaptureMode';
import { captureStrings as t } from '@/strings/capture';
import { hasContent, useCapture } from './useCapture';
import styles from './CaptureWindow.module.css';

const OPEN_EVENT = 'piw://capture/open';

/** The Quick Capture popup (docs/ui-design-system.md §11). */
export default function CaptureWindow() {
  const spaces = useSpaces();
  const settings = useSettings();
  const capture = useCapture(spaces.data, settings.data);
  const { form, state } = capture;
  const textRef = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  const retryRef = useRef<HTMLButtonElement>(null);
  const busy = state === 'saving';

  const focusText = () => {
    const field = textRef.current;
    if (!field) return;
    field.focus();
    const end = field.value.length;
    field.setSelectionRange(end, end);
  };

  // Shown by the shortcut, tray or CLI: restore any draft and put the caret in the text.
  // The caret must be ready immediately (docs/ui-design-system.md §11: < 150 ms), so focus is moved
  // synchronously and again after the draft (if any) has been restored.
  const { open } = capture;
  useEffect(() => {
    focusText();
    void open(null).then(() => requestAnimationFrame(focusText));
    const onWindowFocus = () => {
      if (document.activeElement === document.body || document.activeElement === null) {
        focusText();
      }
    };
    window.addEventListener('focus', onWindowFocus);
    if (!isTauri()) return () => window.removeEventListener('focus', onWindowFocus);
    const unlisten = listen<CaptureOpenPayload>(OPEN_EVENT, (event) => {
      focusText();
      void open(event.payload.mode).then(() => requestAnimationFrame(focusText));
    });
    return () => {
      window.removeEventListener('focus', onWindowFocus);
      void unlisten.then((stop) => stop());
    };
  }, [open]);

  // Losing focus hides the popup and keeps the draft, except while saving or after an error.
  const { dismiss } = capture;
  useEffect(() => {
    const onBlur = () => {
      setTimeout(() => {
        if (!document.hasFocus() && state === 'idle') void dismiss();
      }, 150);
    };
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, [dismiss, state]);

  useEffect(() => {
    if (state === 'error') retryRef.current?.focus();
  }, [state]);

  const setMode = (mode: CaptureMode) => {
    capture.setMode(mode);
    requestAnimationFrame(focusText);
  };

  useHotkeys({
    'Mod+Enter': () => void capture.submit(),
    'Mod+1': () => setMode('note'),
    'Mod+2': () => setMode('task'),
    'Mod+Shift+P': () => capture.update({ pin: !form.pin }),
    Escape: () => void capture.dismiss(),
    'Mod+Escape': () => void capture.dismiss(),
  });

  const onTitleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void capture.submit();
    }
  };
  // Escape must work inside text fields too (single-key hotkeys skip editable targets).
  const onFieldKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      void capture.dismiss();
    }
  };

  const today = todayString();
  const canSave = hasContent(form) && !busy;
  const dueLabel = form.dueDate ? formatDueDate(form.dueDate, today) : t.noDate;

  return (
    <main className={styles.root} aria-label={t.title}>
      <header className={styles.header} data-tauri-drag-region>
        <Segmented
          options={[
            { value: 'note', label: t.modes.note },
            { value: 'task', label: t.modes.task },
          ]}
          value={form.mode}
          onValueChange={setMode}
          aria-label={t.modeLabel}
          size="sm"
          disabled={busy}
        />
        <div className={styles.spacer} data-tauri-drag-region />
        <SpaceMenu
          spaces={spaces.data ?? []}
          value={form.spaceId}
          onChange={(spaceId) => capture.update({ spaceId })}
          label={t.space}
          disabled={busy}
        />
        {form.mode === 'task' && (
          <DateQuickPicker
            value={form.dueDate}
            onChange={(dueDate) => capture.update({ dueDate })}
            labels={t.dates}
            today={today}
            align="end"
            trigger={
              <Button
                size="sm"
                disabled={busy}
                className={cx(styles.date, !form.dueDate && styles.dateEmpty)}
                icon={<CalendarDays {...iconProps} />}
                aria-label={`${t.due}: ${dueLabel}`}
              >
                {dueLabel}
              </Button>
            }
          />
        )}
        <IconButton
          size="sm"
          className={styles.pin}
          aria-label={t.pin}
          icon={<Pin {...iconProps} fill={form.pin ? 'currentColor' : 'none'} />}
          pressed={form.pin}
          shortcut="Mod+Shift+P"
          disabled={busy}
          onClick={() => capture.update({ pin: !form.pin })}
        />
      </header>

      <div className={styles.body}>
        {form.mode === 'note' ? (
          <TextArea
            ref={textRef}
            variant="ghost"
            className={cx(styles.field, styles.noteField)}
            aria-label={t.notePlaceholder}
            placeholder={t.notePlaceholder}
            value={form.text}
            readOnly={busy}
            onKeyDown={onFieldKeyDown}
            onChange={(event) => capture.update({ text: event.target.value })}
          />
        ) : (
          <>
            <TextInput
              ref={textRef}
              variant="ghost"
              className={cx(styles.field, styles.titleField)}
              aria-label={t.taskPlaceholder}
              placeholder={t.taskPlaceholder}
              value={form.text}
              readOnly={busy}
              onKeyDown={(event) => {
                onFieldKeyDown(event);
                onTitleKeyDown(event);
              }}
              onChange={(event) => capture.update({ text: event.target.value })}
            />
            <TextArea
              variant="ghost"
              className={cx(styles.field, styles.descriptionField)}
              aria-label={t.descriptionPlaceholder}
              placeholder={t.descriptionPlaceholder}
              value={form.description}
              readOnly={busy}
              onKeyDown={onFieldKeyDown}
              onChange={(event) => capture.update({ description: event.target.value })}
            />
          </>
        )}
      </div>

      {state === 'error' && (
        <div className={styles.error} role="alert">
          <AlertCircle {...iconProps} className={styles.errorIcon} />
          <span className={styles.errorText}>
            {t.error}
            {capture.error && ` ${capture.error}`}
          </span>
          <Button
            ref={retryRef}
            size="sm"
            variant="ghost"
            className={styles.retry}
            onClick={() => void capture.submit()}
          >
            {t.retry}
          </Button>
        </div>
      )}

      <footer className={styles.footer} data-tauri-drag-region>
        <span className={styles.hints} data-tauri-drag-region>
          {canSave ? (
            <>
              <span className={styles.hint}>
                <Kbd shortcut="Mod+Enter" className={styles.key} /> {t.save}
              </span>
              <span className={styles.separator} aria-hidden="true">
                ·
              </span>
              <span className={styles.hint}>
                <Kbd shortcut="Escape" className={styles.key} /> {t.close}
              </span>
            </>
          ) : (
            !busy && t.writeFirst
          )}
        </span>
        <span className={styles.status} aria-live="polite">
          {busy ? (
            // Shown only when saving takes longer than 150 ms (CSS animation delay).
            <span className={styles.saving}>{t.saving}</span>
          ) : (
            capture.restored && (
              <>
                {t.draftRestored}
                <span className={styles.separator} aria-hidden="true">
                  ·
                </span>
                <button
                  type="button"
                  className={styles.link}
                  onClick={() => void capture.discard()}
                >
                  {t.discard}
                </button>
              </>
            )
          )}
        </span>
        <Button
          size="sm"
          variant="primary"
          disabled={!canSave}
          loading={busy}
          onClick={() => void capture.submit()}
        >
          {t.save}
        </Button>
      </footer>
    </main>
  );
}
