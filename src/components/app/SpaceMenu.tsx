import { ChevronDown } from 'lucide-react';
import { Button, DropdownMenu, SpaceDot } from '@/components/ui';
import type { Space } from '@/lib/ipc/bindings/Space';
import { spaceColor } from './space-color';

interface SpaceMenuProps {
  spaces: readonly Space[];
  value: string | null;
  onChange: (spaceId: string) => void;
  /** Accessible name of the trigger, e.g. "Space". */
  label: string;
  disabled?: boolean;
}

/** Space picker: a soft (secondary) Button with the space's round dot, its name and a chevron. */
export function SpaceMenu({ spaces, value, onChange, label, disabled }: SpaceMenuProps) {
  const current = spaces.find((space) => space.id === value);
  return (
    <DropdownMenu
      align="end"
      trigger={
        <Button
          variant="secondary"
          size="sm"
          disabled={disabled}
          aria-label={`${label}: ${current?.name ?? '—'}`}
          iconEnd={<ChevronDown aria-hidden />}
        >
          <SpaceDot color={spaceColor(current)} label={current?.name ?? '—'} />
        </Button>
      }
      items={[
        {
          id: 'spaces',
          type: 'radio-group',
          label,
          value: value ?? '',
          onValueChange: onChange,
          options: spaces.map((space) => ({ value: space.id, label: space.name })),
        },
      ]}
    />
  );
}
