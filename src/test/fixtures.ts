import type { NoteListItem } from '@/lib/ipc/bindings/NoteListItem';
import type { Note } from '@/lib/ipc/bindings/Note';
import type { Space } from '@/lib/ipc/bindings/Space';
import type { Task } from '@/lib/ipc/bindings/Task';

const ts = '2026-11-06T10:00:00.000Z';

export const spaces: Space[] = [
  {
    id: 'work',
    name: 'Work',
    color: 'sky',
    sortOrder: 0,
    isDefault: true,
    createdAt: ts,
    updatedAt: ts,
  },
  {
    id: 'personal',
    name: 'Personal',
    color: 'mint',
    sortOrder: 1024,
    isDefault: false,
    createdAt: ts,
    updatedAt: ts,
  },
];

export function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    spaceId: 'work',
    documentId: null,
    documentTitle: null,
    documentArchived: false,
    parentTaskId: null,
    title: 'Comprar café',
    description: '',
    status: 'open',
    dueDate: null,
    completedAt: null,
    sortOrder: 0,
    rev: 1,
    subtaskCount: 0,
    subtaskDone: 0,
    tags: [],
    pinned: false,
    triagedAt: null,
    createdAt: ts,
    updatedAt: ts,
    deletedAt: null,
    ...overrides,
  };
}

export function note(overrides: Partial<Note> = {}): Note {
  return {
    id: 'n1',
    spaceId: 'work',
    kind: 'quick_note',
    title: '',
    displayTitle: 'Ligar ao fornecedor',
    body: 'Ligar ao fornecedor',
    documentId: null,
    documentTitle: null,
    sidebarOrder: null,
    rev: 1,
    tags: [],
    pinned: false,
    triagedAt: null,
    createdAt: ts,
    updatedAt: ts,
    archivedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

export function noteItem(overrides: Partial<NoteListItem> = {}): NoteListItem {
  return {
    id: 'n1',
    spaceId: 'work',
    kind: 'quick_note',
    displayTitle: 'Ligar ao fornecedor',
    excerpt: '',
    documentId: null,
    documentTitle: null,
    sidebarOrder: null,
    tags: [],
    pinned: false,
    taskCount: 0,
    checklistCount: 0,
    checklistDone: 0,
    createdAt: ts,
    updatedAt: ts,
    archivedAt: null,
    deletedAt: null,
    ...overrides,
  };
}
