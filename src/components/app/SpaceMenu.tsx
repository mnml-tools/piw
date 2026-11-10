import { ChevronDown } from 'lucide-react';
import { Button, DropdownMenu, SpaceDot } from '@/components/ui';

interface SpaceMenuProps {
  /** The vault's spaces (top-level folders), by name. */
  spaces: readonly string[];
  value: string | null;
  onChange: (space: string) => void;
  /** Accessible name of the trigger, e.g. "Space". */
  label: string;
  disabled?: boolean;
}

/** Space picker: a soft (secondary) Button with a round dot, the space's name and a chevron. */
export function SpaceMenu({ spaces, value, onChange, label, disabled }: SpaceMenuProps) {
  const current = value !== null && spaces.includes(value) ? value : null;
  return (
    <DropdownMenu
      align="end"
      trigger={
        <Button
          variant="secondary"
          size="sm"
          disabled={disabled}
          aria-label={`${label}: ${current ?? '—'}`}
          iconEnd={<ChevronDown aria-hidden />}
        >
          <SpaceDot color="plain" label={current ?? '—'} />
        </Button>
      }
      items={[
        {
          id: 'spaces',
          type: 'radio-group',
          label,
          value: value ?? '',
          onValueChange: onChange,
          options: spaces.map((space) => ({ value: space, label: space })),
        },
      ]}
    />
  );
}
