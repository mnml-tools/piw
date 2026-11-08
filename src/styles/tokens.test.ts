/**
 * Guards the design tokens: the dark theme blocks stay identical, essential colour pairs keep
 * WCAG AA contrast, and every `var(--token)` used by a stylesheet is defined somewhere.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..');
const tokens = readFileSync(join(__dirname, 'tokens.css'), 'utf8');

/** Body of the first rule whose selector text is exactly `selector`. */
function block(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`missing block ${selector}`);
  let depth = 0;
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}' && --depth === 0) return css.slice(css.indexOf('{', start) + 1, i);
  }
  throw new Error(`unterminated block ${selector}`);
}

function declarations(body: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const match of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    map.set(match[1]!, match[2]!.replace(/\s+/g, ' ').trim());
  }
  return map;
}

type Rgb = [number, number, number];

function parseColor(value: string): { rgb: Rgb; alpha: number } {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const n = Number.parseInt(hex[1]!, 16);
    return { rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255], alpha: 1 };
  }
  const rgba = /^rgba?\(([^)]+)\)$/.exec(value);
  if (rgba) {
    const [r, g, b, a = '1'] = rgba[1]!.split(',').map((part) => part.trim());
    return { rgb: [Number(r), Number(g), Number(b)], alpha: Number(a) };
  }
  throw new Error(`unsupported colour ${value}`);
}

function luminance([r, g, b]: Rgb): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Resolves a token to an opaque colour, compositing translucent values onto `base`. */
function resolver(theme: Map<string, string>) {
  const resolve = (name: string, base?: Rgb): Rgb => {
    const value = theme.get(name);
    if (value === undefined) throw new Error(`undefined token ${name}`);
    const ref = /^var\((--[\w-]+)\)$/.exec(value);
    if (ref) return resolve(ref[1]!, base);
    const { rgb, alpha } = parseColor(value.toLowerCase());
    if (alpha === 1) return rgb;
    if (!base) throw new Error(`${name} is translucent: give a base surface`);
    return rgb.map((c, i) => Math.round(c * alpha + base[i]! * (1 - alpha))) as Rgb;
  };
  return resolve;
}

const light = declarations(block(tokens, ':root'));
const darkManual = declarations(block(tokens, ":root[data-theme='dark']"));
const darkSystem = declarations(block(tokens, ":root:not([data-theme='light'])"));
const dark = new Map([...light, ...darkManual]);

