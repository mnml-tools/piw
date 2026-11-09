/**
 * Guards the design tokens: Piw's semantic tokens resolved against the shared kit's
 * (@mnml-tools/ui) keep WCAG contrast in both colour modes and with every accent, Piw's own
 * colours exist in both modes, and every `var(--token)` used by a stylesheet is defined.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..');
const tokens = readFileSync(join(__dirname, 'tokens.css'), 'utf8');
const kitTokensPath = createRequire(import.meta.url).resolve('@mnml-tools/ui/tokens.css');
const kitTokens = readFileSync(kitTokensPath, 'utf8');
const KIT_ACCENTS = ['pink', 'blue', 'orange', 'green', 'purple'] as const;

/** Body of the first rule whose selector text ends with `selector`. */
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
type Rgba = { rgb: Rgb; alpha: number };

function parseColor(value: string): Rgba {
  if (value === 'transparent') return { rgb: [0, 0, 0], alpha: 0 };
  const hex = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(value);
  if (hex) {
    const n = Number.parseInt(hex[1]!, 16);
    const alpha = hex[2] ? Number.parseInt(hex[2], 16) / 255 : 1;
    return { rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255], alpha };
  }
  const rgba = /^rgba?\(([^)]+)\)$/.exec(value);
  if (rgba) {
    const [r, g, b, a = '1'] = rgba[1]!.split(',').map((part) => part.trim());
    return { rgb: [Number(r), Number(g), Number(b)], alpha: Number(a) };
  }
  throw new Error(`unsupported colour ${value}`);
}

/** Splits `a, b(c, d), e` at its top-level commas. */
function splitArgs(args: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of args) {
    if (char === '(') depth++;
    if (char === ')') depth--;
    if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else current += char;
  }
  return [...parts, current.trim()];
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

/**
 * Resolves a token to an opaque colour: follows var() and color-mix(in srgb, …), and composites
 * translucent values onto `base`.
 */
function resolver(theme: Map<string, string>) {
  const evaluate = (value: string): Rgba => {
    const ref = /^var\((--[\w-]+)\)$/.exec(value);
    if (ref) {
      const next = theme.get(ref[1]!);
      if (next === undefined) throw new Error(`undefined token ${ref[1]}`);
      return evaluate(next);
    }
    const mix = /^color-mix\(in srgb,(.*)\)$/.exec(value);
    if (mix) {
      const [a, b] = splitArgs(mix[1]!).map((part) => {
        const weighted = /^(.*?)\s+(\d+(?:\.\d+)?)%$/.exec(part);
        return weighted
          ? { color: evaluate(weighted[1]!), weight: Number(weighted[2]) / 100 }
          : { color: evaluate(part), weight: undefined };
      }) as [{ color: Rgba; weight?: number }, { color: Rgba; weight?: number }];
      const p = a.weight ?? (b.weight === undefined ? 0.5 : 1 - b.weight);
      // Premultiplied mixing, as CSS does.
      const alpha = a.color.alpha * p + b.color.alpha * (1 - p);
      const rgb = a.color.rgb.map((c, i) =>
        alpha === 0
          ? 0
          : Math.round((c * a.color.alpha * p + b.color.rgb[i]! * b.color.alpha * (1 - p)) / alpha),
      ) as Rgb;
      return { rgb, alpha };
    }
    return parseColor(value.toLowerCase());
  };
  return (name: string, base?: Rgb): Rgb => {
    const { rgb, alpha } = evaluate(`var(${name})`);
    if (alpha === 1) return rgb;
    if (!base) throw new Error(`${name} is translucent: give a base surface`);
    return rgb.map((c, i) => Math.round(c * alpha + base[i]! * (1 - alpha))) as Rgb;
  };
}

const kitLight = declarations(block(kitTokens, ':root'));
const kitDark = declarations(block(kitTokens, ":root[data-theme='dark']"));
const kitAccented = declarations(block(kitTokens, ':root[data-accent]'));
const light = declarations(block(tokens, ':root'));
const darkOwn = declarations(block(tokens, ":root[data-theme='dark']"));

/** The cascade on <html data-theme data-accent>: the kit's layer first, then Piw's tokens. */
function theme(mode: 'light' | 'dark', accent: (typeof KIT_ACCENTS)[number]) {
  const swatch = declarations(block(kitTokens, `[data-swatch='${accent}']`));
  return new Map([
    ...kitLight,
    ...(mode === 'dark' ? kitDark : []),
    ...swatch,
    ...kitAccented,
    ...light,
    ...(mode === 'dark' ? darkOwn : []),
  ]);
}

