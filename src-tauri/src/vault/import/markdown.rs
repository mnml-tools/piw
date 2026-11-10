//! A document tab's ProseMirror JSON (the editor of Piw 0.1) as Markdown, for the import into the
//! vault. It writes the same canonical Markdown that `src/lib/editor/serialization.ts` exported
//! (checked against `fixtures/import/document.md`), except for task references, which the import
//! turns into task lines.

use serde_json::Value;

/// How the import writes a task reference (`taskRef` node).
pub trait TaskRefs {
    /// A reference alone in its paragraph: the task's lines (`- [ ] …`), or `None` to write it
    /// inline instead.
    fn block(&mut self, task_id: &str) -> Option<String>;
    /// A reference inside text: what to write there.
    fn inline(&mut self, task_id: &str) -> String;
}

const MERGEABLE_LISTS: [&str; 3] = ["bulletList", "orderedList", "checklist"];
/// Keeps two adjacent lists of one kind apart (a blank line does not end a CommonMark list).
const LIST_SEPARATOR: &str = "<!-- -->";

fn children(node: &Value) -> &[Value] {
    node.get("content")
        .and_then(Value::as_array)
        .map_or(&[], Vec::as_slice)
}

fn kind(node: &Value) -> &str {
    node.get("type").and_then(Value::as_str).unwrap_or_default()
}

fn attr<'a>(node: &'a Value, name: &str) -> Option<&'a Value> {
    node.get("attrs").and_then(|a| a.get(name))
}

/// The document as Markdown with a final newline (empty for an empty document).
pub fn to_markdown(doc: &Value, refs: &mut dyn TaskRefs) -> String {
    let out = blocks(children(doc), refs).join("\n\n");
    if out.trim().is_empty() {
        String::new()
    } else {
        format!("{out}\n")
    }
}

fn blocks(nodes: &[Value], refs: &mut dyn TaskRefs) -> Vec<String> {
    let mut out = Vec::new();
    let mut previous = "";
    for node in nodes {
        let name = kind(node);
        if name == previous && MERGEABLE_LISTS.contains(&name) {
            out.push(LIST_SEPARATOR.to_owned());
        }
        if let Some(text) = block(node, refs) {
            out.push(text);
        }
        previous = name;
    }
    out
}

fn block(node: &Value, refs: &mut dyn TaskRefs) -> Option<String> {
    Some(match kind(node) {
        "heading" => {
            let level = attr(node, "level")
                .and_then(Value::as_u64)
                .unwrap_or(1)
                .clamp(1, 6);
            format!(
                "{} {}",
                "#".repeat(level as usize),
                inline(children(node), refs)
            )
        }
        "paragraph" => {
            let content = children(node);
            if let [only] = content
                && kind(only) == "taskRef"
                && let Some(id) = attr(only, "taskId").and_then(Value::as_str)
                && let Some(lines) = refs.block(id)
            {
                return Some(lines);
            }
            let text = inline(content, refs);
            if text.trim().is_empty() {
                return None;
            }
            text
        }
        "blockquote" => blocks(children(node), refs)
            .join("\n\n")
            .lines()
            .map(|line| {
                if line.is_empty() {
                    ">".to_owned()
                } else {
                    format!("> {line}")
                }
            })
            .collect::<Vec<_>>()
            .join("\n"),
        "bulletList" => list(node, refs, |_| "- ".to_owned()),
        "orderedList" => {
            let start = attr(node, "start").and_then(Value::as_u64).unwrap_or(1);
            list(node, refs, |i| format!("{}. ", start + i as u64))
        }
        "checklist" => {
            let items: Vec<String> = children(node)
                .iter()
                .map(|item| {
                    let checked = attr(item, "checked")
                        .and_then(Value::as_bool)
                        .unwrap_or(false);
                    let marker = if checked { "- [x] " } else { "- [ ] " };
                    list_item(item, marker, 2, refs)
                })
                .collect();
            items.join("\n")
        }
        "codeBlock" => {
            let text: String = children(node)
                .iter()
                .filter_map(|n| n.get("text").and_then(Value::as_str))
                .collect();
            let language = attr(node, "language")
                .and_then(Value::as_str)
                .unwrap_or_default();
            let longest = text.split(|c| c != '`').map(str::len).max().unwrap_or(0);
            let fence = "`".repeat(longest.max(2) + 1);
            format!("{fence}{language}\n{text}\n{fence}")
        }
        "horizontalRule" => "---".to_owned(),
        _ => {
            let nested = blocks(children(node), refs);
            if nested.is_empty() {
                return None;
            }
            nested.join("\n\n")
        }
    })
}

