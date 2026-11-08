import { Check, ChevronRight } from 'lucide-react';
import type { DropdownMenu as DropdownPrimitive } from 'radix-ui';
import type { ReactNode } from 'react';
import { Kbd } from '../Kbd/Kbd';
import { toAriaKeyShortcuts } from '../Kbd/shortcut';
import { cx, iconProps } from '../utils';
import styles from './Menu.module.css';
import type { MenuEntry } from './types';

/** The Radix parts shared by DropdownMenu and ContextMenu (same shapes, different scopes). */
export type MenuPrimitives = Pick<
  typeof DropdownPrimitive,
  | 'Item'
  | 'CheckboxItem'
  | 'RadioGroup'
  | 'RadioItem'
  | 'ItemIndicator'
  | 'Separator'
  | 'Label'
  | 'Sub'
  | 'SubTrigger'
  | 'SubContent'
  | 'Portal'
>;

interface MenuEntriesProps {
  primitives: MenuPrimitives;
  entries: ReadonlyArray<MenuEntry>;
  /** Called before any item's own handler (used to remember the menu's invoker). */
  onAnySelect?: () => void;
}

function hasIndicator(entries: ReadonlyArray<MenuEntry>): boolean {
  return entries.some((entry) => entry.type === 'checkbox' || entry.type === 'radio-group');
}

function hasIcon(entries: ReadonlyArray<MenuEntry>): boolean {
  return entries.some((entry) =>
    entry.type === 'radio-group'
      ? entry.options.some((option) => option.icon)
      : 'icon' in entry && Boolean(entry.icon),
  );
}

function Shortcut({ shortcut }: { shortcut: string }) {
  // The item carries aria-keyshortcuts; the visible hint is not read twice.
  return (
    <span className={styles.shortcut} aria-hidden="true">
      <Kbd shortcut={shortcut} />
    </span>
  );
}

/** Renders a data-driven menu with the given Radix primitives. */
export function MenuEntries({ primitives: P, entries, onAnySelect }: MenuEntriesProps) {
  const indicator = hasIndicator(entries);
  const withIcons = hasIcon(entries);
  const indicatorSlot = (
    <span className={styles.indicator}>
      <P.ItemIndicator>
        <Check {...iconProps} />
      </P.ItemIndicator>
    </span>
  );
  const emptyIndicator = indicator ? <span className={styles.indicator} /> : null;
  // Labels line up when only some items have an icon.
  const iconSlot = (icon: ReactNode) =>
    icon ? (
      <span className={styles.icon}>{icon}</span>
    ) : withIcons ? (
      <span className={styles.icon} />
    ) : null;

  return (
    <>
      {entries.map((entry) => {
        switch (entry.type) {
          case 'separator':
            return <P.Separator key={entry.id} className={styles.separator} />;
          case 'label':
            return (
              <P.Label key={entry.id} className={styles.label}>
                {entry.label}
              </P.Label>
            );
          case 'checkbox':
            return (
              <P.CheckboxItem
                key={entry.id}
                className={styles.item}
                checked={entry.checked}
                onCheckedChange={(checked) => {
                  onAnySelect?.();
                  entry.onCheckedChange(checked === true);
                }}
                disabled={entry.disabled}
                textValue={entry.label}
                aria-keyshortcuts={entry.shortcut ? toAriaKeyShortcuts(entry.shortcut) : undefined}
              >
                {indicatorSlot}
                {iconSlot(entry.icon)}
                <span className={styles.itemLabel}>{entry.label}</span>
                {entry.shortcut && <Shortcut shortcut={entry.shortcut} />}
              </P.CheckboxItem>
            );
          case 'radio-group':
            return (
              <P.RadioGroup
                key={entry.id}
                value={entry.value}
                onValueChange={(value) => {
                  onAnySelect?.();
                  entry.onValueChange(value);
                }}
                aria-label={entry.showLabel ? undefined : entry.label}
              >
                {entry.showLabel && entry.label && (
                  <P.Label className={styles.label}>{entry.label}</P.Label>
                )}
                {entry.options.map((option) => (
                  <P.RadioItem
                    key={option.value}
                    value={option.value}
                    disabled={option.disabled}
                    textValue={option.label}
                    className={styles.item}
                  >
                    {indicatorSlot}
                    {iconSlot(option.icon)}
                    <span className={styles.itemLabel}>{option.label}</span>
                  </P.RadioItem>
                ))}
              </P.RadioGroup>
            );
          case 'submenu':
            return (
              <P.Sub key={entry.id}>
                <P.SubTrigger
                  className={styles.item}
                  disabled={entry.disabled}
                  textValue={entry.label}
                >
                  {emptyIndicator}
                  {iconSlot(entry.icon)}
                  <span className={styles.itemLabel}>{entry.label}</span>
                  <ChevronRight {...iconProps} className={styles.subChevron} />
                </P.SubTrigger>
                <P.Portal>
                  <P.SubContent className={styles.content} sideOffset={2} alignOffset={-4}>
                    <MenuEntries primitives={P} entries={entry.items} onAnySelect={onAnySelect} />
                  </P.SubContent>
                </P.Portal>
              </P.Sub>
            );
          default:
            return (
              <P.Item
                key={entry.id}
                className={cx(styles.item, entry.danger && styles.danger)}
                disabled={entry.disabled}
                onSelect={() => {
                  onAnySelect?.();
                  entry.onSelect();
                }}
                textValue={entry.label}
                aria-keyshortcuts={entry.shortcut ? toAriaKeyShortcuts(entry.shortcut) : undefined}
              >
                {emptyIndicator}
                {iconSlot(entry.icon)}
                <span className={styles.itemLabel}>{entry.label}</span>
                {entry.shortcut && <Shortcut shortcut={entry.shortcut} />}
              </P.Item>
            );
        }
      })}
    </>
  );
}
