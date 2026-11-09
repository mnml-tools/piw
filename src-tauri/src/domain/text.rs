//! Text rules: display titles, excerpts and name normalisation.

use crate::error::{AppError, AppResult};

const TITLE_MAX_CHARS: usize = 120;
const EXCERPT_MAX_CHARS: usize = 160;
pub const NOTE_BODY_MAX_BYTES: usize = 10 * 1024 * 1024;
pub const DESCRIPTION_MAX_BYTES: usize = 1024 * 1024;

/// Title shown for a note: its explicit title, or the first non-empty line of the body
/// (without its leading Markdown markers). Display only — the stored text is never changed.
pub fn display_title(title: &str, body: Option<&str>) -> String {
    let explicit = title.trim();
    if !explicit.is_empty() {
        return truncate(explicit, TITLE_MAX_CHARS);
    }
    let Some(line) = body.and_then(|b| text_lines(b).next()) else {
        return String::new();
    };
    truncate(line, TITLE_MAX_CHARS)
}

/// Short single-line preview of the body, skipping the line used as the inferred title.
pub fn excerpt(title: &str, body: Option<&str>) -> String {
    let Some(body) = body else {
        return String::new();
    };
    let mut lines = text_lines(body);
    if title.trim().is_empty() {
        lines.next();
    }
    let joined = lines.collect::<Vec<_>>().join(" ");
    truncate(&joined, EXCERPT_MAX_CHARS)
}

/// Ticked and total checklist items (`- [ ]`, `* [x]`, `1. [X]`, at any depth) in a body.
/// The same rule as the note editor's checkboxes (`taskProgress` in `src/lib/markdown.ts`).
pub fn checklist_progress(body: Option<&str>) -> (i64, i64) {
    let (mut done, mut total) = (0, 0);
    for line in body.unwrap_or_default().lines() {
        let Some(mark) = checklist_mark(line) else {
            continue;
        };
        total += 1;
        if mark != ' ' {
            done += 1;
        }
    }
    (done, total)
}

/// The mark inside a checklist item's box (` `, `x` or `X`), if the line is one.
fn checklist_mark(line: &str) -> Option<char> {
    let line = line.trim_start();
    let after_bullet = ['-', '*', '+']
        .iter()
        .find_map(|&bullet| line.strip_prefix(bullet))
        .or_else(|| {
            let digits = line.len() - line.trim_start_matches(|c: char| c.is_ascii_digit()).len();
            if digits == 0 {
                return None;
            }
            line[digits..].strip_prefix(['.', ')'])
        })?;
    if !after_bullet.starts_with(char::is_whitespace) {
        return None;
    }
    let rest = after_bullet.trim_start().strip_prefix('[')?;
    let mut chars = rest.chars();
    let mark = chars.next().filter(|c| matches!(c, ' ' | 'x' | 'X'))?;
    let after = chars.as_str().strip_prefix(']')?;
    (after.is_empty() || after.starts_with(char::is_whitespace)).then_some(mark)
}

/// The body's lines as text: trimmed, without leading Markdown markers (headings, quotes, list
/// bullets and numbers, task boxes), skipping empty lines and rules (`---`, `***`, `___`).
fn text_lines(body: &str) -> impl Iterator<Item = &str> {
    body.lines()
        .filter(|line| !is_rule(line))
        .map(strip_markers)
        .filter(|line| !line.is_empty())
}

fn is_rule(line: &str) -> bool {
    let marks: String = line.chars().filter(|c| !c.is_whitespace()).collect();
    marks.len() >= 3
        && ['-', '*', '_']
            .iter()
            .any(|&mark| marks.chars().all(|c| c == mark))
}

/// Strips leading Markdown block markers, repeatedly (`> - [x] text` → `text`).
fn strip_markers(line: &str) -> &str {
    let mut rest = line.trim();
    loop {
        let next = strip_marker(rest).trim_start();
        if next.len() == rest.len() {
            return rest;
        }
        rest = next;
    }
}

