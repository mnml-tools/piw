//! Text rules: display titles, excerpts and name normalisation.

use crate::error::{AppError, AppResult};

const TITLE_MAX_CHARS: usize = 120;
const EXCERPT_MAX_CHARS: usize = 160;
pub const NOTE_BODY_MAX_BYTES: usize = 10 * 1024 * 1024;
pub const DESCRIPTION_MAX_BYTES: usize = 1024 * 1024;

/// Title shown for a note: its explicit title, or the first non-empty line of the body
/// (without Markdown heading markers). Display only — the stored text is never changed.
pub fn display_title(title: &str, body: Option<&str>) -> String {
    let explicit = title.trim();
    if !explicit.is_empty() {
        return truncate(explicit, TITLE_MAX_CHARS);
    }
    let Some(line) = body.and_then(|b| b.lines().map(str::trim).find(|l| !l.is_empty())) else {
        return String::new();
    };
    let line = line.trim_start_matches('#').trim_start();
    truncate(line, TITLE_MAX_CHARS)
}

/// Short single-line preview of the body, skipping the line used as the inferred title.
pub fn excerpt(title: &str, body: Option<&str>) -> String {
    let Some(body) = body else {
        return String::new();
    };
    let mut lines = body.lines().map(str::trim).filter(|l| !l.is_empty());
    if title.trim().is_empty() {
        lines.next();
    }
    let joined = lines.collect::<Vec<_>>().join(" ");
    truncate(&joined, EXCERPT_MAX_CHARS)
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
