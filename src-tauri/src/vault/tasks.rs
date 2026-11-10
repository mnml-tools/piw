//! How Piw rewrites a task's line (docs/vault-format.md §3, "What Piw writes"). Only the line's
//! box, its recognised dates or its text change; every other character stays.

use chrono::NaiveDate;

use super::parse::{DONE_SIGN, DUE_SIGN, last_date};
use crate::domain::time::format_date;
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TaskChange {
    /// Tick (adding `✅ today`) or untick (removing the completion date).
    Check { checked: bool, today: NaiveDate },
    /// Set or clear the `📅` due date.
    Due(Option<NaiveDate>),
    /// Replace the text the views show: between the box and the first recognised date.
    Text(String),
}

/// `line` with `change` applied; `box_at` is where its `[ ]` starts.
pub fn apply(line: &str, box_at: usize, change: &TaskChange) -> AppResult<String> {
    let head_end = box_at + 3;
    let (head, rest) = match (line.get(..head_end), line.get(head_end..)) {
        (Some(head), Some(rest)) if head.ends_with(']') => (head, rest),
        _ => return Err(AppError::validation("that line is not a task")),
    };
    Ok(match change {
        TaskChange::Check { checked, today } => {
            let mark = if *checked { 'x' } else { ' ' };
            let mut out = format!("{}{mark}]", &head[..=box_at]);
            let rest = without(rest, DONE_SIGN);
            if *checked {
                out.push_str(rest.trim_end_matches([' ', '\t']));
                out.push_str(&format!(" {DONE_SIGN} {}", format_date(*today)));
            } else {
                out.push_str(&rest);
            }
            out
        }
        TaskChange::Due(Some(due)) => {
            let token = format!("{DUE_SIGN} {}", format_date(*due));
            let rest = if let Some(((start, end), _)) = last_date(rest, DUE_SIGN) {
                format!("{}{token}{}", &rest[..start], &rest[end..])
            } else if let Some(((start, _), _)) = last_date(rest, DONE_SIGN) {
                let at = rest[..start].trim_end_matches([' ', '\t']).len();
                format!("{} {token}{}", &rest[..at], &rest[at..])
            } else {
                format!("{} {token}", rest.trim_end_matches([' ', '\t']))
            };
            format!("{head}{rest}")
        }
        TaskChange::Due(None) => format!("{head}{}", without(rest, DUE_SIGN)),
        TaskChange::Text(text) => {
            let text = text.trim();
            if text.is_empty() || text.contains(['\n', '\r']) {
                return Err(AppError::validation("a task needs one line of text"));
            }
            let first = [last_date(rest, DUE_SIGN), last_date(rest, DONE_SIGN)]
                .into_iter()
                .flatten()
                .map(|((start, _), _)| start)
                .min();
            match first {
                Some(start) => format!("{head} {text} {}", &rest[start..]),
                None => format!("{head} {text}"),
            }
        }
    })
}

/// Where the `[` of a task box is when `line` is a list item with one (`- [ ]`, `1. [x]`…).
pub fn task_box(line: &str) -> Option<usize> {
    let indent = line.len() - line.trim_start_matches([' ', '\t']).len();
    let rest = &line[indent..];
    let bullet = if rest.starts_with(['-', '*', '+']) {
        1
    } else {
        let digits = rest.bytes().take_while(u8::is_ascii_digit).count();
        if digits == 0 || digits > 9 || !rest[digits..].starts_with(['.', ')']) {
            return None;
        }
        digits + 1
    };
    let after = &rest[bullet..];
    let gap = after.len() - after.trim_start_matches([' ', '\t']).len();
    let at = indent + bullet + gap;
    let mut chars = line.get(at..)?.chars();
    let ok = gap > 0
        && chars.next() == Some('[')
        && matches!(chars.next(), Some(' ' | 'x' | 'X'))
        && chars.next() == Some(']')
        && chars.next().is_none_or(|c| c == ' ' || c == '\t');
    ok.then_some(at)
}

/// `rest` without its recognised `sign date` and the whitespace before it.
fn without(rest: &str, sign: char) -> String {
    match last_date(rest, sign) {
        Some(((start, end), _)) => {
            let start = rest[..start].trim_end_matches([' ', '\t']).len();
            format!("{}{}", &rest[..start], &rest[end..])
        }
        None => rest.to_owned(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    fn date(value: &str) -> NaiveDate {
        NaiveDate::parse_from_str(value, "%Y-%m-%d").unwrap()
    }

    #[test]
    fn line_edits_match_the_shared_cases() {
        let path =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../fixtures/task-edits.json");
        let cases: Value = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
        for case in cases["cases"].as_array().unwrap() {
            let change = &case["change"];
            let change = match change["kind"].as_str().unwrap() {
                "check" => TaskChange::Check {
                    checked: change["checked"].as_bool().unwrap(),
                    today: date(change["today"].as_str().unwrap()),
                },
                "due" => TaskChange::Due(change["due"].as_str().map(date)),
                _ => TaskChange::Text(change["text"].as_str().unwrap().to_owned()),
            };
            let line = case["line"].as_str().unwrap();
            let box_at = usize::try_from(case["boxAt"].as_u64().unwrap()).unwrap();
            assert_eq!(
                apply(line, box_at, &change).unwrap(),
                case["expected"].as_str().unwrap(),
                "{}",
                case["name"]
            );
        }
    }

    #[test]
    fn finds_the_box_of_a_task_line() {
        assert_eq!(task_box("- [ ] a"), Some(2));
        assert_eq!(task_box("\t12) [X] b"), Some(5));
        assert_eq!(task_box("- [ ]"), Some(2));
        for line in ["plain", "- item", "-[ ] x", "- [ ]x", "- [-] y", "1x [ ] z"] {
            assert_eq!(task_box(line), None, "{line:?}");
        }
    }

    #[test]
    fn refuses_lines_that_are_not_tasks_and_bad_text() {
        assert!(apply("plain", 2, &TaskChange::Due(None)).is_err());
        assert!(apply("- [ ] a", 2, &TaskChange::Text("  ".into())).is_err());
        assert!(apply("- [ ] a", 2, &TaskChange::Text("a\nb".into())).is_err());
    }
}
