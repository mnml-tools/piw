/**
 * Dev-only stand-in for the FTS5 search (`services/search.rs`): every query token must
 * prefix-match a word of the title or body (diacritics and case ignored), and snippets wrap
 * matches in U+0002 … U+0003 like `snippet()`.
 */
import type { SearchHit } from '@/lib/ipc/bindings/SearchHit';
import type { SearchResults } from '@/lib/ipc/bindings/SearchResults';
import { displayTitle, findNote, type Store } from './mock-store';

const MARK_START = '\u0002';
const MARK_END = '\u0003';
const SNIPPET_TOKENS = 12;
const PER_GROUP = 50;
const WORD_RE = /[\p{L}\p{N}]+/gu;

interface Token {
  start: number;
  end: number;
  folded: string;
}

function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function tokenize(text: string): Token[] {
  return Array.from(text.matchAll(WORD_RE), (m) => ({
    start: m.index,
    end: m.index + m[0].length,
    folded: fold(m[0]),
  }));
}

/** Query terms, like `to_fts_query` (at most 12, every one must match). */
function queryTerms(input: string): string[] {
  return tokenize(input)
    .map((t) => t.folded)
    .slice(0, 12);
}

interface Column {
  text: string;
  tokens: Token[];
  /** Indices of tokens that match a term. */
  hits: number[];
  /** Distinct terms found. */
  terms: Set<string>;
}

function column(text: string, terms: string[]): Column {
  const tokens = tokenize(text);
  const hits: number[] = [];
  const found = new Set<string>();
  tokens.forEach((token, index) => {
    const term = terms.find((t) => token.folded.startsWith(t));
    if (term !== undefined) {
      hits.push(index);
      found.add(term);
    }
  });
  return { text, tokens, hits, terms: found };
}

function snippet(col: Column): string {
  const first = col.hits[0] ?? 0;
  const total = col.tokens.length;
  if (total === 0) return '';
  const start = Math.max(0, Math.min(first - 2, total - SNIPPET_TOKENS));
  const end = Math.min(total, start + SNIPPET_TOKENS);
  const hits = new Set(col.hits);
  let out = start > 0 ? '…' : '';
  let cursor = col.tokens[start]?.start ?? 0;
  for (let i = start; i < end; i += 1) {
    const token = col.tokens[i];
    if (!token) break;
    out += col.text.slice(cursor, token.start);
    const word = col.text.slice(token.start, token.end);
    out += hits.has(i) ? `${MARK_START}${word}${MARK_END}` : word;
    cursor = token.end;
  }
  return end < total ? `${out}…` : out + col.text.slice(cursor);
}

interface Match {
  snippet: string;
  score: number;
}

/** Matches when every term is found in the title or the body. */
function match(title: string, body: string, terms: string[]): Match | null {
  const head = column(title, terms);
  const rest = column(body, terms);
  if (!terms.every((t) => head.terms.has(t) || rest.terms.has(t))) return null;
  const best = rest.terms.size > head.terms.size ? rest : head;
  // bm25 weights in Rust: title 8, body 1.
  return { snippet: snippet(best), score: head.hits.length * 8 + rest.hits.length };
}

type Ranked = { hit: SearchHit; score: number; last: boolean };

function ranked(items: Ranked[]): SearchHit[] {
  return items
    .sort((a, b) => Number(a.last) - Number(b.last) || b.score - a.score)
    .map((item) => item.hit);
}

const blank = {
  tabId: null,
  tabTitle: null,
  documentId: null,
  documentTitle: null,
  parentTitle: null,
  dueDate: null,
  completed: false,
  archived: false,
} satisfies Partial<SearchHit>;

export function search(store: Store, input: string, spaceId: string | null): SearchResults {
  const results: SearchResults = { documents: [], notes: [], tasks: [] };
  const terms = queryTerms(input);
  if (terms.length === 0) return results;
  const inSpace = (id: string) => spaceId === null || id === spaceId;

  const notes: Ranked[] = [];
  for (const note of store.notes) {
    if (note.deletedAt !== null || !inSpace(note.spaceId)) continue;
    const found = match(note.title, note.body ?? '', terms);
    if (!found) continue;
    const doc = note.documentId === null ? undefined : findNote(store, note.documentId);
    notes.push({
      score: found.score,
      last: note.archivedAt !== null,
      hit: {
        ...blank,
        kind: note.kind === 'document' ? 'document' : 'note',
        id: note.id,
        title: displayTitle(note.title, note.body),
        snippet: found.snippet,
        spaceId: note.spaceId,
        documentId: note.documentId,
        documentTitle: doc?.title ?? null,
        archived: note.archivedAt !== null,
      },
    });
  }
  for (const hit of ranked(notes)) {
    const group = hit.kind === 'document' ? results.documents : results.notes;
    if (group.length < PER_GROUP) group.push(hit);
  }

  const tabs: Ranked[] = [];
  for (const tab of store.tabs) {
    const doc = findNote(store, tab.documentId);
    if (tab.deletedAt !== null || !doc || doc.deletedAt !== null || !inSpace(doc.spaceId)) {
      continue;
    }
    const found = match(tab.title, tab.plainText, terms);
    if (!found) continue;
    tabs.push({
      score: found.score,
      last: doc.archivedAt !== null,
      hit: {
        ...blank,
        kind: 'document',
        id: doc.id,
        title: doc.title,
        snippet: found.snippet,
        spaceId: doc.spaceId,
        tabId: tab.id,
        tabTitle: tab.title,
        archived: doc.archivedAt !== null,
      },
    });
  }
  for (const hit of ranked(tabs)) {
    if (results.documents.some((d) => d.id === hit.id)) continue;
    if (results.documents.length < PER_GROUP) results.documents.push(hit);
  }

  const tasks: Ranked[] = [];
  for (const task of store.tasks) {
    if (task.deletedAt !== null || !inSpace(task.spaceId)) continue;
    const found = match(task.title, task.description, terms);
    if (!found) continue;
    const doc = task.documentId === null ? undefined : findNote(store, task.documentId);
    const parent =
      task.parentTaskId === null ? undefined : store.tasks.find((t) => t.id === task.parentTaskId);
    tasks.push({
      score: found.score,
      last: task.status === 'completed',
      hit: {
        ...blank,
        kind: 'task',
        id: task.id,
        title: task.title,
        snippet: found.snippet,
        spaceId: task.spaceId,
        documentId: task.documentId,
        documentTitle: doc?.title ?? null,
        parentTitle: parent?.title ?? null,
        dueDate: task.dueDate,
        completed: task.status === 'completed',
      },
    });
  }
  results.tasks = ranked(tasks).slice(0, PER_GROUP);
  return results;
}
