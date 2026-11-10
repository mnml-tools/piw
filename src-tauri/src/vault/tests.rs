//! Vault tests on a temporary copy of `fixtures/vault` (fixtures/README.md).

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::mpsc::{Receiver, channel};
use std::time::{Duration, Instant};

use serde_json::{Value, json};
use tempfile::TempDir;

use super::paths::RelPath;
use super::{EntryKind, SyncReport, Vault, index_path, start, watcher};
use crate::domain::time::format_date;
use crate::error::ErrorCode;

fn fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../fixtures")
}

fn expected() -> Value {
    let text = fs::read_to_string(fixtures().join("vault.expected.json")).unwrap();
    serde_json::from_str(&text).unwrap()
}

fn copy_dir(from: &Path, to: &Path) {
    fs::create_dir_all(to).unwrap();
    for entry in fs::read_dir(from).unwrap() {
        let entry = entry.unwrap();
        let target = to.join(entry.file_name());
        if entry.file_type().unwrap().is_dir() {
            copy_dir(&entry.path(), &target);
        } else {
            fs::copy(entry.path(), target).unwrap();
        }
    }
}

struct Fixture {
    _dir: TempDir,
    root: PathBuf,
    data: PathBuf,
    vault: Arc<Vault>,
}

/// A synced vault holding a copy of the fixture vault.
fn fixture() -> Fixture {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("vault");
    copy_dir(&fixtures().join("vault"), &root);
    let data = dir.path().join("data");
    let vault = Vault::open(&root, &data).unwrap();
    vault.sync().unwrap();
    Fixture {
        root: fs::canonicalize(&root).unwrap(),
        data,
        vault: Arc::new(vault),
        _dir: dir,
    }
}

fn p(value: &str) -> RelPath {
    RelPath::parse(value).unwrap()
}

fn paths(list: &[RelPath]) -> Vec<&str> {
    list.iter().map(RelPath::as_str).collect()
}

fn task_texts(vault: &Vault, path: &str) -> Vec<String> {
    vault
        .index()
        .tasks_of(&p(path))
        .unwrap()
        .into_iter()
        .map(|t| t.text)
        .collect()
}

/// Everything the index holds, for comparing two indexes.
fn snapshot(vault: &Vault) -> Value {
    let index = vault.index();
    let notes: Vec<Value> = index
        .notes()
        .unwrap()
        .into_iter()
        .map(|note| {
            json!({
                "path": note.path.as_str(),
                "space": note.space,
                "title": note.title,
                "hash": note.hash,
                "tasks": format!("{:?}", index.tasks_of(&note.path).unwrap()),
                "tags": index.tags_of(&note.path).unwrap(),
                "links": format!("{:?}", index.links_of(&note.path).unwrap()),
            })
        })
        .collect();
    Value::Array(notes)
}

#[test]
fn the_fixture_vault_reads_as_expected() {
    let f = fixture();
    let expected = expected();
    let notes = expected["notes"].as_object().unwrap();
    let index = f.vault.index();

    let mut keys: Vec<&str> = notes.keys().map(String::as_str).collect();
    keys.sort_unstable();
    let indexed: Vec<String> = index
        .notes()
        .unwrap()
        .into_iter()
        .map(|n| n.path.to_string())
        .collect();
    assert_eq!(indexed, keys);
    for ignored in expected["ignored"].as_array().unwrap() {
        assert!(f.root.join(ignored.as_str().unwrap()).exists());
    }

    for (path, want) in notes {
        let rel = p(path);
        let note = index.note(&rel).unwrap().unwrap();
        assert_eq!(json!(note.space), want["space"], "{path}: space");
        assert_eq!(json!(note.title), want["title"], "{path}: title");
        assert_eq!(
            json!(index.tags_of(&rel).unwrap()),
            want["tags"],
            "{path}: tags"
        );
        let links: Vec<Value> = index
            .links_of(&rel)
            .unwrap()
            .into_iter()
            .map(|l| {
                json!({
                    "target": l.target,
                    "heading": l.heading,
                    "path": l.path.map(|p| p.to_string()),
                })
            })
            .collect();
        assert_eq!(Value::Array(links), want["links"], "{path}: links");
        let tasks: Vec<Value> = index
            .tasks_of(&rel)
            .unwrap()
            .into_iter()
            .map(|t| {
                json!({
                    "line": t.line,
                    "checked": t.checked,
                    "text": t.text,
                    "due": t.due.map(format_date),
                    "done": t.done.map(format_date),
                    "heading": t.heading,
                    "parentLine": t.parent_line,
                })
            })
            .collect();
        assert_eq!(Value::Array(tasks), want["tasks"], "{path}: tasks");
    }

    let tasks = index.tasks_of(&p("Work/Projects/Refactor 2FA.md")).unwrap();
    assert_eq!(tasks[3].line_text, "  - [ ] Clock drift of one step");
    let refactor = index
        .note(&p("Work/Projects/Refactor 2FA.md"))
        .unwrap()
        .unwrap();
    assert_eq!((refactor.tasks_open, refactor.tasks_done), (4, 2));
}

