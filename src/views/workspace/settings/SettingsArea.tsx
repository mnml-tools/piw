import { CheckCircle2, AlertTriangle, MinusCircle } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { PageColumn, PageScroll, PageView, ViewToolbar } from '@/components/app/Page';
import {
  AccentPicker,
  Button,
  Kbd,
  Segmented,
  TabPanel,
  Tabs,
  detectPlatform,
  useToast,
} from '@/components/ui';
import { useAppStatus, useSettings } from '@/lib/hooks/data';
import { api } from '@/lib/ipc/api';
import type { Settings } from '@/lib/ipc/bindings/Settings';
import type { ShortcutStatus } from '@/lib/ipc/bindings/ShortcutStatus';
import { IpcError } from '@/lib/ipc/client';
import { buildExport, exportFolderName } from '@/lib/export/build';
import { recordAccelerator } from '@/lib/shortcuts/accelerator';
import { common } from '@/strings/common';
import { settingsStrings as t } from '@/strings/settings';
import styles from './SettingsArea.module.css';
import { useShortcutStatus } from './useShortcutStatus';

type TabId = keyof typeof t.tabs;
const TABS: TabId[] = ['general', 'shortcuts', 'appearance', 'data', 'stickies'];
const ID_BASE = 'settings';

/** Tauri accelerator → the neutral notation used by <Kbd> ("Mod+Shift+Space"). */
function toKbd(accelerator: string): string {
  return accelerator.replace('CommandOrControl', 'Mod').replace('Super', 'Meta');
}

/**
 * A kit-style group: an optional 10px uppercase sidebar label, the rows in one square bordered
 * box split by hairlines, and an optional footnote.
 */
function Group({
  label,
  children,
  footnote,
}: {
  label?: string;
  children: ReactNode;
  footnote?: ReactNode;
}) {
  const id = useId();
  return (
    <section className={styles.group} aria-labelledby={label ? id : undefined}>
      {label && (
        <h2 id={id} className={styles.groupLabel}>
          {label}
        </h2>
      )}
      <div className={styles.rows}>{children}</div>
      {footnote && <p className={styles.footnote}>{footnote}</p>}
    </section>
  );
}

/** One setting: label and description on the left, its control on the right. */
function Row({
  label,
  description,
  children,
}: {
  label: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={styles.row}>
      <div className={styles.rowText}>
        <span className={styles.label}>{label}</span>
        {description && <span className={styles.description}>{description}</span>}
      </div>
      {children && <div className={styles.control}>{children}</div>}
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    // The whole row is the switch's label: a click anywhere on it toggles.
    <label className={`${styles.row} ${styles.toggleRow}`}>
      <span className={styles.rowText}>
        <span className={styles.label}>{label}</span>
        {hint && <span className={styles.description}>{hint}</span>}
      </span>
      <span className={styles.control}>
        <input
          type="checkbox"
          role="switch"
          className={styles.switch}
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
      </span>
    </label>
  );
}

function StatusLine({ status }: { status: ShortcutStatus | null }) {
  if (!status) return null;
  const s = t.shortcuts.status;
  const [tone, text] = ((): ['ok' | 'warn' | 'off', string] => {
    switch (status.state) {
      case 'registered':
        return ['ok', status.backend === 'portal' ? s.registeredPortal : s.registered];
      case 'pending':
        return ['off', s.pending];
      case 'in_use':
        return ['warn', s.inUse];
      case 'invalid':
        return ['warn', s.invalid];
      case 'unavailable':
        return ['warn', `${s.unavailable}: ${status.reason}`];
      case 'disabled':
        return ['off', s.disabled];
    }
  })();
  const Icon = tone === 'ok' ? CheckCircle2 : tone === 'warn' ? AlertTriangle : MinusCircle;
  return (
    <span className={`${styles.status} ${styles[tone]}`} role="status">
      <Icon aria-hidden size={14} /> {text}
      {status.state === 'registered' && status.trigger && (
        <span className={styles.statusHint}> · {t.shortcuts.trigger(status.trigger)}</span>
      )}
      {status.state === 'registered' && status.limitation && (
        <span className={styles.statusHint}> · {status.limitation}</span>
      )}
    </span>
  );
}

