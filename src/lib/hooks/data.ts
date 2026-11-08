/**
 * Data hooks: one per query, keyed by `@/lib/query/keys`. Writes go through `api` and the
 * cache refreshes from the `piw://changed` event (all windows), so mutations don't need to
 * patch caches by hand. Use `useAction` for one-off writes with consistent error toasts.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/ipc/api';
import type { NoteQuery } from '@/lib/ipc/bindings/NoteQuery';
import type { TaskQuery } from '@/lib/ipc/bindings/TaskQuery';
import type { TasksTabShow } from '@/lib/ipc/bindings/TasksTabShow';
import type { TasksTabSort } from '@/lib/ipc/bindings/TasksTabSort';
import { keys } from '@/lib/query/keys';

export function useAppStatus() {
  return useQuery({ queryKey: ['appStatus'], queryFn: api.appStatus });
}

export function useSpaces() {
  return useQuery({ queryKey: keys.spaces, queryFn: api.listSpaces });
}

export function useSettings() {
  return useQuery({ queryKey: keys.settings, queryFn: api.getSettings });
}

export function useNotes(query: Partial<NoteQuery>) {
  return useQuery({ queryKey: keys.notes(query), queryFn: () => api.listNotes(query) });
}

export function useNote(id: string | null) {
  return useQuery({
    queryKey: keys.note(id ?? ''),
    queryFn: () => api.getNote(id ?? ''),
    enabled: id !== null,
  });
}

export function useDocument(id: string | null) {
  return useQuery({
    queryKey: keys.document(id ?? ''),
    queryFn: () => api.getDocument(id ?? ''),
    enabled: id !== null,
  });
}

export function useTasks(query: Partial<TaskQuery>) {
  return useQuery({ queryKey: keys.tasks(query), queryFn: () => api.listTasks(query) });
}

export function useDocumentTasks(documentId: string, show: TasksTabShow, sort: TasksTabSort) {
  return useQuery({
    queryKey: keys.documentTasks(documentId, show, sort),
    queryFn: () => api.listDocumentTasks(documentId, show, sort),
  });
}

export function useTask(id: string | null) {
  return useQuery({
    queryKey: keys.task(id ?? ''),
    queryFn: () => api.getTask(id ?? ''),
    enabled: id !== null,
  });
}

export function useCompletedCount(spaceId: string | null) {
  return useQuery({
    queryKey: keys.completedCount(spaceId),
    queryFn: () => api.countCompletedTasks(spaceId),
  });
}

export function useInbox(spaceId: string | null) {
  return useQuery({ queryKey: keys.inbox(spaceId), queryFn: () => api.listInbox(spaceId) });
}

export function useInboxCount(spaceId: string | null) {
  return useQuery({
    queryKey: keys.inboxCount(spaceId),
    queryFn: () => api.inboxCount(spaceId),
  });
}

export function useTrash() {
  return useQuery({ queryKey: keys.trash, queryFn: api.listTrash });
}

export function useTags() {
  return useQuery({ queryKey: keys.tags, queryFn: api.listTags });
}

export function useSearch(query: string, spaceId: string | null) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: keys.search(trimmed, spaceId),
    queryFn: () => api.search(trimmed, spaceId),
    enabled: trimmed.length > 0,
    placeholderData: (previous) => previous,
  });
}

export function usePinned(spaceId: string | null) {
  return useQuery({ queryKey: keys.pinned(spaceId), queryFn: () => api.listPinned(spaceId) });
}