#[test]
fn the_tree_lists_folders_before_notes() {
    let f = fixture();
    let tree = f.vault.tree().unwrap();
    let listed: Vec<(&str, EntryKind)> = tree.iter().map(|e| (e.path.as_str(), e.kind)).collect();
    use EntryKind::{Folder, Note};
    assert_eq!(
        listed,
        vec![
            ("Personal", Folder),
            ("Personal/Stickies", Folder),
            ("Personal/Stickies/Recovery codes.md", Note),
            ("Personal/Edge cases.md", Note),
            ("Personal/Ideias de prendas.md", Note),
            ("Work", Folder),
            ("Work/Projects", Folder),
            ("Work/Projects/Onboarding.md", Note),
            ("Work/Projects/Refactor 2FA.md", Note),
            ("Work/Inbox.md", Note),
            ("Work/Reuniões.md", Note),
            ("Loose note.md", Note),
        ]
    );
}

#[test]
fn a_new_vault_starts_with_the_default_spaces_and_keeps_its_index_outside() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("Piw");
    let data = dir.path().join("data");
    let vault = Vault::open(&root, &data).unwrap();
    let tree: Vec<String> = vault
        .tree()
        .unwrap()
        .into_iter()
        .map(|e| e.path.to_string())
        .collect();
    assert_eq!(tree, vec!["Personal", "Work"]);
    assert!(index_path(&data, vault.root()).is_file());
    assert!(!vault.root().join(".piw").exists());

    // A folder that already has notes is left as it is.
    let other = dir.path().join("Existing");
    fs::create_dir_all(&other).unwrap();
    fs::write(other.join("a.md"), "a").unwrap();
    let vault = Vault::open(&other, &data).unwrap();
    assert_eq!(vault.tree().unwrap().len(), 1);
}

#[test]
fn a_write_needs_the_hash_it_was_based_on() {
    let f = fixture();
    let path = p("Work/Inbox.md");
    let note = f.vault.read(&path).unwrap();
    let saved = f
        .vault
        .write(&path, &format!("{}- [ ] Third\n", note.text), &note.hash)
        .unwrap();
    assert_ne!(saved.hash, note.hash);
    assert_eq!(f.vault.read(&path).unwrap(), saved);
    assert_eq!(
        f.vault.index().note(&path).unwrap().unwrap().hash,
        saved.hash
    );
    assert_eq!(task_texts(&f.vault, "Work/Inbox.md").len(), 3);

    let stale = f.vault.write(&path, "lost", &note.hash).unwrap_err();
    assert_eq!(stale.code(), ErrorCode::Conflict);
    assert_eq!(fs::read_to_string(path.to_fs(&f.root)).unwrap(), saved.text);

    let missing = f
        .vault
        .write(&p("Work/Nope.md"), "x", &note.hash)
        .unwrap_err();
    assert_eq!(missing.code(), ErrorCode::NotFound);
    let not_a_note = f.vault.read(&p("Personal/todo.txt")).unwrap_err();
    assert_eq!(not_a_note.code(), ErrorCode::Validation);
}

