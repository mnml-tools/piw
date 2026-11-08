import { CircleCheck, FileText, Plus, Search, StickyNote } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Badge, Dialog, Kbd, iconProps } from '@/components/ui';
import { useSearch } from '@/lib/hooks/data';
import { api } from '@/lib/ipc/api';
import type { SearchHit } from '@/lib/ipc/bindings/SearchHit';
import { useWorkspace } from '@/state/workspace';
import { common as commonStrings } from '@/strings/common';
import { searchStrings as t } from '@/strings/workspace';
import { highlight } from './highlight';
import styles from './SearchPalette.module.css';

const PER_GROUP = 5;

type Row =
  | { type: 'hit'; hit: SearchHit }
  | { type: 'more'; group: 'documents' | 'notes' | 'tasks'; count: number }
  | { type: 'create'; kind: 'note' | 'task' };

/** Global search (Mod+K), docs/ui-design-system.md §10 / CA-09. */
export function SearchPalette({ onClose }: { onClose: () => void }) {
  const ws = useWorkspace();
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const results = useSearch(query, ws.spaceId);
  const trimmed = query.trim();

  const groups = useMemo(() => {
    const data = results.data;
    if (!data || !trimmed) return [];
    return (['documents', 'notes', 'tasks'] as const)
      .map((group) => {
        const hits = data[group];
        const visible = expanded.has(group) ? hits : hits.slice(0, PER_GROUP);
        const rows: Row[] = visible.map((hit) => ({ type: 'hit', hit }));
        if (hits.length > visible.length) rows.push({ type: 'more', group, count: hits.length });
        return { group, rows };
      })
      .filter((g) => g.rows.length > 0);
  }, [results.data, trimmed, expanded]);

  const rows: Row[] = useMemo(() => {
    const flat = groups.flatMap((g) => g.rows);
    if (trimmed && results.data && flat.length === 0) {
      return [
        { type: 'create', kind: 'note' },
        { type: 'create', kind: 'task' },
      ];
    }
    return flat;
  }, [groups, trimmed, results.data]);

  const activate = async (row: Row) => {
    if (row.type === 'more') {
      setExpanded((current) => new Set(current).add(row.group));
      return;
    }
    if (row.type === 'create') {
      if (row.kind === 'note') {
        const note = await api.createNote({
          body: trimmed,
          ...(ws.spaceId ? { spaceId: ws.spaceId } : {}),
        });
        onClose();
        ws.openNote(note.id);
      } else {
        const task = await api.createTask({
          title: trimmed,
          ...(ws.spaceId ? { spaceId: ws.spaceId } : {}),
        });
        onClose();
        ws.navigate('tasks');
        ws.setTasksView('all');
        ws.openTask(task.id);
      }
      return;
    }
    const { hit } = row;
    onClose();
    if (hit.kind === 'document') ws.openDocument(hit.id, hit.tabId ?? undefined);
    else if (hit.kind === 'note') ws.openNote(hit.id);
    else {
      // Filters are ignored so the task is always visible (docs/ui-design-system.md §10).
      ws.setSpace(null);
      ws.navigate('tasks');
      ws.setTasksView(hit.completed ? 'completed' : 'all');
      ws.openTask(hit.id);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => (rows.length ? (i + 1) % rows.length : 0));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => (rows.length ? (i - 1 + rows.length) % rows.length : 0));
    } else if (event.key === 'Enter') {
      const row = rows[active];
      if (row) {
        event.preventDefault();
        void activate(row);
      }
    }
  };

  let index = -1;
  const optionId = (i: number) => `search-option-${i}`;
  const renderRow = (row: Row) => {
    index += 1;
    const i = index;
    const selected = i === active;
    const common = {
      id: optionId(i),
      role: 'option' as const,
      'aria-selected': selected,
      className: selected ? `${styles.row} ${styles.active}` : styles.row,
      onMouseEnter: () => setActive(i),
      onClick: () => void activate(row),
    };
    if (row.type === 'more') {
      return (
        <li key={`more-${row.group}`} {...common}>
          <span className={styles.more}>{t.showAll(row.count)}</span>
        </li>
      );
    }
    if (row.type === 'create') {
      return (
        <li key={`create-${row.kind}`} {...common}>
          <Plus {...iconProps} className={styles.icon} />
          <span className={styles.text}>
            <span className={styles.title}>
              {row.kind === 'note' ? t.createNote(trimmed) : t.createTask(trimmed)}
            </span>
          </span>
        </li>
      );
    }
    const { hit } = row;
    const Icon =
      hit.kind === 'document' ? FileText : hit.kind === 'note' ? StickyNote : CircleCheck;
    const context = [
      hit.tabTitle ? t.inTab(hit.tabTitle) : null,
      hit.documentTitle,
      hit.parentTitle ? t.subtaskOf(hit.parentTitle) : null,
    ].filter(Boolean);
    return (
      <li key={`${hit.kind}-${hit.id}`} {...common}>
        <Icon {...iconProps} className={styles.icon} />
        <span className={styles.text}>
          <span className={styles.titleLine}>
            <span className={styles.title}>{hit.title || '—'}</span>
            {context.length > 0 && <span className={styles.context}>{context.join(' · ')}</span>}
          </span>
          {hit.snippet && <span className={styles.snippet}>{highlight(hit.snippet)}</span>}
        </span>
        {hit.archived && <Badge>{t.archived}</Badge>}
        {hit.completed && <Badge>{t.completed}</Badge>}
      </li>
    );
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t.title}
      hideTitle
      placement="top"
      padding="none"
      showClose={false}
      initialFocusRef={input}
      className={styles.dialog}
    >
      <div className={styles.palette}>
        <div className={styles.field}>
          <Search {...iconProps} className={styles.fieldIcon} />
          <input
            ref={input}
            className={styles.input}
            type="search"
            role="combobox"
            aria-label={t.title}
            aria-expanded={rows.length > 0}
            aria-controls="search-results"
            aria-activedescendant={rows.length ? optionId(active) : undefined}
            placeholder={t.placeholder}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
              setExpanded(new Set());
            }}
            onKeyDown={onKeyDown}
          />
          {/* The palette's close control: quiet, and it teaches the key. */}
          <button
            type="button"
            className={styles.escape}
            aria-label={commonStrings.actions.close}
            title={commonStrings.actions.close}
            onClick={onClose}
          >
            <Kbd shortcut="Escape" aria-hidden />
          </button>
        </div>
        <div className={styles.results}>
          {!trimmed && <p className={styles.hint}>{t.hint}</p>}
          {trimmed && results.data && rows.length > 0 && rows[0]?.type === 'create' && (
            <p className={styles.hint}>{t.noResults(trimmed)}</p>
          )}
          <div id="search-results" role="listbox" aria-label={t.title}>
            {groups.map((group) => {
              const labelId = `search-group-${group.group}`;
              return (
                <div key={group.group} className={styles.group}>
                  {/* Names the group (aria-labelledby); hidden so the listbox only owns groups. */}
                  <div id={labelId} className={styles.groupTitle} aria-hidden="true">
                    {t.groups[group.group]}
                  </div>
                  <ul role="group" aria-labelledby={labelId} className={styles.list}>
                    {group.rows.map(renderRow)}
                  </ul>
                </div>
              );
            })}
            {rows[0]?.type === 'create' && (
              <ul role="group" aria-label={t.title} className={styles.list}>
                {rows.map(renderRow)}
              </ul>
            )}
          </div>
        </div>
        {/* The palette's keys: quiet 11px hints after one hairline. */}
        <div className={styles.footer} aria-hidden="true">
          <span className={styles.footerHint}>
            <span className={styles.footerKeys}>
              <Kbd shortcut="ArrowUp" />
              <Kbd shortcut="ArrowDown" />
            </span>{' '}
            {t.footer.move}
          </span>
          <span className={styles.footerHint}>
            <Kbd shortcut="Enter" /> {t.footer.open}
          </span>
          <span className={styles.footerHint}>
            <Kbd shortcut="Escape" /> {t.footer.close}
          </span>
        </div>
      </div>
    </Dialog>
  );
}
