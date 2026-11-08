import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const TEST_DIR = import.meta.dirname;

export function readFixture(name: string): string {
  return readFileSync(join(TEST_DIR, 'fixtures', name), 'utf8');
}

/**
 * Golden-file helper. Compares against test/golden/<name>; with
 * UPDATE_GOLDEN=1 it (re)writes the file instead. Golden files are committed
 * and must be reviewed by a human when they change.
 */
export function golden(name: string, actual: string): string {
  const file = join(TEST_DIR, 'golden', name);
  if (process.env['UPDATE_GOLDEN'] === '1' || !existsSync(file)) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, actual);
  }
  return readFileSync(file, 'utf8');
}

/** Writes measurements only when asked (`EDITOR_RESULTS=dir`), never into the source tree. */
export function writeResult(name: string, data: unknown): void {
  const dir = process.env['EDITOR_RESULTS'];
  if (!dir) return;
  const file = join(dir, name);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}