#[test]
fn a_write_keeps_the_line_endings_and_byte_order_mark() {
    let f = fixture();
    let file = f.root.join("Personal/Windows.md");
    fs::write(&file, "\u{feff}- [ ] one\r\n").unwrap();
    f.vault.sync().unwrap();
    let path = p("Personal/Windows.md");
    let note = f.vault.read(&path).unwrap();
    assert_eq!(note.text, "- [ ] one\n");
    assert_eq!(task_texts(&f.vault, "Personal/Windows.md"), vec!["one"]);

    f.vault
        .write(&path, "- [ ] one\n- [ ] two\n", &note.hash)
        .unwrap();
    assert_eq!(
        fs::read(&file).unwrap(),
        "\u{feff}- [ ] one\r\n- [ ] two\r\n".as_bytes()
    );
}

#[test]
fn a_note_that_is_not_utf8_is_listed_but_not_opened() {
    let f = fixture();
    fs::write(f.root.join("Work/binary.md"), [0xff, 0xfe, 0x00]).unwrap();
    f.vault.sync().unwrap();
    let path = p("Work/binary.md");
    assert!(f.vault.index().note(&path).unwrap().is_some());
    assert_eq!(
        f.vault.read(&path).unwrap_err().code(),
        ErrorCode::Validation
    );
}

#[test]
fn new_notes_and_folders_get_free_valid_names() {
    let f = fixture();
    let work = p("Work");
    let first = f.vault.create_note(Some(&work), "Ideas", "x").unwrap();
    assert_eq!(first.path.as_str(), "Work/Ideas.md");
    assert_eq!(first.text, "x\n");
    assert_eq!(
        fs::read_to_string(first.path.to_fs(&f.root)).unwrap(),
        "x\n"
    );
    assert!(f.vault.index().note(&first.path).unwrap().is_some());

    let second = f.vault.create_note(Some(&work), "Ideas", "").unwrap();
    assert_eq!(second.path.as_str(), "Work/Ideas 2.md");
    let lower = f.vault.create_note(Some(&work), "ideas", "").unwrap();
    assert_eq!(lower.path.as_str(), "Work/ideas 3.md");
    let root = f.vault.create_note(None, "Root", "- [ ] r").unwrap();
    assert_eq!(root.path.as_str(), "Root.md");
    assert_eq!(task_texts(&f.vault, "Root.md"), vec!["r"]);

    let invalid = f.vault.create_note(Some(&work), "a/b", "").unwrap_err();
    assert_eq!(invalid.code(), ErrorCode::Validation);
    let nowhere = f
        .vault
        .create_note(Some(&p("Nowhere")), "x", "")
        .unwrap_err();
    assert_eq!(nowhere.code(), ErrorCode::NotFound);

    let archive = f.vault.create_folder(None, "Archive").unwrap();
    assert_eq!(archive.as_str(), "Archive");
    assert!(f.root.join("Archive").is_dir());
    let again = f.vault.create_folder(None, "archive").unwrap_err();
    assert_eq!(again.code(), ErrorCode::Validation);
    let nested = f.vault.create_folder(Some(&archive), "2025").unwrap();
    assert_eq!(nested.as_str(), "Archive/2025");
}

