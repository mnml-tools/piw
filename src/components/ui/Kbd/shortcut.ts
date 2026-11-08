/**
 * OS-aware shortcut rendering.
 *
 * Shortcuts are written once, platform-neutrally, as `+`-joined tokens:
 *   Mod      ⌘ on macOS, Ctrl elsewhere (the primary modifier)
 *   Ctrl     the Control key on every OS (⌃ on macOS)
 *   Alt      ⌥ on macOS (Option), Alt elsewhere
 *   Shift    ⇧ on macOS
 *   Meta     ⌘ on macOS, Win on Windows, Super on Linux
 * followed by one key: a letter, digit, `Enter`, `Esc`, `Space`, `Tab`, `Backspace`, `Delete`,
 * `ArrowUp`…, `PageUp`, `PageDown`, `Home`, `End`, `F1`…, or a symbol (`,` `\` `[` `+`).
 *
 * Modifier order is normalised: macOS ⌃⌥⌘⇧ (as in "⌘⇧Space", "⌥⌘Esc"), others Ctrl+Alt+Shift.
 */

export type Platform = 'macos' | 'windows' | 'linux';

type Modifier = 'ctrl' | 'alt' | 'shift' | 'meta';

interface ParsedShortcut {
  modifiers: Set<Modifier>;
  key: string;
}

const MODIFIER_ALIASES: Record<string, Modifier | 'mod'> = {
  mod: 'mod',
  cmdorctrl: 'mod',
  commandorcontrol: 'mod',
  ctrl: 'ctrl',
  control: 'ctrl',
  alt: 'alt',
  option: 'alt',
  opt: 'alt',
  shift: 'shift',
  meta: 'meta',
  cmd: 'meta',
  command: 'meta',
  super: 'meta',
  win: 'meta',
};

const MAC_ORDER: Modifier[] = ['ctrl', 'alt', 'meta', 'shift'];
const PC_ORDER: Modifier[] = ['meta', 'ctrl', 'alt', 'shift'];

const MAC_MODIFIER_GLYPH: Record<Modifier, string> = {
  ctrl: '⌃',
  alt: '⌥',
  shift: '⇧',
  meta: '⌘',
};
const MAC_MODIFIER_NAME: Record<Modifier, string> = {
  ctrl: 'Control',
  alt: 'Option',
  shift: 'Shift',
  meta: 'Command',
};

