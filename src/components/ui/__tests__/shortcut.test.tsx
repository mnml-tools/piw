import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Kbd } from '../Kbd/Kbd';
import {
  describeShortcut,
  detectPlatform,
  formatShortcut,
  formatShortcutParts,
  platformFromUserAgent,
  toAriaKeyShortcuts,
} from '../Kbd/shortcut';
import { setPlatform } from '../test-utils';

afterEach(() => setPlatform(null));

describe('formatShortcut', () => {
  it('uses symbols without separators on macOS', () => {
    expect(formatShortcut('Mod+Shift+Space', 'macos')).toBe('⌘⇧Space');
    expect(formatShortcut('Mod+Enter', 'macos')).toBe('⌘↵');
    expect(formatShortcut('Mod+K', 'macos')).toBe('⌘K');
    expect(formatShortcut('Esc', 'macos')).toBe('esc');
    expect(formatShortcut('Mod+Backspace', 'macos')).toBe('⌘⌫');
  });

  it('uses words joined by + on Windows and Linux', () => {
    expect(formatShortcut('Mod+Shift+Space', 'windows')).toBe('Ctrl+Shift+Space');
    expect(formatShortcut('Mod+Shift+Space', 'linux')).toBe('Ctrl+Shift+Space');
    expect(formatShortcut('Mod+Enter', 'linux')).toBe('Ctrl+Enter');
    expect(formatShortcut('Esc', 'windows')).toBe('Esc');
  });

  it('normalises modifier order per platform', () => {
    expect(formatShortcut('Shift+Alt+Mod+K', 'macos')).toBe('⌥⌘⇧K');
    expect(formatShortcut('Mod+Ctrl+Q', 'macos')).toBe('⌃⌘Q');
    expect(formatShortcut('Shift+Alt+Mod+K', 'windows')).toBe('Ctrl+Alt+Shift+K');
  });

  it('maps Meta to the platform key and lowercases nothing but letters', () => {
    expect(formatShortcut('Meta+Space', 'windows')).toBe('Win+Space');
    expect(formatShortcut('Meta+Space', 'linux')).toBe('Super+Space');
    expect(formatShortcut('Meta+Space', 'macos')).toBe('⌘Space');
    expect(formatShortcut('mod+n', 'linux')).toBe('Ctrl+N');
  });

  it('handles symbol keys, including +', () => {
    expect(formatShortcut('Mod+\\', 'linux')).toBe('Ctrl+\\');
    expect(formatShortcut('Mod+,', 'macos')).toBe('⌘,');
    expect(formatShortcut('Mod++', 'linux')).toBe('Ctrl++');
    expect(formatShortcut('Ctrl+PageDown', 'windows')).toBe('Ctrl+PgDn');
  });

  it('returns one part per key for key caps', () => {
    expect(formatShortcutParts('Mod+Shift+Space', 'macos')).toEqual(['⌘', '⇧', 'Space']);
    expect(formatShortcutParts('Mod+Shift+Space', 'linux')).toEqual(['Ctrl', 'Shift', 'Space']);
  });
});

describe('describeShortcut / toAriaKeyShortcuts', () => {
  it('spells shortcuts out per platform', () => {
    expect(describeShortcut('Mod+Shift+Space', 'linux')).toBe('Control Shift Space');
    expect(describeShortcut('Mod+Shift+Space', 'macos')).toBe('Command Shift Space');
    expect(describeShortcut('Mod+Enter', 'macos')).toBe('Command Return');
  });

  it('produces aria-keyshortcuts values', () => {
    expect(toAriaKeyShortcuts('Mod+Shift+P', 'macos')).toBe('Meta+Shift+P');
    expect(toAriaKeyShortcuts('Mod+Shift+P', 'windows')).toBe('Control+Shift+P');
    expect(toAriaKeyShortcuts('Alt+ArrowUp', 'linux')).toBe('Alt+ArrowUp');
  });
});

describe('platform detection', () => {
  it('prefers data-platform on <html>', () => {
    setPlatform('macos');
    expect(detectPlatform()).toBe('macos');
    expect(formatShortcut('Mod+K')).toBe('⌘K');
    setPlatform('windows');
    expect(formatShortcut('Mod+K')).toBe('Ctrl+K');
  });

  it('falls back to the user agent', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15',
    );
    expect(detectPlatform()).toBe('macos');
  });

  it('parses common user agents', () => {
    expect(platformFromUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('windows');
    expect(platformFromUserAgent('Mozilla/5.0 (X11; Linux x86_64)')).toBe('linux');
    expect(platformFromUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)')).toBe('macos');
  });
});

describe('Kbd', () => {
  it('shows OS notation and exposes the spelled-out shortcut', () => {
    setPlatform('linux');
    const { container } = render(<Kbd shortcut="Mod+Shift+Space" />);
    expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent('Ctrl+Shift+Space');
    expect(screen.getByText('Control Shift Space')).toHaveClass('visually-hidden');
  });

  it('renders one key cap per key in the chip variant', () => {
    setPlatform('macos');
    const { container } = render(<Kbd shortcut="Mod+Shift+Space" variant="chip" />);
    const caps = container.querySelectorAll('kbd kbd');
    expect(Array.from(caps, (cap) => cap.textContent)).toEqual(['⌘', '⇧', 'Space']);
  });
});