#[test]
fn rename_and_move_keep_the_index_in_step() {
    let f = fixture();
    let index = f.vault.index();

    let report = f
        .vault
        .rename(&p("Work/Inbox.md"), &p("Work/Today.md"))
        .unwrap()
        .report;
    assert_eq!(paths(&report.changed), vec!["Work/Today.md"]);
    assert_eq!(paths(&report.removed), vec!["Work/Inbox.md"]);
    assert_eq!(task_texts(&f.vault, "Work/Today.md").len(), 2);

    // Links resolve against the notes as they are now.
    f.vault
        .rename(&p("Work/Reuniões.md"), &p("Personal/Reuniões.md"))
        .unwrap();
    let moved = index.note(&p("Personal/Reuniões.md")).unwrap().unwrap();
    assert_eq!(moved.space.as_deref(), Some("Personal"));
    let links = index.links_of(&p("Work/Projects/Refactor 2FA.md")).unwrap();
    assert_eq!(
        links[0].path.as_ref().map(RelPath::as_str),
        Some("Personal/Reuniões.md")
    );

    let report = f
        .vault
        .rename(&p("Work/Projects"), &p("Work/Clients"))
        .unwrap()
        .report;
    assert_eq!(
        paths(&report.changed),
        vec!["Work/Clients/Onboarding.md", "Work/Clients/Refactor 2FA.md"]
    );
    assert_eq!(report.removed.len(), 2);

    f.vault
        .rename(&p("Personal/Edge cases.md"), &p("Personal/Edge Cases.md"))
        .unwrap();
    assert!(index.note(&p("Personal/Edge Cases.md")).unwrap().is_some());

    for (from, to) in [
        ("Work/Today.md", "Personal/ideias de PRENDAS.md"),
        ("Work", "Work/Clients/Work"),
        ("Work/Today.md", "Work/Today.txt"),
        ("Work/Today.md", "Work/bad:name.md"),
    ] {
        let error = f.vault.rename(&p(from), &p(to)).unwrap_err();
        assert_eq!(error.code(), ErrorCode::Validation, "{from} → {to}");
    }
    let missing = f
        .vault
        .rename(&p("Work/Today.md"), &p("Nowhere/Today.md"))
        .unwrap_err();
    assert_eq!(missing.code(), ErrorCode::NotFound);
}

#[test]
fn trash_restore_and_purge() {
    let f = fixture();
    let index = f.vault.index();
    let inbox = p("Work/Inbox.md");

    let entry = f.vault.trash(&inbox).unwrap();
    assert!(index.note(&inbox).unwrap().is_none());
    assert!(
        f.root
            .join(".piw/trash")
            .join(&entry.id)
            .join("Work/Inbox.md")
            .is_file()
    );
    let folder = f.vault.trash(&p("Work/Projects")).unwrap();
    assert_ne!(folder.id, entry.id);
    assert!(
        index
            .note(&p("Work/Projects/Onboarding.md"))
            .unwrap()
            .is_none()
    );
    assert_eq!(
        f.vault.trash_entries().unwrap(),
        vec![folder.clone(), entry.clone()]
    );

    // The old name is taken by now: the restored note gets a free one.
    f.vault.create_note(Some(&p("Work")), "Inbox", "").unwrap();
    let restored = f.vault.restore(&entry.id).unwrap();
    assert_eq!(restored.as_str(), "Work/Inbox 2.md");
    assert_eq!(task_texts(&f.vault, "Work/Inbox 2.md").len(), 2);

    // A folder comes back whole, even when its parent is gone.
    fs::remove_dir_all(f.root.join("Work")).unwrap();
    f.vault.sync().unwrap();
    assert_eq!(
        f.vault.restore(&folder.id).unwrap().as_str(),
        "Work/Projects"
    );
    assert!(
        index
            .note(&p("Work/Projects/Onboarding.md"))
            .unwrap()
            .is_some()
    );
    assert!(f.vault.trash_entries().unwrap().is_empty());

    let gone = f.vault.trash(&p("Loose note.md")).unwrap();
    f.vault.purge(&gone.id).unwrap();
    assert!(f.vault.trash_entries().unwrap().is_empty());
    assert!(!f.root.join(".piw/trash").join(&gone.id).exists());
    for bad in ["", "../vault", gone.id.as_str()] {
        assert_eq!(
            f.vault.purge(bad).unwrap_err().code(),
            ErrorCode::NotFound,
            "{bad:?}"
        );
    }
}