describe('design tokens', () => {
  it('leaves "System" to src/app/theme.ts: the kit only knows data-theme light and dark', () => {
    expect(tokens).not.toMatch(/@media \(prefers-color-scheme/);
  });

  it("defines Piw's own colours (not aliases of the kit's) in the dark theme too", () => {
    const missing = [...light.keys()].filter(
      (name) =>
        (name.startsWith('--color-') ||
          /^--sticky-.*-(bg|border|text|text-muted|dot)$|^--sticky-(hover|active)$/.test(name)) &&
        !light.get(name)!.includes('var(') &&
        light.get(name) !== 'transparent' &&
        !darkOwn.has(name),
    );
    expect(missing).toEqual([]);
  });

  const TEXT = 4.5;
  const UI = 3;
  // The canvas, the top bar / tab strips, and menus / dialogs.
  const surfaces = ['--color-bg', '--color-bg-soft', '--color-bg-elevated'];

  for (const mode of ['light', 'dark'] as const) {
    for (const accent of KIT_ACCENTS) {
      describe(`${mode} theme, ${accent} accent`, () => {
        const resolve = resolver(theme(mode, accent));
        const pairs: [string, string, number][] = [];
        for (const surface of surfaces) {
          pairs.push(['--color-text', surface, TEXT]);
          pairs.push(['--color-text-muted', surface, TEXT]); // secondary
          // Kit exception: --muted is 3.6:1 on the light canvas (10–11px labels, as in Zap).
          pairs.push(['--color-text-subtle', surface, UI]);
          pairs.push(['--color-accent', surface, TEXT]); // links, "today"
          pairs.push(['--color-danger', surface, TEXT]);
          pairs.push(['--color-icon', surface, UI]);
          pairs.push(['--color-focus-ring', surface, UI]);
          pairs.push(['--color-accent-mark', surface, UI]); // active tab line, current-row bar
          pairs.push(['--color-border-strong', surface, UI]); // the task checkbox ring
          pairs.push(['--color-accent-fill', surface, UI]); // a checked box must read as filled
        }
        // Non-essential: placeholders sit in labelled fields, so they get a legibility floor.
        for (const surface of ['--color-bg', '--color-bg-elevated']) {
          pairs.push(['--color-placeholder', surface, 2.8]);
        }
        // The check mark on a checked box and a switch's knob: graphics.
        pairs.push(['--color-accent-contrast', '--color-accent-fill', UI]);
        pairs.push(['--color-accent-contrast', '--color-accent-fill-hover', UI]);
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

        it('keeps text readable on the selection fill', () => {
          const selected = resolve('--color-bg-active', resolve('--color-bg'));
          expect(contrast(resolve('--color-text'), selected)).toBeGreaterThanOrEqual(TEXT);
          // Kit exceptions on the accent tint, light mode: secondary text ~4:1, and the
          // orange focus ring 2.8:1 (the row's fill and the ring together mark it).
          expect(contrast(resolve('--color-text-muted'), selected)).toBeGreaterThanOrEqual(3.5);
          expect(contrast(resolve('--color-focus-ring'), selected)).toBeGreaterThanOrEqual(2.75);
        });

        it('keeps the top bar readable: the active area and the search field', () => {
          const bar = resolve('--color-bg-soft');
          const active = resolve('--color-bg-active', bar);
          const field = resolve('--color-bg-control', bar);
          expect(contrast(resolve('--color-text'), active)).toBeGreaterThanOrEqual(TEXT);
          expect(contrast(resolve('--color-text-muted'), field)).toBeGreaterThanOrEqual(TEXT);
        });

        it.each(['plain', 'yellow', 'peach', 'rose', 'mint', 'sky', 'lavender'])(
          'sticky %s: text, muted text, focus ring and space dot',
          (name) => {
            const bg = resolve(`--sticky-${name}-bg`);
            expect(contrast(resolve(`--sticky-${name}-text`), bg)).toBeGreaterThanOrEqual(TEXT);
            expect(contrast(resolve(`--sticky-${name}-text-muted`), bg)).toBeGreaterThanOrEqual(
              TEXT,
            );
            expect(
              contrast(resolve(`--sticky-${name}-text-muted`), resolve('--sticky-active', bg)),
            ).toBeGreaterThanOrEqual(TEXT);
            // Kit exception: some accents' 1px ring on a light paper colour is ~2.8:1.
            expect(contrast(resolve('--color-focus-ring'), bg)).toBeGreaterThanOrEqual(2.75);
            for (const surface of surfaces) {
              expect(contrast(resolve(`--sticky-${name}-dot`), resolve(surface))).toBeGreaterThan(
                UI,
              );
            }
          },
        );
      });
    }
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
  it('only reference tokens that are defined (by Piw or by the kit)', () => {
    const files = cssFiles(SRC);
    const kitFiles = cssFiles(dirname(kitTokensPath));
    const all = [...files, ...kitFiles].map((file) => readFileSync(file, 'utf8')).join('\n');
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