fn strip_marker(line: &str) -> &str {
    // A marker counts only when followed by a space (or ends the line): `#tag`, `-1` stay.
    let spaced = |rest: &'_ str| rest.is_empty() || rest.starts_with(char::is_whitespace);
    let hashes = line.len() - line.trim_start_matches('#').len();
    if (1..=6).contains(&hashes) && spaced(&line[hashes..]) {
        return &line[hashes..];
    }
    if let Some(rest) = line.strip_prefix('>') {
        return rest;
    }
    for bullet in ['-', '*', '+'] {
        if let Some(rest) = line.strip_prefix(bullet).filter(|rest| spaced(rest)) {
            return rest;
        }
    }
    let digits = line.len() - line.trim_start_matches(|c: char| c.is_ascii_digit()).len();
    if (1..=9).contains(&digits)
        && let Some(rest) = line[digits..]
            .strip_prefix(['.', ')'])
            .filter(|rest| spaced(rest))
    {
        return rest;
    }
    for task in ["[ ]", "[x]", "[X]"] {
        if let Some(rest) = line.strip_prefix(task).filter(|rest| spaced(rest)) {
            return rest;
        }
    }
    line
}

fn truncate(text: &str, max: usize) -> String {
    if text.chars().count() <= max {
        return text.to_owned();
    }
    let mut out: String = text.chars().take(max - 1).collect();
    out = out.trim_end().to_owned();
    out.push('…');
    out
}

/// Trims and collapses internal whitespace (used for names and tags).
pub fn normalize_name(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

pub fn require_name(value: &str, what: &str, max_chars: usize) -> AppResult<String> {
    let name = normalize_name(value);
    if name.is_empty() {
        return Err(AppError::validation(format!("{what} cannot be empty")));
    }
    if name.chars().count() > max_chars {
        return Err(AppError::validation(format!(
            "{what} is too long (max {max_chars} characters)"
        )));
    }
    Ok(name)
}

/// Tag names: like other names, without a leading `#`.
pub fn normalize_tag(value: &str) -> AppResult<String> {
    require_name(value.trim().trim_start_matches('#'), "Tag", 40)
}

pub fn require_max_bytes(value: &str, max: usize, what: &str) -> AppResult<()> {
    if value.len() > max {
        return Err(AppError::validation(format!("{what} is too large")));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn infers_the_title_from_the_first_line() {
        assert_eq!(
            display_title("", Some("\n  # Ligar ao fornecedor\nmais")),
            "Ligar ao fornecedor"
        );
        assert_eq!(display_title("  Explicit ", Some("Body")), "Explicit");
        assert_eq!(display_title("", Some("   \n\n")), "");
        assert_eq!(display_title("", None), "");
    }

    #[test]
    fn truncates_long_titles_on_char_boundaries() {
        let long = "ação ☕ ".repeat(40);
        let title = display_title("", Some(&long));
        assert!(title.chars().count() <= 120);
        assert!(title.ends_with('…'));
    }

    #[test]
    fn excerpt_skips_the_inferred_title_line() {
        assert_eq!(excerpt("", Some("Title\nfirst\n\nsecond")), "first second");
        assert_eq!(excerpt("Explicit", Some("first\nsecond")), "first second");
    }

    #[test]
    fn titles_and_excerpts_leave_out_markdown_markers() {
        let body = "## Mykid\n\n- [ ] Verify bug;\n-  [x] Menus\n  * nested\n2. Call\n> - [ ] Quoted\n___\nTest";
        assert_eq!(display_title("", Some(body)), "Mykid");
        assert_eq!(
            excerpt("", Some(body)),
            "Verify bug; Menus nested Call Quoted Test"
        );
        assert_eq!(display_title("", Some("- [ ] Ligar")), "Ligar");
        // Not markers: no space after them.
        assert_eq!(excerpt("T", Some("#tag -1 2.5 [x]y")), "#tag -1 2.5 [x]y");
    }

    #[test]
    fn counts_checklist_items() {
        let body = "## Mykid\n- [x] a\n-  [ ] b\n  * [X] c\n1. [ ] d\n- e\n[ ] f\n-[ ] g\n- [ ]h";
        assert_eq!(checklist_progress(Some(body)), (2, 4));
        assert_eq!(checklist_progress(Some("- [ ]")), (0, 1));
        assert_eq!(checklist_progress(None), (0, 0));
    }

    #[test]
    fn normalises_names_and_tags() {
        assert_eq!(
            require_name("  Deep   work ", "Space", 80).unwrap(),
            "Deep work"
        );
        assert!(require_name("   ", "Space", 80).is_err());
        assert!(require_name(&"x".repeat(81), "Space", 80).is_err());
        assert_eq!(normalize_tag("#urgent").unwrap(), "urgent");
    }
}