#[test]
fn sync_picks_up_edits_made_outside_piw() {
    let f = fixture();
    assert!(f.vault.sync().unwrap().is_empty());

    fs::write(f.root.join("Work/Inbox.md"), "- [ ] Only one now\n").unwrap();
    fs::write(f.root.join("Personal/New.md"), "#fresh\n").unwrap();
    fs::remove_file(f.root.join("Loose note.md")).unwrap();
    let report = f.vault.sync().unwrap();
    assert_eq!(
        paths(&report.changed),
        vec!["Personal/New.md", "Work/Inbox.md"]
    );
    assert_eq!(paths(&report.removed), vec!["Loose note.md"]);
    assert_eq!(task_texts(&f.vault, "Work/Inbox.md"), vec!["Only one now"]);
    assert_eq!(
        f.vault.index().tags_of(&p("Personal/New.md")).unwrap(),
        vec!["fresh"]
    );
}

fn wait_for(reports: &Receiver<SyncReport>, done: impl Fn(&SyncReport) -> bool) -> SyncReport {
    let deadline = Instant::now() + Duration::from_secs(10);
    loop {
        let left = deadline.saturating_duration_since(Instant::now());
        let report = reports
            .recv_timeout(left)
            .expect("the watcher reported the change in time");
        if done(&report) {
            return report;
        }
    }
}

#[test]
fn the_watcher_applies_external_changes_and_ignores_piws_own() {
    let f = fixture();
    let (sender, reports) = channel();
    let _watcher = watcher::watch(Arc::clone(&f.vault), move |report| {
        let _ = sender.send(report);
    })
    .unwrap();

    let inbox = p("Work/Inbox.md");
    fs::write(inbox.to_fs(&f.root), "- [ ] Edited elsewhere\n").unwrap();
    wait_for(&reports, |r| r.changed.contains(&inbox));
    assert_eq!(
        task_texts(&f.vault, "Work/Inbox.md"),
        vec!["Edited elsewhere"]
    );

    fs::rename(f.root.join("Work/Projects"), f.root.join("Work/Clients")).unwrap();
    wait_for(&reports, |r| {
        r.removed.contains(&p("Work/Projects/Onboarding.md"))
            && r.changed.contains(&p("Work/Clients/Onboarding.md"))
    });

    fs::remove_file(f.root.join("Loose note.md")).unwrap();
    wait_for(&reports, |r| r.removed.contains(&p("Loose note.md")));

    // Piw's own write is already indexed, so the watcher has nothing to report.
    let note = f.vault.read(&inbox).unwrap();
    f.vault.write(&inbox, "- [ ] Mine\n", &note.hash).unwrap();
    assert!(reports.recv_timeout(Duration::from_millis(800)).is_err());
}

#[test]
fn the_index_rebuilds_from_the_files() {
    let f = fixture();
    let before = snapshot(&f.vault);
    let index_file = index_path(&f.data, &f.root);
    let Fixture {
        _dir,
        root,
        data,
        vault,
    } = f;
    drop(vault);
    let remove_index = || {
        for suffix in ["", "-wal", "-shm"] {
            let mut file = index_file.as_os_str().to_owned();
            file.push(suffix);
            let _ = fs::remove_file(file);
        }
    };

    // An index that is up to date is reused as it is.
    let vault = Vault::open(&root, &data).unwrap();
    assert!(vault.sync().unwrap().is_empty());
    drop(vault);

    remove_index();
    let vault = Vault::open(&root, &data).unwrap();
    assert_eq!(vault.sync().unwrap().changed.len(), 8);
    assert_eq!(snapshot(&vault), before);
    drop(vault);

    remove_index();
    fs::write(&index_file, b"this is not a database").unwrap();
    let vault = Vault::open(&root, &data).unwrap();
    assert_eq!(vault.sync().unwrap().changed.len(), 8);
    assert_eq!(snapshot(&vault), before);
}

