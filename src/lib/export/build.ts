/**
 * Builds the open export (plan §4.5): readable Markdown for notes and documents, tasks as JSON
 * and CSV, and the complete canonical data in `data.json` (format version in `manifest.json`).
 * Pure: the files are written by Rust into a folder the user picked.
 */
import { jsonToMarkdown } from '@/lib/editor';
import type { ExportData } from '@/lib/ipc/bindings/ExportData';
import type { ExportFile } from '@/lib/ipc/bindings/ExportFile';
import type { Task } from '@/lib/ipc/bindings/Task';

const MAX_NAME = 80;
const BOM = String.fromCharCode(0xfeff);

/** A file-system-safe name on Windows, macOS and Linux. */
export function safeName(name: string, fallback = 'Untitled'): string {
  const cleaned = [...name]
    .map((c) => (c.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(c) ? ' ' : c))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');
  const short = [...cleaned].slice(0, MAX_NAME).join('').trim();
  const value = short || fallback;
  return /^(con|prn|aux|nul|conin\$|conout\$|com[1-9]|lpt[1-9])(\..*)?$/i.test(value)
    ? `_${value}`
    : value;
}

/** Ensures unique paths: "Note.md", "Note (2).md"… */
function uniquePaths() {
  const used = new Set<string>();
  return (dir: string, name: string, ext: string) => {
    let candidate = `${dir}/${name}${ext}`;
    for (let n = 2; used.has(candidate.toLowerCase()); n += 1)
      candidate = `${dir}/${name} (${n})${ext}`;
    used.add(candidate.toLowerCase());
    return candidate;
  };
}

function frontMatter(fields: Record<string, string | string[] | null | undefined>): string {
  const lines = Object.entries(fields)
    .filter(([, v]) => v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0))
    .map(
      ([k, v]) =>
        `${k}: ${Array.isArray(v) ? `[${v.map((x) => JSON.stringify(x)).join(', ')}]` : JSON.stringify(v)}`,
    );
  return `---\n${lines.join('\n')}\n---\n\n`;
}

const CSV_COLUMNS = [
  'id',
  'title',
  'status',
  'due_date',
  'completed_at',
  'space',
  'document',
  'parent_task_id',
  'tags',
  'description',
  'created_at',
] as const;

export function csvCell(value: string): string {
  // Quote everything that needs it; neutralise spreadsheet formula injection.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) || safe !== value ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function tasksToCsv(tasks: readonly Task[], spaceNames: Map<string, string>): string {
  const rows = tasks.map((task) =>
    [
      task.id,
      task.title,
      task.status,
      task.dueDate ?? '',
      task.completedAt ?? '',
      spaceNames.get(task.spaceId) ?? '',
      task.documentTitle ?? '',
      task.parentTaskId ?? '',
      task.tags.join('; '),
      task.description,
      task.createdAt,
    ].map(csvCell),
  );
  // BOM so spreadsheet apps detect UTF-8 (accents, emoji).
  return `${BOM}${[CSV_COLUMNS.join(','), ...rows.map((r) => r.join(','))].join('\r\n')}\r\n`;
}

export function exportFolderName(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `Piw export ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}-${pad(now.getMinutes())}`;
}

export function buildExport(data: ExportData): ExportFile[] {
  const files: ExportFile[] = [];
  const path = uniquePaths();
  const spaceNames = new Map(data.spaces.map((s) => [s.id, s.name]));
  const spaceDir = (id: string) => safeName(spaceNames.get(id) ?? 'Space');

  for (const note of data.notes) {
    const name = safeName(note.displayTitle);
    const header = frontMatter({
      id: note.id,
      title: note.title || null,
      space: spaceNames.get(note.spaceId) ?? null,
      tags: note.tags,
      document: note.documentTitle,
      created: note.createdAt,
      updated: note.updatedAt,
      archived: note.archivedAt,
    });
    files.push({
      path: path(`Notes/${spaceDir(note.spaceId)}`, name, '.md'),
      contents: header + (note.body ?? ''),
    });
  }

  const tasksByDocument = new Map<string, Task[]>();
  for (const task of data.tasks) {
    if (task.documentId && !task.parentTaskId) {
      tasksByDocument.set(task.documentId, [...(tasksByDocument.get(task.documentId) ?? []), task]);
    }
  }

  for (const document of data.documents) {
    const { note, tabs } = document;
    const dir = `Documents/${spaceDir(note.spaceId)}/${safeName(note.title)}`;
    tabs.forEach((tab, index) => {
      const prefix = String(index + 1).padStart(2, '0');
      const name = `${prefix} ${safeName(tab.title)}`;
      let body: string;
      if (tab.kind === 'content') {
        try {
          body = tab.contentJson ? jsonToMarkdown(JSON.parse(tab.contentJson)) : '';
        } catch {
          // Never drop data: keep the raw canonical JSON if it cannot be converted.
          body = `\`\`\`json\n${tab.contentJson ?? ''}\n\`\`\`\n`;
        }
      } else {
        const tasks = tasksByDocument.get(note.id) ?? [];
        body = tasks
          .map((t) => `- [${t.status === 'completed' ? 'x' : ' '}] ${t.title}`)
          .join('\n');
      }
      const header = frontMatter({
        document: note.title,
        documentId: note.id,
        tab: tab.title,
        tabId: tab.id,
        kind: tab.kind,
      });
      files.push({
        path: path(dir, name, '.md'),
        contents: `${header}${body}${body.endsWith('\n') ? '' : '\n'}`,
      });
    });
  }

  files.push({ path: 'tasks.json', contents: `${JSON.stringify(data.tasks, null, 2)}\n` });
  files.push({ path: 'tasks.csv', contents: tasksToCsv(data.tasks, spaceNames) });
  files.push({ path: 'data.json', contents: `${JSON.stringify(data, null, 2)}\n` });
  files.push({
    path: 'manifest.json',
    contents: `${JSON.stringify(
      {
        formatVersion: data.formatVersion,
        appVersion: data.appVersion,
        exportedAt: data.exportedAt,
        counts: {
          notes: data.notes.length,
          documents: data.documents.length,
          tasks: data.tasks.length,
        },
      },
      null,
      2,
    )}\n`,
  });
  files.push({
    path: 'README.md',
    contents: [
      '# Piw export',
      '',
      `Exported ${data.exportedAt} by Piw ${data.appVersion} (format version ${data.formatVersion}).`,
      '',
      '- `Notes/<space>/` — quick notes as Markdown with a small YAML header (id, space, tags, dates).',
      '- `Documents/<space>/<document>/` — one Markdown file per tab, in tab order.',
      '- `tasks.json` / `tasks.csv` — every task and subtask (open and completed).',
      '- `data.json` — the complete data with ids and links, for re-import by a future Piw.',
      '',
      'Items in Trash are not exported. This export is not a backup of the database:',
      'use Settings › Data › Back up for a file Piw can restore.',
      '',
    ].join('\n'),
  });
  return files;
}
