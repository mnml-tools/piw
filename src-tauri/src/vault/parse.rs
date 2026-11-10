//! Reads a note's tasks, links and tags (docs/vault-format.md §3–4). Structure comes from a
//! CommonMark parser, so code, HTML, quotes and list nesting follow the spec; the task line
//! itself is checked by hand, because the format is stricter than GFM about what counts.

use chrono::NaiveDate;
use pulldown_cmark::{Event, LinkType, Options, Parser, Tag, TagEnd, TextMergeWithOffset};

pub(super) const DUE_SIGN: char = '📅';
pub(super) const DONE_SIGN: char = '✅';
const VARIATION_SELECTOR: char = '\u{fe0f}';

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Task {
    /// 1-based line of the task's box.
    pub line: u32,
    pub checked: bool,
    /// The first line's text, without the recognised dates.
    pub text: String,
    pub due: Option<NaiveDate>,
    pub done: Option<NaiveDate>,
    /// The closest heading above the task.
    pub heading: Option<String>,
    /// Line of the task directly enclosing this one.
    pub parent_line: Option<u32>,
    /// The whole line as written (without its line ending): the guard of line edits.
    pub line_text: String,
    /// Byte offset of the box's `[` in `line_text`.
    pub box_at: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Link {
    /// The note named by the link, as written (`Onboarding`, `Work/Projects/Onboarding`).
    pub target: String,
    pub heading: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ParsedNote {
    pub tasks: Vec<Task>,
    pub links: Vec<Link>,
    /// Lowercase, sorted, without duplicates.
    pub tags: Vec<String>,
}

pub fn parse(text: &str) -> ParsedNote {
    let text = text.strip_prefix('\u{feff}').unwrap_or(text);
    let lines = Lines::new(text);
    let options = Options::ENABLE_TASKLISTS
        | Options::ENABLE_YAML_STYLE_METADATA_BLOCKS
        | Options::ENABLE_WIKILINKS
        | Options::ENABLE_TABLES
        | Options::ENABLE_STRIKETHROUGH;
    let events = TextMergeWithOffset::new(Parser::new_ext(text, options).into_offset_iter());

    let mut note = ParsedNote::default();
    let mut tags = Vec::new();
    // Each open list item: its task's index, when it is one.
    let mut items: Vec<Option<usize>> = Vec::new();
    let mut quotes = 0usize;
    let mut links = 0usize;
    let mut in_code = false;
    let mut metadata: Option<String> = None;
    let mut heading_text: Option<String> = None;
    let mut heading: Option<String> = None;

    for (event, range) in events {
        match event {
            Event::Start(Tag::BlockQuote(_)) => quotes += 1,
            Event::End(TagEnd::BlockQuote(_)) => quotes = quotes.saturating_sub(1),
            Event::Start(Tag::CodeBlock(_)) => in_code = true,
            Event::End(TagEnd::CodeBlock) => in_code = false,
            Event::Start(Tag::MetadataBlock(_)) => metadata = Some(String::new()),
            Event::End(TagEnd::MetadataBlock(_)) => {
                if let Some(yaml) = metadata.take() {
                    tags.extend(front_matter_tags(&yaml));
                }
            }
            Event::Start(Tag::Heading { .. }) => heading_text = Some(String::new()),
            Event::End(TagEnd::Heading(_)) => {
                heading = heading_text
                    .take()
                    .map(|t| t.trim().to_owned())
                    .filter(|t| !t.is_empty());
            }
            Event::Start(Tag::Item) => items.push(None),
            Event::End(TagEnd::Item) => {
                items.pop();
            }
            Event::TaskListMarker(_) if quotes == 0 => {
                let parent_line = items
                    .len()
                    .checked_sub(2)
                    .and_then(|i| items.get(i).copied().flatten())
                    .and_then(|i| note.tasks.get(i))
                    .map(|t| t.line);
                if let Some(slot) = items.last_mut()
                    && let Some(task) =
                        task_at(text, &lines, range.start, heading.clone(), parent_line)
                {
                    *slot = Some(note.tasks.len());
                    note.tasks.push(task);
                }
            }
            Event::Start(Tag::Link {
                link_type,
                dest_url,
                ..
            }) => {
                links += 1;
                if let LinkType::WikiLink { .. } = link_type
                    && let Some(link) = wiki_link(&dest_url)
                    && !note.links.contains(&link)
                {
                    note.links.push(link);
                }
            }
            Event::End(TagEnd::Link) => links = links.saturating_sub(1),
            Event::Text(value) => {
                if let Some(yaml) = metadata.as_mut() {
                    yaml.push_str(&value);
                    continue;
                }
                if in_code {
                    continue;
                }
                if let Some(buffer) = heading_text.as_mut() {
                    buffer.push_str(&value);
                }
                // The source, not the event text: an escaped `\#` must stay escaped.
                if links == 0
                    && let Some(source) = text.get(range.clone())
                {
                    let before = text[..range.start].chars().next_back();
                    inline_tags(source, before, &mut tags);
                }
            }
            Event::Code(value) => {
                if let Some(buffer) = heading_text.as_mut() {
                    buffer.push_str(&value);
                }
            }
            _ => {}
        }
    }

    tags.sort();
    tags.dedup();
    note.tags = tags;
    note
}

/// Byte offsets of line starts, to turn offsets into 1-based line numbers.
struct Lines {
    starts: Vec<usize>,
    len: usize,
}

impl Lines {
    fn new(text: &str) -> Self {
        let mut starts = vec![0];
        starts.extend(text.match_indices('\n').map(|(i, _)| i + 1));
        Self {
            starts,
            len: text.len(),
        }
    }

    /// 0-based line containing `offset`.
    fn index_of(&self, offset: usize) -> usize {
        self.starts
            .partition_point(|&s| s <= offset)
            .saturating_sub(1)
    }

    /// End of line `index`, before its `\n` (a `\r` before it is left for the caller).
    fn end_of(&self, index: usize) -> usize {
        self.starts
            .get(index + 1)
            .map_or(self.len, |next| next.saturating_sub(1))
    }

    fn start_of(&self, index: usize) -> usize {
        self.starts.get(index).copied().unwrap_or(self.len)
    }
}

/// The task whose box starts at `marker`, if its line has the format's shape: a bullet and a
/// space before the box, `[ ]`/`[x]`/`[X]`, then a space or a tab and some text.
fn task_at(
    text: &str,
    lines: &Lines,
    marker: usize,
    heading: Option<String>,
    parent_line: Option<u32>,
) -> Option<Task> {
    let index = lines.index_of(marker);
    let start = lines.start_of(index);
    let end = lines.end_of(index);
    let before = text.get(start..marker)?;
    let bullet = before.trim_end_matches([' ', '\t']);
    if bullet.len() == before.len() || !ends_with_bullet(bullet) {
        return None;
    }
    let line = text.get(start..end)?.trim_end_matches('\r');
    let rest = line.get(marker - start..)?.strip_prefix('[')?;
    let mut chars = rest.chars();
    let checked = match chars.next()? {
        ' ' => false,
        'x' | 'X' => true,
        _ => return None,
    };
    let rest = chars.as_str().strip_prefix(']')?;
    if !rest.starts_with([' ', '\t']) || rest.trim().is_empty() {
        return None;
    }
    let dates = extract_dates(rest);
    Some(Task {
        line: u32::try_from(index + 1).unwrap_or(u32::MAX),
        checked,
        text: dates.text,
        due: dates.due,
        done: dates.done,
        heading,
        parent_line,
        line_text: line.to_owned(),
        box_at: marker - start,
    })
}

/// `-`, `*`, `+`, `1.` or `1)` at the end of `prefix`, after whitespace or the line start.
fn ends_with_bullet(prefix: &str) -> bool {
    let body = if let Some(rest) = prefix.strip_suffix(['-', '*', '+']) {
        rest
    } else if let Some(rest) = prefix.strip_suffix(['.', ')']) {
        let digits = rest.bytes().rev().take_while(u8::is_ascii_digit).count();
        if digits == 0 || digits > 9 {
            return false;
        }
        &rest[..rest.len() - digits]
    } else {
        return false;
    };
    body.is_empty() || body.ends_with(char::is_whitespace)
}

#[derive(Debug, PartialEq, Eq)]
pub struct Dates {
    pub text: String,
    pub due: Option<NaiveDate>,
    pub done: Option<NaiveDate>,
}

/// Finds the last valid `📅 date` and `✅ date` in a task's text and removes them (with the
/// whitespace before them); everything else stays.
pub fn extract_dates(text: &str) -> Dates {
    let due = last_date(text, DUE_SIGN);
    let done = last_date(text, DONE_SIGN);
    let mut spans: Vec<(usize, usize)> = [due, done].into_iter().flatten().map(|d| d.0).collect();
    spans.sort_unstable();
    let mut out = text.to_owned();
    for (start, end) in spans.into_iter().rev() {
        let start = text[..start].trim_end_matches([' ', '\t']).len();
        out.replace_range(start..end, "");
    }
    Dates {
        text: out.trim().to_owned(),
        due: due.map(|d| d.1),
        done: done.map(|d| d.1),
    }
}

/// The byte span of the last `sign date` in `text` whose date exists, and the date.
pub(super) fn last_date(text: &str, sign: char) -> Option<((usize, usize), NaiveDate)> {
    text.match_indices(sign).rev().find_map(|(start, _)| {
        let mut rest = &text[start + sign.len_utf8()..];
        rest = rest.strip_prefix(VARIATION_SELECTOR).unwrap_or(rest);
        let spaced = rest.trim_start_matches([' ', '\t']);
        if spaced.len() == rest.len() {
            return None;
        }
        let candidate = spaced.get(..10)?;
        let after = &spaced[10..];
        if !after.is_empty() && !after.starts_with(char::is_whitespace) {
            return None;
        }
        let date = parse_iso_date(candidate)?;
        let end = text.len() - after.len();
        Some(((start, end), date))
    })
}

/// `YYYY-MM-DD` exactly, and a day that exists.
fn parse_iso_date(value: &str) -> Option<NaiveDate> {
    let bytes = value.as_bytes();
    let shape = bytes.len() == 10
        && bytes[4] == b'-'
        && bytes[7] == b'-'
        && bytes
            .iter()
            .enumerate()
            .all(|(i, b)| i == 4 || i == 7 || b.is_ascii_digit());
    if !shape {
        return None;
    }
    NaiveDate::parse_from_str(value, "%Y-%m-%d").ok()
}

/// `[[target#heading|label]]` → the link, or `None` for a link to a heading of this note.
fn wiki_link(dest: &str) -> Option<Link> {
    let (target, heading) = match dest.split_once('#') {
        Some((target, heading)) => (target, Some(heading.trim().to_owned())),
        None => (dest, None),
    };
    let target = target.trim();
    (!target.is_empty()).then(|| Link {
        target: target.to_owned(),
        heading: heading.filter(|h| !h.is_empty()),
    })
}

fn is_tag_char(c: char) -> bool {
    c.is_alphanumeric() || matches!(c, '_' | '-' | '/')
}

/// `#tag` after whitespace or the start of a line, with at least one non-digit.
fn inline_tags(text: &str, before: Option<char>, tags: &mut Vec<String>) {
    let mut previous = before;
    for (index, c) in text.char_indices() {
        if c == '#' && previous.is_none_or(char::is_whitespace) {
            let tag: String = text[index + 1..]
                .chars()
                .take_while(|&c| is_tag_char(c))
                .collect();
            if tag.chars().any(|c| !c.is_ascii_digit()) {
                tags.push(tag.to_lowercase());
            }
        }
        previous = Some(c);
    }
}

/// `tags:` in front matter: `[a, b]`, `a, b`, or a `- a` list on the following lines.
fn front_matter_tags(yaml: &str) -> Vec<String> {
    let lines: Vec<&str> = yaml.lines().collect();
    let Some(at) = lines.iter().position(|line| line.starts_with("tags:")) else {
        return Vec::new();
    };
    let value = lines[at]["tags:".len()..].trim();
    let mut values = Vec::new();
    if value.is_empty() {
        for item in &lines[at + 1..] {
            match item.trim_start().strip_prefix('-') {
                Some(tag) if item.starts_with([' ', '\t', '-']) => values.push(tag),
                _ => break,
            }
        }
    } else {
        let list = value
            .strip_prefix('[')
            .and_then(|v| v.strip_suffix(']'))
            .unwrap_or(value);
        values.extend(list.split(','));
    }
    values
        .iter()
        .map(|v| {
            v.trim()
                .trim_matches(['"', '\''])
                .trim_start_matches('#')
                .to_lowercase()
        })
        .filter(|v| !v.is_empty())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn day(value: &str) -> NaiveDate {
        NaiveDate::parse_from_str(value, "%Y-%m-%d").unwrap()
    }

    #[test]
    fn extract_dates_takes_the_last_valid_sign() {
        let dates = extract_dates("Two 📅 2026-11-01 📅 2026-11-20 ✅ 2026-11-10");
        assert_eq!(dates.text, "Two 📅 2026-11-01");
        assert_eq!(dates.due, Some(day("2026-11-20")));
        assert_eq!(dates.done, Some(day("2026-11-10")));

        let middle = extract_dates("Call 📅 2026-11-12 the bank");
        assert_eq!(middle.text, "Call the bank");

        for kept in [
            "Bad 📅 2026-02-30",
            "Glued 📅2026-11-12",
            "Short 📅 2026-1-12",
            "Tail 📅 2026-11-12x",
        ] {
            let dates = extract_dates(kept);
            assert_eq!((dates.text.as_str(), dates.due), (kept, None));
        }
    }

    #[test]
    fn task_lines_follow_the_format() {
        let note = parse(
            "- [ ] a\n- [ ]\n- [ ]b\n- [-] c\n1) [x] d\n\n```\n- [ ] code\n```\n> - [ ] quote\n",
        );
        let found: Vec<(u32, bool, &str)> = note
            .tasks
            .iter()
            .map(|t| (t.line, t.checked, t.text.as_str()))
            .collect();
        assert_eq!(found, vec![(1, false, "a"), (5, true, "d")]);
    }

    #[test]
    fn crlf_and_bom_keep_line_numbers() {
        let note = parse("\u{feff}# H\r\n\r\n- [ ] one\r\n  - [x] two\r\n");
        assert_eq!(note.tasks.len(), 2);
        assert_eq!(note.tasks[0].line, 3);
        assert_eq!(note.tasks[0].line_text, "- [ ] one");
        assert_eq!(note.tasks[1].parent_line, Some(3));
        assert_eq!(note.tasks[1].heading.as_deref(), Some("H"));
    }

    #[test]
    fn a_plain_bullet_breaks_the_parent_chain() {
        let note = parse("- [ ] top\n  - plain\n    - [ ] deep\n");
        assert_eq!(note.tasks[1].parent_line, None);
    }

    #[test]
    fn tags_skip_code_links_digits_and_headings() {
        let note =
            parse("# Title\n\n#One and #two/sub, #123, a#b, `#code`, [#link](x), \\#escaped #α\n");
        assert_eq!(note.tags, vec!["one", "two/sub", "α"]);
    }

    #[test]
    fn front_matter_tags_accept_three_spellings() {
        assert_eq!(front_matter_tags("tags: [A, \"b\"]"), vec!["a", "b"]);
        assert_eq!(front_matter_tags("title: x\ntags: a, #b"), vec!["a", "b"]);
        assert_eq!(
            front_matter_tags("tags:\n  - a\n  - b\nother: c"),
            vec!["a", "b"]
        );
        let note = parse("---\ntags: [x]\n---\n\nBody #y\n");
        assert_eq!(note.tags, vec!["x", "y"]);
    }

    #[test]
    fn wiki_links_split_the_heading_and_drop_the_label() {
        let note = parse("[[A]] [[B#Part|label]] [[#Local]] [[A]] `[[Code]]`\n");
        assert_eq!(
            note.links,
            vec![
                Link {
                    target: "A".into(),
                    heading: None
                },
                Link {
                    target: "B".into(),
                    heading: Some("Part".into())
                },
            ]
        );
    }
}