#[test]
fn search_finds_titles_and_text_without_diacritics() {
    let f = fixture();
    let index = f.vault.index();
    let totp = index.search("totp").unwrap();
    assert_eq!(totp.len(), 1);
    assert_eq!(totp[0].path.as_str(), "Work/Projects/Refactor 2FA.md");
    assert!(totp[0].snippet.contains("\u{2}TOTP\u{3}"));
    // The title outranks the link to it from Refactor 2FA.
    assert_eq!(
        index
            .search("reunioes")
            .unwrap()
            .first()
            .map(|hit| hit.path.as_str()),
        Some("Work/Reuniões.md")
    );
    index.search("NOT OR \"*").unwrap();
    assert!(index.search("   ").unwrap().is_empty());
}

#[test]
fn start_opens_syncs_and_watches() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("vault");
    copy_dir(&fixtures().join("vault"), &root);
    let state = start(&root, &dir.path().join("data"), |_| {}).unwrap();
    assert_eq!(state.vault.index().notes().unwrap().len(), 8);
}

#[test]
fn renaming_a_note_rewrites_the_links_to_it() {
    let f = fixture();
    let index = f.vault.index();
    fs::write(
        f.root.join("Personal/Links.md"),
        "[[refactor 2fa]] [[Refactor 2FA#Plan|plan]] [[Work/Projects/Refactor 2FA]]\n\
         [[Refactor 2FAX]] [[Reuniões]]\n",
    )
    .unwrap();
    f.vault.sync().unwrap();

    let renamed = f
        .vault
        .rename(
            &p("Work/Projects/Refactor 2FA.md"),
            &p("Work/Auth/TOTP rollout.md"),
        )
        .unwrap_err();
    assert_eq!(renamed.code(), ErrorCode::NotFound, "the folder must exist");
    f.vault.create_folder(Some(&p("Work")), "Auth").unwrap();
    let renamed = f
        .vault
        .rename(
            &p("Work/Projects/Refactor 2FA.md"),
            &p("Work/Auth/TOTP rollout.md"),
        )
        .unwrap();
    assert_eq!(
        paths(&renamed.linked),
        vec![
            "Personal/Links.md",
            "Personal/Stickies/Recovery codes.md",
            "Work/Reuniões.md"
        ]
    );
    assert_eq!(
        fs::read_to_string(f.root.join("Personal/Links.md")).unwrap(),
        "[[TOTP rollout]] [[TOTP rollout#Plan|plan]] [[Work/Auth/TOTP rollout]]\n\
         [[Refactor 2FAX]] [[Reuniões]]\n"
    );
    assert!(
        fs::read_to_string(f.root.join("Work/Reuniões.md"))
            .unwrap()
            .contains("see [[TOTP rollout]].")
    );
    let links = index.links_of(&p("Personal/Links.md")).unwrap();
    assert!(
        links[..3]
            .iter()
            .all(|l| l.path.as_ref().map(RelPath::as_str) == Some("Work/Auth/TOTP rollout.md"))
    );
    assert_eq!(
        index
            .resolve("totp ROLLOUT")
            .unwrap()
            .map(|p| p.to_string()),
        Some("Work/Auth/TOTP rollout.md".to_owned())
    );

    // A move that keeps the title leaves links by title alone.
    let moved = f
        .vault
        .rename(&p("Work/Reuniões.md"), &p("Personal/Reuniões.md"))
        .unwrap();
    assert!(moved.linked.is_empty());
}

fn day(value: &str) -> chrono::NaiveDate {
    chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d").unwrap()
}

fn view_lines(vault: &Vault, view: super::index::TaskView, space: Option<&str>) -> Vec<String> {
    vault
        .index()
        .tasks(view, day("2026-11-10"), space)
        .unwrap()
        .into_iter()
        .map(|t| format!("{}:{} {}", t.path, t.task.line, t.task.text))
        .collect()
}

