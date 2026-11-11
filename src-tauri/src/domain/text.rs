//! Text rules: display titles.

const TITLE_MAX_CHARS: usize = 120;

/// A note's title as Piw 0.1 showed it: its own title, else the first line of its text without
/// Markdown markers, cut to 120 characters (the import names files after it).
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn infers_the_title_from_the_first_line() {
        assert_eq!(
            display_title("", Some("\n  # Call the supplier\nmore")),
            "Call the supplier"
        );
        assert_eq!(display_title("  Explicit ", Some("Body")), "Explicit");
        assert_eq!(display_title("", Some("   \n\n")), "");
        assert_eq!(display_title("", None), "");
    }

    #[test]
    fn truncates_long_titles_on_char_boundaries() {
        let long = "café ☕ ".repeat(40);
        let title = display_title("", Some(&long));
        assert!(title.chars().count() <= 120);
        assert!(title.ends_with('…'));
    }

    #[test]
    fn titles_leave_out_markdown_markers() {
        let body = "## Mykid\n\n- [ ] Verify bug;";
        assert_eq!(display_title("", Some(body)), "Mykid");
        assert_eq!(display_title("", Some("___\n- [ ] Call")), "Call");
        // Not markers: no space after them.
        assert_eq!(
            display_title("", Some("#tag -1 2.5 [x]y")),
            "#tag -1 2.5 [x]y"
        );
    }
}