function pcModifierLabel(modifier: Modifier, platform: Platform): string {
  if (modifier === 'meta') return platform === 'windows' ? 'Win' : 'Super';
  return { ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift' }[modifier];
}
function pcModifierName(modifier: Modifier, platform: Platform): string {
  if (modifier === 'meta') return platform === 'windows' ? 'Windows' : 'Super';
  return { ctrl: 'Control', alt: 'Alt', shift: 'Shift' }[modifier];
}

/** Canonical key ids → [macOS label, other label, spoken name (mac), spoken name (other), aria key]. */
const KEYS: Record<string, [string, string, string, string, string]> = {
  enter: ['↵', 'Enter', 'Return', 'Enter', 'Enter'],
  return: ['↵', 'Enter', 'Return', 'Enter', 'Enter'],
  esc: ['esc', 'Esc', 'Escape', 'Escape', 'Escape'],
  escape: ['esc', 'Esc', 'Escape', 'Escape', 'Escape'],
  space: ['Space', 'Space', 'Space', 'Space', 'Space'],
  tab: ['⇥', 'Tab', 'Tab', 'Tab', 'Tab'],
  backspace: ['⌫', 'Backspace', 'Delete', 'Backspace', 'Backspace'],
  delete: ['⌦', 'Delete', 'Forward Delete', 'Delete', 'Delete'],
  del: ['⌦', 'Delete', 'Forward Delete', 'Delete', 'Delete'],
  arrowup: ['↑', '↑', 'Up Arrow', 'Up Arrow', 'ArrowUp'],
  up: ['↑', '↑', 'Up Arrow', 'Up Arrow', 'ArrowUp'],
  arrowdown: ['↓', '↓', 'Down Arrow', 'Down Arrow', 'ArrowDown'],
  down: ['↓', '↓', 'Down Arrow', 'Down Arrow', 'ArrowDown'],
  arrowleft: ['←', '←', 'Left Arrow', 'Left Arrow', 'ArrowLeft'],
  left: ['←', '←', 'Left Arrow', 'Left Arrow', 'ArrowLeft'],
  arrowright: ['→', '→', 'Right Arrow', 'Right Arrow', 'ArrowRight'],
  right: ['→', '→', 'Right Arrow', 'Right Arrow', 'ArrowRight'],
  pageup: ['PgUp', 'PgUp', 'Page Up', 'Page Up', 'PageUp'],
  pgup: ['PgUp', 'PgUp', 'Page Up', 'Page Up', 'PageUp'],
  pagedown: ['PgDn', 'PgDn', 'Page Down', 'Page Down', 'PageDown'],
  pgdn: ['PgDn', 'PgDn', 'Page Down', 'Page Down', 'PageDown'],
  home: ['Home', 'Home', 'Home', 'Home', 'Home'],
  end: ['End', 'End', 'End', 'End', 'End'],
  plus: ['+', '+', 'Plus', 'Plus', '+'],
  '+': ['+', '+', 'Plus', 'Plus', '+'],
  '-': ['-', '-', 'Minus', 'Minus', '-'],
  ',': [',', ',', 'Comma', 'Comma', ','],
  '.': ['.', '.', 'Period', 'Period', '.'],
  '/': ['/', '/', 'Slash', 'Slash', '/'],
  '\\': ['\\', '\\', 'Backslash', 'Backslash', '\\'],
  '[': ['[', '[', 'Left Bracket', 'Left Bracket', '['],
  ']': [']', ']', 'Right Bracket', 'Right Bracket', ']'],
  ';': [';', ';', 'Semicolon', 'Semicolon', ';'],
  "'": ["'", "'", 'Quote', 'Quote', "'"],
  '`': ['`', '`', 'Backquote', 'Backquote', '`'],
  '=': ['=', '=', 'Equals', 'Equals', '='],
};

function parseShortcut(shortcut: string, platform: Platform): ParsedShortcut {
  const trimmed = shortcut.trim();
  let tokens: string[];
  let key: string;
  if (trimmed === '+') {
    tokens = [];
    key = '+';
  } else if (trimmed.endsWith('++')) {
    tokens = trimmed.slice(0, -2).split('+');
    key = '+';
  } else {
    tokens = trimmed.split('+');
    key = tokens.pop() ?? '';
  }
  const modifiers = new Set<Modifier>();
  for (const raw of tokens) {
    const alias = MODIFIER_ALIASES[raw.trim().toLowerCase()];
    if (!alias) continue;
    if (alias === 'mod') modifiers.add(platform === 'macos' ? 'meta' : 'ctrl');
    else modifiers.add(alias);
  }
  return { modifiers, key: key.trim() };
}

function keyInfo(key: string): [string, string, string, string, string] {
  const known = KEYS[key.toLowerCase()];
  if (known) return known;
  const label = key.length === 1 ? key.toUpperCase() : key;
  return [label, label, label, label, label];
}

function ordered(parsed: ParsedShortcut, platform: Platform): Modifier[] {
  const order = platform === 'macos' ? MAC_ORDER : PC_ORDER;
  return order.filter((modifier) => parsed.modifiers.has(modifier));
}

/** The visible parts of a shortcut, one per key: `['⌘', '⇧', 'Space']` or `['Ctrl', 'Shift', 'Space']`. */
export function formatShortcutParts(
  shortcut: string,
  platform: Platform = detectPlatform(),
): string[] {
  const parsed = parseShortcut(shortcut, platform);
  const mac = platform === 'macos';
  const modifiers = ordered(parsed, platform).map((modifier) =>
    mac ? MAC_MODIFIER_GLYPH[modifier] : pcModifierLabel(modifier, platform),
  );
  const [macLabel, pcLabel] = keyInfo(parsed.key);
  return parsed.key ? [...modifiers, mac ? macLabel : pcLabel] : modifiers;
}

/** Renders a shortcut in OS notation: "⌘⇧Space" on macOS, "Ctrl+Shift+Space" elsewhere. */
export function formatShortcut(shortcut: string, platform: Platform = detectPlatform()): string {
  return formatShortcutParts(shortcut, platform).join(platform === 'macos' ? '' : '+');
}

/** Spells a shortcut out for assistive technology: "Command Shift Space" / "Control Shift Space". */
export function describeShortcut(shortcut: string, platform: Platform = detectPlatform()): string {
  const parsed = parseShortcut(shortcut, platform);
  const mac = platform === 'macos';
  const words = ordered(parsed, platform).map((modifier) =>
    mac ? MAC_MODIFIER_NAME[modifier] : pcModifierName(modifier, platform),
  );
  const [, , macName, pcName] = keyInfo(parsed.key);
  if (parsed.key) words.push(mac ? macName : pcName);
  return words.join(' ');
}

/** Value for the `aria-keyshortcuts` attribute, e.g. "Meta+Shift+Space". */
export function toAriaKeyShortcuts(
  shortcut: string,
  platform: Platform = detectPlatform(),
): string {
  const parsed = parseShortcut(shortcut, platform);
  const names: Record<Modifier, string> = {
    ctrl: 'Control',
    alt: 'Alt',
    shift: 'Shift',
    meta: 'Meta',
  };
  const parts = ordered(parsed, 'windows').map((modifier) => names[modifier]);
  if (parsed.key) parts.push(keyInfo(parsed.key)[4]);
  return parts.join('+');
}

/** Guesses the OS from a user-agent string. */
export function platformFromUserAgent(userAgent: string): Platform {
  if (/Mac|iPhone|iPad|iPod/i.test(userAgent)) return 'macos';
  if (/Win/i.test(userAgent)) return 'windows';
  return 'linux';
}

/**
 * The current OS: `data-platform` on <html> (set by the app from the backend), falling back to the
 * user agent.
 */
export function detectPlatform(): Platform {
  if (typeof document !== 'undefined') {
    const fromRoot = document.documentElement.dataset.platform;
    if (fromRoot === 'macos' || fromRoot === 'windows' || fromRoot === 'linux') return fromRoot;
  }
  return platformFromUserAgent(typeof navigator !== 'undefined' ? navigator.userAgent : '');
}