#[test]
fn task_views_list_by_date_and_keep_what_was_ticked_today() {
    use super::index::TaskView::{All, Today, Upcoming};
    let f = fixture();
    assert_eq!(
        view_lines(&f.vault, Today, None),
        vec![
            "Work/Projects/Refactor 2FA.md:18 Review with the team",
            "Work/Inbox.md:1 Call the accountant",
        ]
    );
    assert_eq!(
        view_lines(&f.vault, Upcoming, Some("Work")),
        vec![
            "Work/Projects/Refactor 2FA.md:14 Agree on the tolerance window",
            "Work/Projects/Onboarding.md:6 Meet the team",
            "Work/Reuniões.md:11 Book the room for next week",
        ]
    );
    assert!(view_lines(&f.vault, Upcoming, Some("Personal"))[0].starts_with("Personal/Edge"));
    let all = view_lines(&f.vault, All, None);
    assert_eq!(all.len(), 20);
    assert!(all.iter().all(|line| !line.contains("Read RFC")));

    let inbox = f
        .vault
        .index()
        .tasks(Today, day("2026-11-10"), None)
        .unwrap();
    let call = inbox
        .iter()
        .find(|t| t.path.as_str() == "Work/Inbox.md")
        .unwrap();
    let change = super::tasks::TaskChange::Check {
        checked: true,
        today: day("2026-11-10"),
    };
    let task = super::TaskRef {
        line: call.task.line,
        line_text: call.task.line_text.clone(),
        file_hash: call.file_hash.clone(),
    };
    f.vault.edit_task(&call.path, &task, &change).unwrap();
    let today = f
        .vault
        .index()
        .tasks(Today, day("2026-11-10"), None)
        .unwrap();
    let ticked = today
        .iter()
        .find(|t| t.path.as_str() == "Work/Inbox.md")
        .unwrap();
    assert!(ticked.task.checked);
    assert_eq!(ticked.task.done, Some(day("2026-11-10")));
}

#[test]
fn a_task_edit_changes_only_its_line_and_respects_the_guard() {
    let f = fixture();
    let path = p("Personal/Windows.md");
    let file = path.to_fs(&f.root);
    fs::write(&file, "\u{feff}# List\r\n- [ ] one\r\n- [ ] two\r\nend").unwrap();
    f.vault.sync().unwrap();
    let hash = f.vault.read(&path).unwrap().hash;
    let due = super::tasks::TaskChange::Due(Some(day("2026-11-12")));
    let reference = |line: u32, text: &str, hash: &str| super::TaskRef {
        line,
        line_text: text.to_owned(),
        file_hash: hash.to_owned(),
    };

    let edited = f
        .vault
        .edit_task(&path, &reference(3, "- [ ] two", &hash), &due)
        .unwrap();
    assert_eq!(
        fs::read(&file).unwrap(),
        "\u{feff}# List\r\n- [ ] one\r\n- [ ] two 📅 2026-11-12\r\nend".as_bytes()
    );
    assert_eq!(
        f.vault.index().tasks_of(&path).unwrap()[1].due,
        Some(day("2026-11-12"))
    );

    // A stale hash still finds the one line with that text, wherever it moved.
    fs::write(&file, "intro\n- [ ] one\n- [ ] two 📅 2026-11-12\n").unwrap();
    f.vault
        .edit_task(
            &path,
            &reference(2, "- [ ] one", &edited.hash),
            &super::tasks::TaskChange::Text("first".into()),
        )
        .unwrap();
    assert_eq!(
        fs::read_to_string(&file).unwrap(),
        "intro\n- [ ] first\n- [ ] two 📅 2026-11-12\n"
    );

    fs::write(&file, "- [ ] same\n- [ ] same\n").unwrap();
    let ambiguous = f
        .vault
        .edit_task(&path, &reference(1, "- [ ] same", "stale"), &due)
        .unwrap_err();
    assert_eq!(ambiguous.code(), ErrorCode::Conflict);
    let current = f.vault.read(&path).unwrap().hash;
    let gone = f
        .vault
        .edit_task(&path, &reference(1, "- [ ] other", &current), &due)
        .unwrap_err();
    assert_eq!(gone.code(), ErrorCode::Conflict);

    fs::write(&file, "```\n- [ ] code\n```\n").unwrap();
    let current = f.vault.read(&path).unwrap().hash;
    let code = f
        .vault
        .edit_task(&path, &reference(2, "- [ ] code", &current), &due)
        .unwrap_err();
    assert_eq!(code.code(), ErrorCode::Validation);
}

