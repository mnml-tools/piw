//! Global search over notes, documents (title and every tab) and tasks, using FTS5.

use rusqlite::Connection;
use serde::Serialize;
use ts_rs::TS;

use crate::error::AppResult;

/// Markers wrapped around matches in snippets; the UI turns them into `<mark>` safely.
pub const MARK_START: char = '\u{2}';
pub const MARK_END: char = '\u{3}';
const PER_GROUP: usize = 50;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export, export_to = "bindings/")]
pub enum SearchKind {
    Document,
    Note,
    Task,
}

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "bindings/")]
pub struct SearchHit {
    pub kind: SearchKind,
    /// Note, document or task id.
    pub id: String,
    pub title: String,
    /// Text around the match; matches are wrapped in U+0002 … U+0003.
    pub snippet: String,
    pub space_id: String,
    /// Tab where a document matched (for "in Implementation").
    pub tab_id: Option<String>,
    pub tab_title: Option<String>,
    /// Document a note or task belongs to.
    pub document_id: Option<String>,
    pub document_title: Option<String>,
    pub parent_title: Option<String>,
    pub due_date: Option<String>,
    pub completed: bool,
    pub archived: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "bindings/")]
pub struct SearchResults {
    pub documents: Vec<SearchHit>,
    pub notes: Vec<SearchHit>,
    pub tasks: Vec<SearchHit>,
}

/// Turns user input into a safe FTS5 query: every token is quoted (no operators can be
/// injected) and prefix-matched, and all tokens must match.
pub fn to_fts_query(input: &str) -> Option<String> {
    let tokens: Vec<String> = input
        .split(|c: char| c.is_whitespace() || (c.is_ascii_punctuation() && c != '_' && c != '#'))
        .map(|t| t.trim_start_matches('#'))
        .filter(|t| !t.is_empty())
        .take(12)
        .map(|t| format!("\"{}\"*", t.replace('"', "\"\"")))
        .collect();
    (!tokens.is_empty()).then(|| tokens.join(" "))
}

pub fn search(conn: &Connection, input: &str, space_id: Option<&str>) -> AppResult<SearchResults> {
    let Some(query) = to_fts_query(input) else {
        return Ok(SearchResults::default());
    };
    let mut results = SearchResults::default();
    let snippet = format!(
        "snippet(search_index, -1, char({}), char({}), '…', 12)",
        MARK_START as u32, MARK_END as u32
    );

    // Notes and documents matched by their own title/body.
    let sql = format!(
        "SELECT n.id, n.kind, n.title, n.body, {snippet}, n.space_id, n.document_id, d.title,
                n.archived_at IS NOT NULL
           FROM search_index s
           JOIN notes n ON n.id = s.entity_id
           LEFT JOIN notes d ON d.id = n.document_id
          WHERE search_index MATCH ?1 AND s.entity_kind IN ('note', 'document')
            AND n.deleted_at IS NULL AND (?2 IS NULL OR n.space_id = ?2)
          ORDER BY n.archived_at IS NOT NULL, bm25(search_index, 0, 0, 0, 8.0, 1.0)
          LIMIT 200"
    );
    let mut stmt = conn.prepare_cached(&sql)?;
    let mut rows = stmt.query(rusqlite::params![query, space_id])?;
    while let Some(row) = rows.next()? {
        let kind: String = row.get(1)?;
        let title: String = row.get(2)?;
        let body: Option<String> = row.get(3)?;
        let hit = SearchHit {
            kind: if kind == "document" {
                SearchKind::Document
            } else {
                SearchKind::Note
            },
            id: row.get(0)?,
            title: crate::domain::text::display_title(&title, body.as_deref()),
            snippet: row.get(4)?,
            space_id: row.get(5)?,
            tab_id: None,
            tab_title: None,
            document_id: row.get(6)?,
            document_title: row.get(7)?,
            parent_title: None,
            due_date: None,
            completed: false,
            archived: row.get(8)?,
        };
        push(&mut results, hit);
    }

    // Documents matched through a tab: one hit per document (best tab first).
    let sql = format!(
        "SELECT n.id, n.title, {snippet}, n.space_id, tab.id, tab.title, n.archived_at IS NOT NULL
           FROM search_index s
           JOIN document_tabs tab ON tab.id = s.entity_id AND tab.deleted_at IS NULL
           JOIN notes n ON n.id = tab.document_id
          WHERE search_index MATCH ?1 AND s.entity_kind = 'tab'
            AND n.deleted_at IS NULL AND (?2 IS NULL OR n.space_id = ?2)
          ORDER BY n.archived_at IS NOT NULL, bm25(search_index, 0, 0, 0, 8.0, 1.0)
          LIMIT 200"
    );
    let mut stmt = conn.prepare_cached(&sql)?;
    let mut rows = stmt.query(rusqlite::params![query, space_id])?;
    while let Some(row) = rows.next()? {
        let id: String = row.get(0)?;
        if results.documents.iter().any(|d| d.id == id) {
            continue;
        }
        let hit = SearchHit {
            kind: SearchKind::Document,
            id,
            title: row.get(1)?,
            snippet: row.get(2)?,
            space_id: row.get(3)?,
            tab_id: row.get(4)?,
            tab_title: row.get(5)?,
            document_id: None,
            document_title: None,
            parent_title: None,
            due_date: None,
            completed: false,
            archived: row.get(6)?,
        };
        push(&mut results, hit);
    }

    let sql = format!(
        "SELECT t.id, t.title, {snippet}, t.space_id, t.document_id, d.title, p.title, t.due_date,
                t.status = 'completed'
           FROM search_index s
           JOIN tasks t ON t.id = s.entity_id
           LEFT JOIN notes d ON d.id = t.document_id
           LEFT JOIN tasks p ON p.id = t.parent_task_id
          WHERE search_index MATCH ?1 AND s.entity_kind = 'task'
            AND t.deleted_at IS NULL AND (?2 IS NULL OR t.space_id = ?2)
          ORDER BY t.status = 'completed', bm25(search_index, 0, 0, 0, 8.0, 1.0)
          LIMIT 200"
    );
    let mut stmt = conn.prepare_cached(&sql)?;
    let mut rows = stmt.query(rusqlite::params![query, space_id])?;
    while let Some(row) = rows.next()? {
        let hit = SearchHit {
            kind: SearchKind::Task,
            id: row.get(0)?,
            title: row.get(1)?,
            snippet: row.get(2)?,
            space_id: row.get(3)?,
            tab_id: None,
            tab_title: None,
            document_id: row.get(4)?,
            document_title: row.get(5)?,
            parent_title: row.get(6)?,
            due_date: row.get(7)?,
            completed: row.get(8)?,
            archived: false,
        };
        push(&mut results, hit);
    }
    Ok(results)
}

fn push(results: &mut SearchResults, hit: SearchHit) {
    let group = match hit.kind {
        SearchKind::Document => &mut results.documents,
        SearchKind::Note => &mut results.notes,
        SearchKind::Task => &mut results.tasks,
    };
    if group.len() < PER_GROUP {
        group.push(hit);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quotes_tokens_so_operators_cannot_be_injected() {
        assert_eq!(to_fts_query("2FA").as_deref(), Some("\"2FA\"*"));
        assert_eq!(
            to_fts_query("refactor NOT \"x\" OR y*").as_deref(),
            Some("\"refactor\"* \"NOT\"* \"x\"* \"OR\"* \"y\"*")
        );
        assert_eq!(to_fts_query("#urgent").as_deref(), Some("\"urgent\"*"));
        assert_eq!(to_fts_query("   ---  "), None);
    }
}
