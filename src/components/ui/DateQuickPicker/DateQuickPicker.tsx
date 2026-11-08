import { CalendarDays, CalendarX } from 'lucide-react';
import { DropdownMenu as DropdownPrimitive } from 'radix-ui';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactElement } from 'react';
import { Button } from '../Button/Button';
import menuStyles from '../Menu/Menu.module.css';
import { TextInput } from '../TextInput/TextInput';
import { cx, iconProps } from '../utils';
import { isISODate, resolveQuickDate, todayISO, type QuickDateOption } from './dates';

export interface DateQuickPickerLabels {
  /** "Today" */
  today: string;
  /** "Tomorrow" */
  tomorrow: string;
  /** "Next week" */
  nextWeek: string;
  /** "Pick a date…" */
  pick: string;
  /** "Remove date" */
  clear: string;
  /** Label of the native date field, e.g. "Due date". */
  pickInput: string;
  /** Submit button of the date field, e.g. "Set date". */
  apply: string;
}

export interface DateQuickPickerProps {
  /** Current due date ('YYYY-MM-DD') or null. */
  value: string | null;
  /** Receives 'YYYY-MM-DD', or null for "Remove date". */
  onChange: (value: string | null) => void;
  /** The trigger, rendered "as child" (e.g. a ghost Button showing "Today ▾" / "No date ▾"). */
  trigger: ReactElement;
  labels: DateQuickPickerLabels;
  /** Injected "today" ('YYYY-MM-DD'); default: the local date when an option is chosen. */
  today?: string;
  align?: 'start' | 'center' | 'end';
  className?: string;
}

/**
 * DatePicker-lite: a menu with Today · Tomorrow · Next week · Pick a date… · Remove date.
 * "Pick a date…" swaps the menu for a native `<input type="date">` (Enter or the button sets it;
 * Esc closes). Returns 'YYYY-MM-DD' | null.
 */
export function DateQuickPicker({
  value,
  onChange,
  trigger,
  labels,
  today,
  align = 'start',
  className,
}: DateQuickPickerProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'menu' | 'pick'>('menu');
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const inputId = useId();
  const getToday = () => today ?? todayISO();

  useEffect(() => {
    if (open && mode === 'pick') inputRef.current?.focus();
  }, [open, mode]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setMode('menu');
      setDraft(value ?? getToday());
    }
  };

  const choose = (option: QuickDateOption) => {
    onChange(resolveQuickDate(option, getToday()));
  };

  const quick: Array<[QuickDateOption, string]> = [
    ['today', labels.today],
    ['tomorrow', labels.tomorrow],
    ['nextWeek', labels.nextWeek],
  ];

  // Keys typed in the date field must not reach the menu's typeahead / Tab handling.
  const keepKeys = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape') event.stopPropagation();
  };

  return (
    <DropdownPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DropdownPrimitive.Trigger asChild>{trigger}</DropdownPrimitive.Trigger>
      <DropdownPrimitive.Portal>
        <DropdownPrimitive.Content
          className={cx(menuStyles.content, className)}
          align={align}
          sideOffset={4}
          collisionPadding={8}
        >
          {mode === 'menu' ? (
            <>
              {quick.map(([option, label]) => (
                <DropdownPrimitive.Item
                  key={option}
                  className={menuStyles.item}
                  textValue={label}
                  onSelect={() => choose(option)}
                >
                  <span className={menuStyles.icon} />
                  <span className={menuStyles.itemLabel}>{label}</span>
                </DropdownPrimitive.Item>
              ))}
              <DropdownPrimitive.Item
                className={menuStyles.item}
                textValue={labels.pick}
                onSelect={(event) => {
                  event.preventDefault(); // keep the surface open for the date field
                  setMode('pick');
                }}
              >
                <span className={menuStyles.icon}>
                  <CalendarDays {...iconProps} />
                </span>
                <span className={menuStyles.itemLabel}>{labels.pick}</span>
              </DropdownPrimitive.Item>
              <DropdownPrimitive.Separator className={menuStyles.separator} />
              <DropdownPrimitive.Item
                className={menuStyles.item}
                textValue={labels.clear}
                disabled={value == null}
                onSelect={() => choose('clear')}
              >
                <span className={menuStyles.icon}>
                  <CalendarX {...iconProps} />
                </span>
                <span className={menuStyles.itemLabel}>{labels.clear}</span>
              </DropdownPrimitive.Item>
            </>
          ) : (
            <form
              className={menuStyles.form}
              onSubmit={(event) => {
                event.preventDefault();
                if (!isISODate(draft)) return;
                onChange(draft);
                setOpen(false);
              }}
            >
              <TextInput
                ref={inputRef}
                id={inputId}
                type="date"
                size="sm"
                label={labels.pickInput}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={keepKeys}
              />
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={!isISODate(draft)}
                onKeyDown={keepKeys}
              >
                {labels.apply}
              </Button>
            </form>
          )}
        </DropdownPrimitive.Content>
      </DropdownPrimitive.Portal>
    </DropdownPrimitive.Root>
  );
}
