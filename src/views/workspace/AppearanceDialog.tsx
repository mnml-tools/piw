import { AccentPicker, Button, Dialog, Segmented, useToast } from '@/components/ui';
import { useSettings } from '@/lib/hooks/data';
import { api } from '@/lib/ipc/api';
import type { Settings } from '@/lib/ipc/bindings/Settings';
import { IpcError } from '@/lib/ipc/client';
import { common } from '@/strings/common';
import { settingsStrings } from '@/strings/settings';
import { workspaceStrings } from '@/strings/workspace';
import styles from './AppearanceDialog.module.css';

const t = settingsStrings.appearance;

/**
 * The title bar's appearance dialog, as the kit's `AppearanceDialog` in Zap: colour mode and
 * accent colour, applied at once. Piw keeps them in its settings (with System as a mode), so it
 * is built from the same parts instead of the kit's localStorage theme store.
 */
export function AppearanceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const settings = useSettings().data;
  const { toast } = useToast();
  const update = (patch: Partial<Settings>) =>
    void api.updateSettings(patch).catch((error: unknown) =>
      toast({
        tone: 'error',
        message: error instanceof IpcError ? error.message : common.toasts.genericError,
      }),
    );

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={workspaceStrings.topBar.appearance}
      showClose={false}
      padding="none"
      className={`mnml-appearance-dialog ${styles.dialog}`}
      footer={
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          {workspaceStrings.topBar.done}
        </Button>
      }
    >
      {settings && (
        <div className="mnml-appearance-options">
          <div>{t.theme}</div>
          <Segmented
            className="mnml-appearance-modes"
            aria-label={t.theme}
            value={settings.theme}
            onValueChange={(theme) => update({ theme })}
            options={(['system', 'light', 'dark'] as const).map((value) => ({
              value,
              label: t.themes[value],
            }))}
          />
          <div>{t.accent}</div>
          <AccentPicker
            className={styles.accents}
            label={t.accent}
            names={t.accents}
            value={settings.accent}
            onValueChange={(accent) => update({ accent })}
          />
        </div>
      )}
    </Dialog>
  );
}
