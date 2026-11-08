import type { ReactNode } from 'react';

interface MenuEntryBase {
  /** Stable key, unique within its list. */
  id: string;
}

/** A command. Labels start with a verb; add "…" when it opens a dialog or picker. */
export interface MenuItemEntry extends MenuEntryBase {
  type?: 'item';
  label: string;
  icon?: ReactNode;
  /** Platform-neutral shortcut hint (`Mod+Shift+P`), rendered per OS and as `aria-keyshortcuts`. */
  shortcut?: string;
  disabled?: boolean;
  /** Destructive commands (Move to Trash, Delete forever…). */
  danger?: boolean;
  onSelect: () => void;
}

export interface MenuCheckboxEntry extends MenuEntryBase {
  type: 'checkbox';
  label: string;
  icon?: ReactNode;
  shortcut?: string;
  disabled?: boolean;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

export interface MenuRadioOption {
  value: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
}

/** A set of `menuitemradio`s (sort order, colour, space). */
export interface MenuRadioGroupEntry extends MenuEntryBase {
  type: 'radio-group';
  /** Accessible name of the group (and visible heading when `showLabel`). */
  label?: string;
  showLabel?: boolean;
  value: string;
  onValueChange: (value: string) => void;
  options: ReadonlyArray<MenuRadioOption>;
}

export interface MenuSeparatorEntry extends MenuEntryBase {
  type: 'separator';
}

/** Non-interactive heading inside a menu. */
export interface MenuLabelEntry extends MenuEntryBase {
  type: 'label';
  label: string;
}

/** "Move to space ▸", "Colour ▸". */
export interface MenuSubmenuEntry extends MenuEntryBase {
  type: 'submenu';
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  items: ReadonlyArray<MenuEntry>;
}

export type MenuEntry =
  | MenuItemEntry
  | MenuCheckboxEntry
  | MenuRadioGroupEntry
  | MenuSeparatorEntry
  | MenuLabelEntry
  | MenuSubmenuEntry;