function DataActions() {
  const { toast } = useToast();
  const [busy, setBusy] = useState<'export' | 'backup' | null>(null);
  const report = (error: unknown) =>
    toast({
      tone: 'error',
      message: error instanceof IpcError ? error.message : common.toasts.genericError,
    });

  const runExport = async () => {
    setBusy('export');
    try {
      const folder = await api.chooseExportFolder();
      if (!folder) return;
      const files = buildExport(await api.exportData());
      const written = await api.writeExport(exportFolderName(), files);
      toast({ message: t.data.exported(written), duration: 12_000 });
    } catch (error) {
      report(error);
    } finally {
      setBusy(null);
    }
  };

  const runBackup = async () => {
    setBusy('backup');
    try {
      const path = await api.backupDatabase();
      if (path) toast({ message: t.data.backedUp(path), duration: 12_000 });
    } catch (error) {
      report(error);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Group label={t.data.exportGroup} footnote={t.data.restoreHow}>
      <Row label={t.data.export} description={t.data.exportBody}>
        <Button
          size="sm"
          variant="secondary"
          loading={busy === 'export'}
          onClick={() => void runExport()}
        >
          {t.data.exportButton}
        </Button>
      </Row>
      <Row label={t.data.backup} description={t.data.backupBody}>
        <Button
          size="sm"
          variant="secondary"
          loading={busy === 'backup'}
          onClick={() => void runBackup()}
        >
          {t.data.backupButton}
        </Button>
      </Row>
    </Group>
  );
}

/** Settings (docs/ui-design-system.md §10). Changes apply immediately; there is no Save button. */
export default function SettingsArea() {
  const settings = useSettings();
  const status = useAppStatus();
  const shortcut = useShortcutStatus();
  const { toast } = useToast();
  const [tab, setTab] = useState<TabId>('general');
  const [recording, setRecording] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);
  const platform = detectPlatform();
  const s = settings.data;

  const update = (patch: Partial<Settings>) =>
    void api.updateSettings(patch).catch((error: unknown) =>
      toast({
        tone: 'error',
        message: error instanceof IpcError ? error.message : common.toasts.genericError,
      }),
    );

  const onRecordKey = (event: React.KeyboardEvent) => {
    event.preventDefault();
    if (event.key === 'Escape') {
      setRecording(false);
      setRecordError(null);
      return;
    }
    const result = recordAccelerator(event.nativeEvent, platform);
    if (result.ok) {
      setRecording(false);
      setRecordError(null);
      update({ captureShortcut: result.accelerator });
    } else if (result.reason !== 'incomplete') {
      setRecordError(
        result.reason === 'reserved' ? t.shortcuts.reserved : t.shortcuts.needsModifier,
      );
    }
  };

  if (!s) return null;

  return (
    <PageView aria-labelledby="settings-title">
      <ViewToolbar
        title={t.title}
        titleId="settings-title"
        note={t.general.version(status.data?.version ?? '')}
        className={styles.header}
      />
      {/* Quiet text tabs on the form column, under the title. */}
      <Tabs
        idBase={ID_BASE}
        aria-label={t.title}
        items={TABS.map((id) => ({ id, label: t.tabs[id] }))}
        value={tab}
        onValueChange={(id) => setTab(id as TabId)}
        className={styles.tabs}
      />
      <PageScroll>
        <PageColumn width="narrow">
          <TabPanel idBase={ID_BASE} tabId={tab} className={styles.panel}>
            {tab === 'general' && (
              <>
                <Group label={t.general.startup}>
                  <Toggle
                    label={t.general.launchAtLogin}
                    checked={s.launchAtLogin}
                    onChange={(v) => update({ launchAtLogin: v })}
                  />
                  <Toggle
                    label={t.general.closeToTray}
                    checked={s.closeToTray}
                    onChange={(v) => update({ closeToTray: v })}
                  />
                </Group>
                <Group label={t.general.capture}>
                  <Row label={t.general.captureSpace}>
                    <Segmented
                      size="sm"
                      aria-label={t.general.captureSpace}
                      value={s.captureSpace}
                      onValueChange={(v) => update({ captureSpace: v })}
                      options={[
                        { value: 'last_used', label: t.general.captureSpaceLast },
                        { value: 'default', label: t.general.captureSpaceDefault },
                      ]}
                    />
                  </Row>
                </Group>
                <Group label={t.general.about}>
                  <Row
                    label={t.general.version(status.data?.version ?? '')}
                    description={t.general.offline}
                  >
                    <span className={styles.value}>{t.general.licence}</span>
                  </Row>
                </Group>
              </>
            )}

            {tab === 'shortcuts' && (
              <>
                <Group label={t.shortcuts.global}>
                  <div className={styles.row}>
                    <div className={styles.rowText}>
                      <span className={styles.label}>{t.shortcuts.quickCapture}</span>
                      <StatusLine status={shortcut.status} />
                      {recordError && (
                        <span className={`${styles.status} ${styles.warn}`}>{recordError}</span>
                      )}
                    </div>
                    <div className={styles.control}>
                      {recording ? (
                        <input
                          className={styles.recorder}
                          // eslint-disable-next-line jsx-a11y-x/no-autofocus -- the recorder must capture the next key press
                          autoFocus
                          readOnly
                          aria-label={t.shortcuts.recording}
                          value={t.shortcuts.recording}
                          onKeyDown={onRecordKey}
                          onBlur={() => setRecording(false)}
                        />
                      ) : s.captureShortcut ? (
                        <Kbd variant="chip" shortcut={toKbd(s.captureShortcut)} />
                      ) : (
                        <span className={styles.value}>{t.shortcuts.status.disabled}</span>
                      )}
                      <Button size="sm" variant="secondary" onClick={() => setRecording(true)}>
                        {s.captureShortcut ? t.shortcuts.change : t.shortcuts.set}
                      </Button>
                      {s.captureShortcut && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => update({ captureShortcut: null })}
                        >
                          {t.shortcuts.clear}
                        </Button>
                      )}
                      {shortcut.status &&
                        shortcut.status.state !== 'registered' &&
                        s.captureShortcut && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void api.retryShortcut()}
                          >
                            {t.shortcuts.retry}
                          </Button>
                        )}
                    </div>
                  </div>
                </Group>
                <Group label={t.shortcuts.fallbackTitle}>
                  <div className={styles.block}>
                    <p className={styles.description}>{t.shortcuts.fallbackBody}</p>
                    <pre className={styles.code}>piw --quick-note{'\n'}piw --quick-task</pre>
                  </div>
                </Group>
                <Group label={t.shortcuts.inApp}>
                  <dl className={styles.reference}>
                    {t.shortcuts.reference.map(([keys, label]) => (
                      <div key={keys} className={styles.row}>
                        <dt className={styles.label}>{label}</dt>
                        <dd className={styles.control}>
                          <Kbd shortcut={keys} />
                        </dd>
                      </div>
                    ))}
                  </dl>
                </Group>
              </>
            )}

            {tab === 'appearance' && (
              <Group>
                <Row label={t.appearance.theme}>
                  <Segmented
                    size="sm"
                    aria-label={t.appearance.theme}
                    value={s.theme}
                    onValueChange={(v) => update({ theme: v })}
                    options={(['system', 'light', 'dark'] as const).map((v) => ({
                      value: v,
                      label: t.appearance.themes[v],
                    }))}
                  />
                </Row>
                <Row label={t.appearance.accent}>
                  <AccentPicker
                    label={t.appearance.accent}
                    names={t.appearance.accents}
                    value={s.accent}
                    onValueChange={(v) => update({ accent: v })}
                  />
                </Row>
                <Row label={t.appearance.textSize}>
                  <Segmented
                    size="sm"
                    aria-label={t.appearance.textSize}
                    value={s.textSize}
                    onValueChange={(v) => update({ textSize: v })}
                    options={(['small', 'default', 'large'] as const).map((v) => ({
                      value: v,
                      label: t.appearance.sizes[v],
                    }))}
                  />
                </Row>
              </Group>
            )}

            {tab === 'data' && (
              <>
                <Group label={t.data.storage}>
                  <Row
                    label={t.data.location}
                    description={
                      <code className={styles.path}>{status.data?.dataPath ?? t.data.unknown}</code>
                    }
                  />
                </Group>
                <DataActions />
              </>
            )}

            {tab === 'stickies' && (
              <Group>
                <Toggle
                  label={t.stickies.restore}
                  hint={t.stickies.restoreHint}
                  checked={s.restoreStickiesOnLaunch}
                  onChange={(v) => update({ restoreStickiesOnLaunch: v })}
                />
                <Row label={t.stickies.reset} description={t.stickies.resetHint}>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      void api
                        .resetStickyPositions()
                        .then(() => toast({ message: t.stickies.resetDone }))
                        .catch((error: unknown) =>
                          toast({
                            tone: 'error',
                            message:
                              error instanceof IpcError
                                ? error.message
                                : common.toasts.genericError,
                          }),
                        )
                    }
                  >
                    {t.stickies.resetButton}
                  </Button>
                </Row>
              </Group>
            )}
          </TabPanel>
        </PageColumn>
      </PageScroll>
    </PageView>
  );
}