fn list(node: &Value, refs: &mut dyn TaskRefs, marker: impl Fn(usize) -> String) -> String {
    children(node)
        .iter()
        .enumerate()
        .map(|(i, item)| {
            let marker = marker(i);
            let width = marker.len();
            list_item(item, &marker, width, refs)
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// The item's first block after `marker`; the rest (and nested lists) indented by `indent`.
fn list_item(item: &Value, marker: &str, indent: usize, refs: &mut dyn TaskRefs) -> String {
    let pad = " ".repeat(indent);
    let mut out = String::new();
    for (i, child) in children(item).iter().enumerate() {
        let Some(text) = block(child, refs) else {
            continue;
        };
        let lines: Vec<String> = text
            .lines()
            .enumerate()
            .map(|(j, line)| {
                if i == 0 && j == 0 {
                    format!("{marker}{line}")
                } else if line.is_empty() {
                    String::new()
                } else {
                    format!("{pad}{line}")
                }
            })
            .collect();
        if i == 0 && lines.is_empty() {
            out.push_str(marker.trim_end());
        }
        if !out.is_empty() {
            out.push('\n');
            // A paragraph after the first one needs a blank line to stay in the item.
            if kind(child) == "paragraph" {
                out.push('\n');
            }
        }
        out.push_str(&lines.join("\n"));
    }
    if out.is_empty() {
        marker.trim_end().to_owned()
    } else {
        out
    }
}

fn inline(nodes: &[Value], refs: &mut dyn TaskRefs) -> String {
    let mut out = String::new();
    for node in nodes {
        match kind(node) {
            "text" => {
                let text = node.get("text").and_then(Value::as_str).unwrap_or_default();
                out.push_str(&marked(text, node.get("marks").and_then(Value::as_array)));
            }
            "hardBreak" => out.push('\n'),
            "taskRef" => {
                if let Some(id) = attr(node, "taskId").and_then(Value::as_str) {
                    out.push_str(&refs.inline(id));
                }
            }
            _ => out.push_str(&inline(children(node), refs)),
        }
    }
    out
}

/// Text with its marks, innermost first: code, then emphasis, then the link around them.
fn marked(text: &str, marks: Option<&Vec<Value>>) -> String {
    let marks = marks.map_or(&[][..], Vec::as_slice);
    let has = |name: &str| marks.iter().any(|m| kind(m) == name);
    let mut out = if has("code") {
        let longest = text.split(|c| c != '`').map(str::len).max().unwrap_or(0);
        let ticks = "`".repeat(longest + 1);
        let pad = if text.starts_with('`') || text.ends_with('`') {
            " "
        } else {
            ""
        };
        format!("{ticks}{pad}{text}{pad}{ticks}")
    } else {
        escape(text)
    };
    for (name, wrap) in [("italic", "*"), ("bold", "**"), ("strike", "~~")] {
        if has(name) {
            out = format!("{wrap}{out}{wrap}");
        }
    }
    if let Some(link) = marks.iter().find(|m| kind(m) == "link")
        && let Some(href) = attr(link, "href").and_then(Value::as_str)
        && is_safe_href(href)
    {
        out = format!("[{out}]({href})");
    }
    out
}

/// The editor only ever stored http(s) and mailto links; anything else stays plain text.
fn is_safe_href(href: &str) -> bool {
    let lower = href.to_ascii_lowercase();
    ["http://", "https://", "mailto:"]
        .iter()
        .any(|scheme| lower.starts_with(scheme))
        && !href.contains(['(', ')', ' ', '\n'])
}

/// Characters that would otherwise become Markdown (or a vault link) are escaped.
fn escape(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for c in text.chars() {
        if matches!(c, '\\' | '*' | '_' | '[' | ']' | '`' | '~' | '<') {
            out.push('\\');
        }
        out.push(c);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    struct Literal;

    impl TaskRefs for Literal {
        fn block(&mut self, _: &str) -> Option<String> {
            None
        }
        fn inline(&mut self, id: &str) -> String {
            format!("[[task:{id}]]")
        }
    }

    fn fixture(name: &str) -> String {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../fixtures/import")
            .join(name);
        std::fs::read_to_string(path).unwrap()
    }

    #[test]
    fn writes_the_canonical_markdown_of_piw_0_1() {
        let doc: Value = serde_json::from_str(&fixture("document.json")).unwrap();
        assert_eq!(to_markdown(&doc, &mut Literal), fixture("document.md"));
    }

    struct Lines;

    impl TaskRefs for Lines {
        fn block(&mut self, id: &str) -> Option<String> {
            Some(format!("- [ ] Task {id}\n  - [x] Sub ✅ 2026-11-01"))
        }
        fn inline(&mut self, id: &str) -> String {
            format!("Task {id}")
        }
    }

    #[test]
    fn task_references_become_task_lines_and_lists_stay_apart() {
        let para = |content: Value| json!({ "type": "paragraph", "content": content });
        let doc = json!({ "type": "doc", "content": [
            para(json!([{ "type": "taskRef", "attrs": { "taskId": "a" } }])),
            para(json!([{ "type": "text", "text": "See " }, { "type": "taskRef", "attrs": { "taskId": "b" } }])),
            { "type": "bulletList", "content": [{ "type": "listItem", "content": [para(json!([{ "type": "text", "text": "one" }]))] }] },
            { "type": "bulletList", "content": [{ "type": "listItem", "content": [para(json!([{ "type": "text", "text": "two" }]))] }] },
            { "type": "orderedList", "attrs": { "start": 3 }, "content": [{ "type": "listItem", "content": [
                para(json!([{ "type": "text", "text": "three" }])),
                { "type": "bulletList", "content": [{ "type": "listItem", "content": [para(json!([{ "type": "text", "text": "deep" }]))] }] },
            ] }] },
            { "type": "codeBlock", "attrs": { "language": null }, "content": [{ "type": "text", "text": "a ``` b" }] },
            para(json!([{ "type": "text", "text": "bad", "marks": [{ "type": "link", "attrs": { "href": "javascript:x" } }] }])),
            para(json!([])),
        ] });
        assert_eq!(
            to_markdown(&doc, &mut Lines),
            "- [ ] Task a\n  - [x] Sub ✅ 2026-11-01\n\nSee Task b\n\n- one\n\n<!-- -->\n\n- two\n\n\
             3. three\n   - deep\n\n````\na ``` b\n````\n\nbad\n"
        );
        assert_eq!(
            to_markdown(
                &json!({ "type": "doc", "content": [para(json!([]))] }),
                &mut Lines
            ),
            ""
        );
    }
}