describe('design tokens', () => {
  it('keeps the manual and system dark themes identical', () => {
    expect([...darkSystem]).toEqual([...darkManual]);
  });

  it('defines every colour token of the light theme in the dark theme too', () => {
    const missing = [...light.keys()].filter(
      (name) =>
        (name.startsWith('--color-') ||
          /^--sticky-.*-(bg|border|text|text-muted|dot)$|^--sticky-(hover|active)$/.test(name)) &&
        !darkManual.has(name) &&
        !/^var\(/.test(light.get(name)!),
    );
    expect(missing).toEqual([]);
  });

  const TEXT = 4.5;
  const UI = 3;
  // The canvas, the top bar / Settings groups, and menus / dialogs.
  const surfaces = ['--color-bg', '--color-bg-soft', '--color-bg-elevated'];

  for (const [themeName, theme] of [
    ['light', light],
    ['dark', dark],
  ] as const) {
    describe(`${themeName} theme contrast`, () => {
      const resolve = resolver(theme);
      const pairs: [string, string, number][] = [];
      for (const surface of surfaces) {
        pairs.push(['--color-text', surface, TEXT]);
        pairs.push(['--color-text-muted', surface, TEXT]); // secondary
        pairs.push(['--color-text-subtle', surface, TEXT]); // tertiary metadata, counts, hints
        pairs.push(['--color-accent', surface, TEXT]); // links, "today"
        pairs.push(['--color-danger', surface, TEXT]);
        pairs.push(['--color-icon', surface, UI]);
        pairs.push(['--color-focus-ring', surface, UI]);
        pairs.push(['--color-accent-mark', surface, UI]); // active tab underline
        pairs.push(['--color-border-strong', surface, UI]); // the task checkbox ring
        pairs.push(['--color-accent-fill', surface, UI]); // a checked box must read as filled
      }
      // Non-essential: placeholders sit in labelled fields, so they get a legibility floor.
      for (const surface of ['--color-bg', '--color-bg-elevated']) {
        pairs.push(['--color-placeholder', surface, 2.8]);
      }
      pairs.push(['--color-accent-contrast', '--color-accent-fill', TEXT]);
      pairs.push(['--color-accent-contrast', '--color-accent-fill-hover', TEXT]);
      pairs.push(['--color-danger-contrast', '--color-danger-fill', TEXT]);
      pairs.push(['--color-danger-contrast', '--color-danger-fill-hover', TEXT]);
      pairs.push(['--color-notice-text', '--color-notice-bg', TEXT]);
      pairs.push(['--color-danger', '--color-danger-subtle', TEXT]);
      pairs.push(['--color-success', '--color-bg', TEXT]);
      pairs.push(['--color-warning', '--color-bg', TEXT]);
      pairs.push(['--color-text', '--color-highlight', TEXT]);
      const syntax = ['keyword', 'string', 'number', 'function', 'comment', 'identifier'];
      for (const role of [...syntax, 'parameter', 'operator']) {
        pairs.push([`--color-code-${role}`, '--color-code-bg', TEXT]);
      }

      it.each(pairs)('%s on %s ≥ %s', (fg, bg, min) => {
        expect(contrast(resolve(fg), resolve(bg))).toBeGreaterThanOrEqual(min);
      });

      it('keeps text and secondary text readable on both selection fills', () => {
        const canvas = resolve('--color-bg');
        for (const fill of ['--color-bg-active', '--color-bg-active-accent']) {
          const selected = resolve(fill, canvas);
          expect(contrast(resolve('--color-text'), selected)).toBeGreaterThanOrEqual(TEXT);
          expect(contrast(resolve('--color-text-muted'), selected)).toBeGreaterThanOrEqual(TEXT);
          expect(contrast(resolve('--color-focus-ring'), selected)).toBeGreaterThanOrEqual(UI);
        }
      });

      it('keeps the top bar readable: the active area pill and the search field', () => {
        const bar = resolve('--color-bg-soft');
        const pill = resolve('--color-bg-active', bar);
        const field = resolve('--color-bg-control', bar);
        expect(contrast(resolve('--color-text'), pill)).toBeGreaterThanOrEqual(TEXT);
        expect(contrast(resolve('--color-text-muted'), field)).toBeGreaterThanOrEqual(TEXT);
      });

      it.each(['plain', 'yellow', 'peach', 'rose', 'mint', 'sky', 'lavender'])(
        'sticky %s: text, muted text, focus ring and space dot',
        (name) => {
          const bg = resolve(`--sticky-${name}-bg`);
          expect(contrast(resolve(`--sticky-${name}-text`), bg)).toBeGreaterThanOrEqual(TEXT);
          expect(contrast(resolve(`--sticky-${name}-text-muted`), bg)).toBeGreaterThanOrEqual(TEXT);
          expect(
            contrast(resolve(`--sticky-${name}-text-muted`), resolve('--sticky-active', bg)),
          ).toBeGreaterThanOrEqual(TEXT);
          expect(contrast(resolve('--color-focus-ring'), bg)).toBeGreaterThanOrEqual(UI);
          for (const surface of surfaces) {
            expect(contrast(resolve(`--sticky-${name}-dot`), resolve(surface))).toBeGreaterThan(UI);
          }
        },
      );
    });
  }
});

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return cssFiles(path);
    return path.endsWith('.css') ? [path] : [];
  });
}

describe('stylesheets', () => {
  it('only reference tokens that are defined', () => {
    const files = cssFiles(SRC);
    const all = files.map((file) => readFileSync(file, 'utf8')).join('\n');
    const defined = new Set([...all.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]!));
    const undefinedRefs = files.flatMap((file) => {
      const css = readFileSync(file, 'utf8');
      return [...css.matchAll(/var\((--[\w-]+)\s*(,)?/g)]
        .filter((m) => !m[2] && !m[1]!.startsWith('--radix-') && !defined.has(m[1]!))
        .map((m) => `${file.slice(SRC.length + 1)}: ${m[1]}`);
    });
    expect([...new Set(undefinedRefs)]).toEqual([]);
  });

  it('keep raw colours inside tokens.css', () => {
    const offenders = cssFiles(SRC)
      .filter((file) => !file.endsWith('tokens.css'))
      .flatMap((file) =>
        readFileSync(file, 'utf8')
          .split('\n')
          .map((line, i) => [line, i + 1] as const)
          .filter(([line]) =>
            /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(line.replace(/\/\*.*?\*\//g, '')),
          )
          .map(([, n]) => `${file.slice(SRC.length + 1)}:${n}`),
      );
    expect(offenders).toEqual([]);
  });
});
