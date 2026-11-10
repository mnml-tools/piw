import { FilePlus, FileText, Search } from 'lucide-react';
import { useRef, useState } from 'react';
import { Dialog, Kbd, iconProps } from '@/components/ui';
import { useVaultSearch } from '@/lib/hooks/vault';
import { useVaultUi } from '@/state/vault';
import { common } from '@/strings/common';
import { vaultStrings as t } from '@/strings/vault';
import { highlight } from '@/views/workspace/search/highlight';
import styles from '@/views/workspace/search/SearchPalette.module.css';
import { useVaultActions } from './actions';
import { newNoteFolder } from './tree';

type Row = { type: 'hit'; path: string } | { type: 'create' };

/** Search the vault (Mod+K), drawn as the workspace's search palette. */
export function VaultSearch({ onClose }: { onClose: () => void }) {
  const space = useVaultUi((s) => s.space);
  const active = useVaultUi((s) => s.active);
  const actions = useVaultActions();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const results = useVaultSearch(query, space);
  const trimmed = query.trim();
  const hits = trimmed ? (results.data ?? []) : [];
  const rows: Row[] = [
    ...hits.map((hit) => ({ type: 'hit' as const, path: hit.path })),
    ...(trimmed && results.data ? [{ type: 'create' as const }] : []),
  ];

  const activate = (row: Row) => {
    onClose();
    if (row.type === 'hit') {
      actions.openNote(row.path);
      return;
    }
    const activeNote = active?.startsWith('note:') ? active.slice('note:'.length) : null;
    void actions.createNote(newNoteFolder(activeNote, space), trimmed);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelected((i) => (rows.length ? (i + 1) % rows.length : 0));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelected((i) => (rows.length ? (i - 1 + rows.length) % rows.length : 0));
    } else if (event.key === 'Enter') {
      const row = rows[selected];
      if (row) {
        event.preventDefault();
        activate(row);
      }
    }
  };

  const optionId = (i: number) => `vault-search-${i}`;
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t.search.title}
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
            aria-label={t.search.title}
            aria-expanded={rows.length > 0}
            aria-controls="vault-search-results"
            aria-activedescendant={rows.length ? optionId(selected) : undefined}
            placeholder={t.search.placeholder}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelected(0);
            }}
            onKeyDown={onKeyDown}
          />
          <button
            type="button"
            className={styles.escape}
            aria-label={common.actions.close}
            title={common.actions.close}
            onClick={onClose}
          >
            <Kbd shortcut="Escape" aria-hidden />
          </button>
        </div>
        <div className={styles.results}>
          {trimmed && results.data?.length === 0 && <p className={styles.hint}>{t.search.none}</p>}
          <ul
            id="vault-search-results"
            role="listbox"
            aria-label={t.search.title}
            className={styles.list}
          >
            {rows.map((row, i) => {
              const option = {
                id: optionId(i),
                role: 'option' as const,
                'aria-selected': i === selected,
                className: i === selected ? `${styles.row} ${styles.active}` : styles.row,
                onMouseEnter: () => setSelected(i),
                onClick: () => activate(row),
              };
              if (row.type === 'create') {
                return (
                  <li key="create" {...option}>
                    <FilePlus {...iconProps} className={styles.icon} />
                    <span className={styles.text}>
                      <span className={styles.title}>{t.search.create(trimmed)}</span>
                    </span>
                  </li>
                );
              }
              const hit = hits[i]!;
              return (
                <li key={hit.path} {...option}>
                  <FileText {...iconProps} className={styles.icon} />
                  <span className={styles.text}>
                    <span className={styles.titleLine}>
                      <span className={styles.title}>{hit.title}</span>
                      <span className={styles.context}>{hit.path}</span>
                    </span>
                    {hit.snippet && (
                      <span className={styles.snippet}>{highlight(hit.snippet)}</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </Dialog>
  );
}
