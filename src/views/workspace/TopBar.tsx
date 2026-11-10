import { Palette } from 'lucide-react';
import { useState } from 'react';
import { workspaceStrings as t } from '@/strings/workspace';
import { AppearanceDialog } from './AppearanceDialog';

const s = t.topBar;

/*
 * Pieces of the window chrome (docs/ui-design-system.md, "Title bar"), shared by the vault shell's
 * title bar (views/vault/VaultApp.tsx).
 */

/** The app mark (the pen nib from the app icon) as a one-colour glyph, the kit's brand icon. */
export function AppMark() {
  return (
    <svg viewBox="224 165 660 660" width="14" height="14" aria-hidden="true">
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M356 208 432 172C610 268 774 404 784 546 788 588 770 620 748 640L770 694C776 708 768 722 754 728L566 806C550 813 534 806 527 792L500 752C382 744 330 642 322 520 316 404 330 300 348 224 350 216 352 211 356 208ZM376 202 410 186 514 410 482 424ZM530 418A68 68 0 1 0 530.1 418Z"
      />
    </svg>
  );
}

/** The kit's `ThemeToggle` (the palette in Zap's title bar), opening Piw's appearance dialog. */
export function AppearanceToggle() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="mnml-button mnml-theme-toggle"
        data-tauri-drag-region="false"
        title={s.appearance}
        aria-label={s.appearance}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Palette size={14} aria-hidden="true" />
      </button>
      <AppearanceDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