#[test]
fn quick_capture_appends_to_the_inbox_of_a_space() {
    let f = fixture();
    let task = |text: &str, due: Option<&str>| super::InboxEntry::Task {
        text: text.into(),
        description: String::new(),
        due: due.map(day),
    };
    let inbox = p("Work/Inbox.md");
    f.vault
        .capture(Some("Work"), &task("Pay the bill", Some("2026-11-12")))
        .unwrap();
    f.vault
        .capture(
            Some("Work"),
            &super::InboxEntry::Note("A thought\nwith two lines\n".into()),
        )
        .unwrap();
    f.vault
        .capture(
            Some("Work"),
            &super::InboxEntry::Task {
                text: "After a note".into(),
                description: "First detail\n\n second".into(),
                due: None,
            },
        )
        .unwrap();
    assert_eq!(
        fs::read_to_string(inbox.to_fs(&f.root)).unwrap(),
        "- [ ] Call the accountant 📅 2026-11-10\n- [ ] Order a new keyboard\n\n\
         Low-profile, quiet switches. Check the return policy first.\n\n\
         - [ ] Pay the bill 📅 2026-11-12\n\nA thought\nwith two lines\n\n\
         - [ ] After a note\n  First detail\n  second\n"
    );
    assert_eq!(task_texts(&f.vault, "Work/Inbox.md").len(), 4);

    // The first capture of a space creates its Inbox; a task list at the end takes the task.
    let created = f
        .vault
        .capture(Some("Personal"), &task("Buy flowers", None))
        .unwrap();
    assert_eq!(created.path.as_str(), "Personal/Inbox.md");
    f.vault
        .capture(Some("Personal"), &task("Book dinner", None))
        .unwrap();
    assert!(created.path.to_fs(&f.root).exists());
    assert_eq!(
        f.vault.read(&p("Personal/Inbox.md")).unwrap().text,
        "- [ ] Buy flowers\n- [ ] Book dinner\n"
    );
    assert_eq!(
        f.vault
            .capture(None, &task("Root", None))
            .unwrap()
            .path
            .as_str(),
        "Inbox.md"
    );

    for (space, entry) in [
        (Some("Work/Projects"), task("x", None)),
        (Some("Nowhere"), task("x", None)),
        (Some("Work"), super::InboxEntry::Note("  \n".into())),
        (Some("Work"), task("two\nlines", None)),
    ] {
        assert!(f.vault.capture(space, &entry).is_err(), "{space:?}");
    }
}

#[test]
fn a_sticky_from_a_selection_is_a_note_in_the_space_stickies_folder() {
    let f = fixture();
    let source = p("Work/Projects/Refactor 2FA.md");
    let note = f
        .vault
        .create_sticky_note(&source, "Tolerance", "  Agree on ±1 step.  ")
        .unwrap();
    assert_eq!(note.path.as_str(), "Work/Stickies/Tolerance.md");
    assert_eq!(note.text, "Agree on ±1 step.\n\nFrom [[Refactor 2FA]]\n");
    let links = f.vault.index().links_of(&note.path).unwrap();
    assert_eq!(links[0].path.as_ref(), Some(&source));
    let again = f
        .vault
        .create_sticky_note(&source, "Tolerance", "More")
        .unwrap();
    assert_eq!(again.path.as_str(), "Work/Stickies/Tolerance 2.md");
    let loose = f
        .vault
        .create_sticky_note(&p("Loose note.md"), "Root", "x")
        .unwrap();
    assert_eq!(loose.path.as_str(), "Stickies/Root.md");
    assert!(f.vault.create_sticky_note(&source, "Empty", " ").is_err());
}
