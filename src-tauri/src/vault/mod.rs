//! The vault: a folder of Markdown notes that is the only source of truth
//! (docs/redesign.md, docs/vault-format.md), with its index and file watcher.
//!
//! It runs only when `PIW_VAULT` points at a folder; the workspace then shows the new shell
//! (`commands/vault.rs`).

pub mod dto;
pub mod files;
pub mod import;
pub mod index;
pub mod parse;
pub mod paths;
pub mod tasks;
pub mod watcher;

#[cfg(test)]
mod tests;

use std::collections::{BTreeMap, HashSet};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard};

use chrono::Utc;

use crate::error::{AppError, AppResult};
use index::Index;
use paths::{RelPath, name_key, note_file_name, validate_name};

/// Spaces a new, empty vault starts with.
pub const DEFAULT_SPACES: [&str; 2] = ["Work", "Personal"];

const PIW_DIR: &str = ".piw";
const TRASH_DIR: &str = "trash";
/// Inside each trash entry: the vault path the item came from.
const ORIGINAL_FILE: &str = ".original";
const INDEX_FILE: &str = "index.sqlite3";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NoteFile {
    pub path: RelPath,
    /// LF line endings, no byte-order mark.
    pub text: String,
    /// Hash of the bytes on disk: the `expected_hash` of the next write.
    pub hash: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EntryKind {
    Folder,
    Note,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TreeEntry {
    pub path: RelPath,
    pub kind: EntryKind,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TrashEntry {
    /// The entry's folder under `.piw/trash/`: its UTC deletion time (`20261110T143000`),
    /// with a `-2`, `-3`… suffix when several items went in the same second.
    pub id: String,
    /// Where the item was.
    pub path: RelPath,
}

/// Where a rename put the entry, what the index saw, and the notes whose links were rewritten.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Renamed {
    pub path: RelPath,
    pub report: SyncReport,
    pub linked: Vec<RelPath>,
}

/// The capture note of each space.
pub const INBOX_TITLE: &str = "Inbox";
/// Where notes made from a selection go, in each space.
pub const STICKIES_FOLDER: &str = "Stickies";

/// What Quick Capture appends to an Inbox.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum InboxEntry {
    Note(String),
    Task {
        text: String,
        /// Lines under the task, indented so they belong to it.
        description: String,
        due: Option<chrono::NaiveDate>,
    },
}

impl InboxEntry {
    fn render(&self) -> AppResult<String> {
        match self {
            Self::Note(text) => {
                let text = text.replace("\r\n", "\n");
                let text = text.trim_matches('\n').trim_end();
                if text.trim().is_empty() {
                    return Err(AppError::validation("write something to capture"));
                }
                Ok(text.to_owned())
            }
            Self::Task {
                text,
                description,
                due,
            } => {
                let text = text.trim();
                if text.is_empty() || text.contains(['\n', '\r']) {
                    return Err(AppError::validation("a task needs one line of text"));
                }
                let mut line = format!("- [ ] {text}");
                if due.is_some() {
                    line = tasks::apply(&line, 2, &tasks::TaskChange::Due(*due))?;
                }
                for extra in description
                    .lines()
                    .map(str::trim_end)
                    .filter(|l| !l.trim().is_empty())
                {
                    line.push_str("\n  ");
                    line.push_str(extra.trim_start());
                }
                Ok(line)
            }
        }
    }
}

/// `text` with `block` appended (docs/vault-format.md §5).
fn append_block(text: &str, block: &str, task: bool) -> String {
    if text.trim().is_empty() {
        return format!("{block}\n");
    }
    let mut out = text.trim_end_matches('\n').to_owned();
    let last = out.rsplit('\n').next().unwrap_or_default();
    let under_list = task && !text.ends_with("\n\n") && tasks::task_box(last).is_some();
    out.push_str(if under_list { "\n" } else { "\n\n" });
    out.push_str(block);
    out.push('\n');
    out
}

/// Which task line an edit means: where it was, what it said, and the file it was read from.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TaskRef {
    pub line: u32,
    pub line_text: String,
    pub file_hash: String,
}

/// Notes whose content the index saw change, and notes it no longer has.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct SyncReport {
    pub changed: Vec<RelPath>,
    pub removed: Vec<RelPath>,
}

impl SyncReport {
    pub fn is_empty(&self) -> bool {
        self.changed.is_empty() && self.removed.is_empty()
    }
}

enum Refreshed {
    Changed,
    Unchanged,
    Missing,
}

pub struct Vault {
    root: PathBuf,
    index: Index,
    /// Serialises Piw's own writes, so a guard check and its write cannot interleave.
    writes: Mutex<()>,
}

/// A started vault: the shared [`Vault`] and its watcher, which stops when this is dropped.
pub struct VaultState {
    pub vault: Arc<Vault>,
    _watcher: Mutex<watcher::VaultWatcher>,
}

/// Opens the vault at `root`, brings its index up to date and starts watching it; `on_change`
/// gets every batch of changes made outside Piw. Logs carry counts only, never note names.
pub fn start(
    root: &Path,
    data_dir: &Path,
    on_change: impl Fn(SyncReport) + Send + 'static,
) -> AppResult<VaultState> {
    let vault = Arc::new(Vault::open(root, data_dir)?);
    let report = vault.sync()?;
    log::info!(
        "vault ready: {} notes indexed, {} re-read, {} gone",
        vault.index().notes()?.len(),
        report.changed.len(),
        report.removed.len()
    );
    let watcher = watcher::watch(Arc::clone(&vault), move |report| {
        log::info!(
            "vault changed on disk: {} notes re-read, {} gone",
            report.changed.len(),
            report.removed.len()
        );
        on_change(report);
    })?;
    Ok(VaultState {
        vault,
        _watcher: Mutex::new(watcher),
    })
}

/// Where the vault is in the app's life: starting, ready or failed.
pub enum VaultPhase {
    Starting { root: PathBuf },
    Ready(VaultState),
    Failed { root: PathBuf, reason: String },
}

/// The vault as Tauri state. It exists from the first frame; a background thread fills it.
pub struct VaultSlot(Mutex<VaultPhase>);

impl VaultSlot {
    pub fn new(phase: VaultPhase) -> Self {
        Self(Mutex::new(phase))
    }

    fn lock(&self) -> AppResult<MutexGuard<'_, VaultPhase>> {
        self.0
            .lock()
            .map_err(|_| AppError::Internal("vault state lock poisoned".into()))
    }

    pub fn set(&self, phase: VaultPhase) -> AppResult<()> {
        *self.lock()? = phase;
        Ok(())
    }

    /// The open vault, or `not_found` while it is starting or failed.
    pub fn vault(&self) -> AppResult<Arc<Vault>> {
        match &*self.lock()? {
            VaultPhase::Ready(state) => Ok(Arc::clone(&state.vault)),
            _ => Err(AppError::NotFound { entity: "vault" }),
        }
    }

    pub fn status(&self) -> AppResult<dto::VaultStatus> {
        use dto::VaultPhaseName as Name;
        let shown = |path: &Path| Some(path.to_string_lossy().into_owned());
        Ok(match &*self.lock()? {
            VaultPhase::Starting { root } => dto::VaultStatus {
                phase: Name::Starting,
                root: shown(root),
                error: None,
            },
            VaultPhase::Ready(state) => dto::VaultStatus {
                phase: Name::Ready,
                root: shown(state.vault.root()),
                error: None,
            },
            VaultPhase::Failed { root, reason } => dto::VaultStatus {
                phase: Name::Failed,
                root: shown(root),
                error: Some(reason.clone()),
            },
        })
    }
}

/// Where the index of the vault at `root` lives: in Piw's data directory, never in the vault,
/// so a synced vault never carries a database between computers.
pub fn index_path(data_dir: &Path, root: &Path) -> PathBuf {
    let key = files::hash(root.to_string_lossy().as_bytes());
    data_dir.join("vaults").join(&key[..16]).join(INDEX_FILE)
}

impl Vault {
    /// Opens the vault at `root`, creating it (with the default spaces) when it is missing or
    /// empty. Call [`Vault::sync`] next to bring the index up to date.
    pub fn open(root: &Path, data_dir: &Path) -> AppResult<Self> {
        fs::create_dir_all(root)?;
        let root = fs::canonicalize(root)?;
        let empty = fs::read_dir(&root)?
            .filter_map(Result::ok)
            .all(|e| e.file_name().to_string_lossy().starts_with('.'));
        if empty {
            for space in DEFAULT_SPACES {
                fs::create_dir(root.join(space))?;
            }
        }
        let index = Index::open(&index_path(data_dir, &root))?;
        Ok(Self {
            root,
            index,
            writes: Mutex::new(()),
        })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn index(&self) -> &Index {
        &self.index
    }

    fn lock_writes(&self) -> AppResult<MutexGuard<'_, ()>> {
        self.writes
            .lock()
            .map_err(|_| AppError::Internal("vault write lock poisoned".into()))
    }

    fn trash_root(&self) -> PathBuf {
        self.root.join(PIW_DIR).join(TRASH_DIR)
    }

    /// Compares every note on disk with the index and re-reads the ones whose size or
    /// modification time changed.
    pub fn sync(&self) -> AppResult<SyncReport> {
        let scan = files::scan(&self.root)?;
        if scan.skipped > 0 {
            log::warn!(
                "vault: skipped {} entries whose names are not valid paths",
                scan.skipped
            );
        }
        let mut known = self.index.known()?;
        let mut report = SyncReport::default();
        for (path, stat) in scan.notes {
            let unchanged = known.remove(&path).is_some_and(|k| k.stat == stat);
            if !unchanged && matches!(self.refresh_note(&path)?, Refreshed::Changed) {
                report.changed.push(path);
            }
        }
        for path in known.into_keys() {
            self.index.remove(&path)?;
            report.removed.push(path);
        }
        report.changed.sort();
        report.removed.sort();
        Ok(report)
    }

    /// Re-reads only `paths` (from the file watcher). A folder, or a path that is gone and may
    /// have been one, falls back to [`Vault::sync`]; other files are ignored.
    pub fn refresh(&self, paths: &[RelPath]) -> AppResult<SyncReport> {
        let mut notes = Vec::new();
        for path in paths {
            let abs = path.to_fs(&self.root);
            if path.is_note() && !abs.is_dir() {
                notes.push(path);
            } else if abs.is_dir() || fs::symlink_metadata(&abs).is_err() {
                return self.sync();
            }
        }
        let mut report = SyncReport::default();
        for path in notes {
            match self.refresh_note(path)? {
                Refreshed::Changed => report.changed.push(path.clone()),
                Refreshed::Unchanged => {}
                Refreshed::Missing => {
                    if self.index.hash_of(path)?.is_some() {
                        self.index.remove(path)?;
                        report.removed.push(path.clone());
                    }
                }
            }
        }
        Ok(report)
    }

    /// Indexes one note from disk.
    fn refresh_note(&self, path: &RelPath) -> AppResult<Refreshed> {
        let abs = path.to_fs(&self.root);
        // Stat before reading: a write in between leaves a newer stat for the next sync.
        let (stat, bytes) = match files::stat(&abs).and_then(|stat| Ok((stat, fs::read(&abs)?))) {
            Ok(found) => found,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Ok(Refreshed::Missing);
            }
            Err(error) => return Err(error.into()),
        };
        let hash = files::hash(&bytes);
        if self.index.hash_of(path)?.as_deref() == Some(hash.as_str()) {
            self.index.touch(path, stat)?;
            return Ok(Refreshed::Unchanged);
        }
        // A note that is not UTF-8 is still listed, without content.
        let text = files::decode(&bytes).map(|d| d.text).unwrap_or_default();
        self.index
            .put(path, stat, &hash, &text, &parse::parse(&text))?;
        Ok(Refreshed::Changed)
    }

    /// Every visible folder and note, in tree order: folders before notes at each level, then
    /// by name, ignoring case.
    pub fn tree(&self) -> AppResult<Vec<TreeEntry>> {
        let scan = files::scan(&self.root)?;
        let mut entries: Vec<TreeEntry> = scan
            .folders
            .into_iter()
            .map(|path| TreeEntry {
                path,
                kind: EntryKind::Folder,
            })
            .chain(scan.notes.into_iter().map(|(path, _)| TreeEntry {
                path,
                kind: EntryKind::Note,
            }))
            .collect();
        entries.sort_by_cached_key(|entry| {
            let segments: Vec<&str> = entry.path.as_str().split('/').collect();
            let last = segments.len() - 1;
            segments
                .iter()
                .enumerate()
                .map(|(i, s)| (i == last && entry.kind == EntryKind::Note, name_key(s)))
                .collect::<Vec<_>>()
        });
        Ok(entries)
    }

    pub fn read(&self, path: &RelPath) -> AppResult<NoteFile> {
        let bytes = read_note(&self.root, path)?;
        Ok(NoteFile {
            path: path.clone(),
            text: files::decode(&bytes)?.text,
            hash: files::hash(&bytes),
        })
    }

    /// Replaces a note's text if the file still has `expected_hash`; otherwise `conflict`.
    /// The file keeps its line endings and byte-order mark.
    pub fn write(&self, path: &RelPath, text: &str, expected_hash: &str) -> AppResult<NoteFile> {
        let guard = self.lock_writes()?;
        let current = read_note(&self.root, path)?;
        if files::hash(&current) != expected_hash {
            return Err(AppError::Conflict { entity: "note" });
        }
        let decoded = files::decode(&current)?;
        let bytes = files::encode(text, decoded.bom, decoded.crlf);
        if bytes != current {
            files::write_atomic(&path.to_fs(&self.root), &bytes)?;
        }
        drop(guard);
        self.refresh_note(path)?;
        Ok(NoteFile {
            path: path.clone(),
            text: text.replace("\r\n", "\n"),
            hash: files::hash(&bytes),
        })
    }

    /// Creates a note titled `title` in `folder` (the vault root when `None`), with ` 2`, ` 3`…
    /// added when the name is taken. The file gets LF line endings and a final newline.
    pub fn create_note(
        &self,
        folder: Option<&RelPath>,
        title: &str,
        text: &str,
    ) -> AppResult<NoteFile> {
        validate_name(title)?;
        let guard = self.lock_writes()?;
        let dir = self.existing_folder(folder)?;
        let name = free_name(&dir, title, true)?;
        let path = child(folder, &name)?;
        let mut text = text.replace("\r\n", "\n");
        if !text.is_empty() && !text.ends_with('\n') {
            text.push('\n');
        }
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(path.to_fs(&self.root))?;
        file.write_all(text.as_bytes())?;
        file.sync_all()?;
        drop(guard);
        self.refresh_note(&path)?;
        Ok(NoteFile {
            hash: files::hash(text.as_bytes()),
            path,
            text,
        })
    }

    /// Creates a folder (a space when `parent` is `None`). The name must be free.
    pub fn create_folder(&self, parent: Option<&RelPath>, name: &str) -> AppResult<RelPath> {
        validate_name(name)?;
        let _guard = self.lock_writes()?;
        let dir = self.existing_folder(parent)?;
        if taken_names(&dir)?.contains(&name_key(name)) {
            return Err(name_taken());
        }
        let path = child(parent, name)?;
        fs::create_dir(path.to_fs(&self.root))?;
        Ok(path)
    }

    /// Renames or moves a note or folder to `to`, whose folder must exist. A note keeps the
    /// `.md` extension; a name that differs only in case is a rename of the same entry.
    ///
    /// Links to a renamed note are rewritten in the notes that hold them: a link by title when
    /// the title changes, a link by path always. Links into a moved folder are left as they are.
    pub fn rename(&self, from: &RelPath, to: &RelPath) -> AppResult<Renamed> {
        let note = from.is_note();
        if to.is_note() != note {
            return Err(AppError::validation("a note keeps the .md extension"));
        }
        validate_name(if note { to.title() } else { to.name() })?;
        if !note && to.starts_with(from) {
            return Err(AppError::validation("a folder cannot move into itself"));
        }
        let backlinks = if note {
            self.index.backlinks(from)?
        } else {
            Vec::new()
        };
        let guard = self.lock_writes()?;
        let source = from.to_fs(&self.root);
        if fs::symlink_metadata(&source).is_err() {
            return Err(AppError::NotFound {
                entity: if note { "note" } else { "folder" },
            });
        }
        let dir = self.existing_folder(to.parent().as_ref())?;
        let same_entry =
            from.parent() == to.parent() && name_key(from.name()) == name_key(to.name());
        if !same_entry && taken_names(&dir)?.contains(&name_key(to.name())) {
            return Err(name_taken());
        }
        fs::rename(&source, to.to_fs(&self.root))?;
        drop(guard);
        let report = if note {
            self.refresh(&[from.clone(), to.clone()])?
        } else {
            self.sync()?
        };
        let linked = self.update_links(from, to, backlinks)?;
        Ok(Renamed {
            path: to.clone(),
            report,
            linked,
        })
    }

    /// Rewrites the links that named `from` so they name `to`; returns the notes it changed.
    fn update_links(
        &self,
        from: &RelPath,
        to: &RelPath,
        backlinks: Vec<(RelPath, String)>,
    ) -> AppResult<Vec<RelPath>> {
        let mut by_note: BTreeMap<RelPath, Vec<(String, String)>> = BTreeMap::new();
        for (source, target) in backlinks {
            let replacement = if target.contains('/') {
                to.as_str()
                    .strip_suffix(&format!(".{}", paths::NOTE_EXTENSION))
                    .unwrap_or(to.as_str())
                    .to_owned()
            } else if to.title() != from.title() {
                to.title().to_owned()
            } else {
                continue;
            };
            let source = if source == *from { to.clone() } else { source };
            by_note
                .entry(source)
                .or_default()
                .push((target, replacement));
        }
        let mut changed = Vec::new();
        for (source, rewrites) in by_note {
            let current = self.read(&source)?;
            let mut text = current.text.clone();
            for (target, replacement) in &rewrites {
                text = rewrite_links(&text, target, replacement);
            }
            if text != current.text {
                self.write(&source, &text, &current.hash)?;
                changed.push(source);
            }
        }
        Ok(changed)
    }

    /// Changes one task's line (docs/vault-format.md §6, "Task commands"). The line is the one
    /// at `task.line` when the file still has `task.file_hash`; otherwise the only line whose
    /// text is still `task.line_text`. Anything else is a `conflict`. The file keeps its line
    /// endings and byte-order mark; only that line changes.
    pub fn edit_task(
        &self,
        path: &RelPath,
        task: &TaskRef,
        change: &tasks::TaskChange,
    ) -> AppResult<NoteFile> {
        let guard = self.lock_writes()?;
        let bytes = read_note(&self.root, path)?;
        let raw = std::str::from_utf8(&bytes)
            .map_err(|_| AppError::validation("this note is not UTF-8 text"))?;
        let (bom, body) = match raw.strip_prefix('\u{feff}') {
            Some(body) => ("\u{feff}", body),
            None => ("", raw),
        };
        let lines: Vec<&str> = body.split_inclusive('\n').collect();
        let content = |line: &str| line.trim_end_matches('\n').trim_end_matches('\r').len();
        let same = |i: &usize| {
            lines
                .get(*i)
                .is_some_and(|l| l[..content(l)] == task.line_text)
        };
        let index = if files::hash(&bytes) == task.file_hash {
            usize::try_from(task.line)
                .ok()
                .and_then(|n| n.checked_sub(1))
                .filter(same)
        } else {
            let mut matches = (0..lines.len()).filter(same);
            matches.next().filter(|_| matches.next().is_none())
        }
        .ok_or(AppError::Conflict { entity: "task" })?;
        let found = parse::parse(&files::decode(&bytes)?.text)
            .tasks
            .into_iter()
            .find(|t| usize::try_from(t.line).ok() == Some(index + 1))
            .ok_or_else(|| AppError::validation("that line is not a task"))?;
        let old = lines[index];
        let changed = tasks::apply(&old[..content(old)], found.box_at, change)?;
        let mut out = String::with_capacity(raw.len() + 16);
        out.push_str(bom);
        for (i, line) in lines.iter().enumerate() {
            if i == index {
                out.push_str(&changed);
                out.push_str(&line[content(line)..]);
            } else {
                out.push_str(line);
            }
        }
        files::write_atomic(&path.to_fs(&self.root), out.as_bytes())?;
        drop(guard);
        self.refresh_note(path)?;
        self.read(path)
    }

    /// Quick Capture (docs/vault-format.md §5): appends `entry` to the `Inbox.md` of `space` (a
    /// top-level folder; the vault root when `None`), creating the file on the first capture.
    /// A task goes directly under a task list that ends the file; anything else after a blank
    /// line. The file keeps its line endings and byte-order mark.
    pub fn capture(&self, space: Option<&str>, entry: &InboxEntry) -> AppResult<NoteFile> {
        let folder = space.map(RelPath::parse).transpose()?;
        if folder.as_ref().is_some_and(|f| f.parent().is_some()) {
            return Err(AppError::validation("captures go to a space"));
        }
        let block = entry.render()?;
        let path = child(folder.as_ref(), &note_file_name(INBOX_TITLE))?;
        let guard = self.lock_writes()?;
        self.existing_folder(folder.as_ref())?;
        let abs = path.to_fs(&self.root);
        let current = match fs::read(&abs) {
            Ok(bytes) => files::decode(&bytes)?,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => files::Decoded {
                text: String::new(),
                bom: false,
                crlf: false,
            },
            Err(error) => return Err(error.into()),
        };
        let text = append_block(
            &current.text,
            &block,
            matches!(entry, InboxEntry::Task { .. }),
        );
        files::write_atomic(&abs, &files::encode(&text, current.bom, current.crlf))?;
        drop(guard);
        self.refresh_note(&path)?;
        self.read(&path)
    }

    /// "Create sticky from selection" (docs/vault-format.md §5): a new note titled `title` in
    /// `<space>/Stickies/` (the folder is created when missing) with `text`, a blank line and a
    /// link back to `source`.
    pub fn create_sticky_note(
        &self,
        source: &RelPath,
        title: &str,
        text: &str,
    ) -> AppResult<NoteFile> {
        let text = text.trim();
        if text.is_empty() {
            return Err(AppError::validation("select some text first"));
        }
        let folder = child(
            source.space().map(RelPath::parse).transpose()?.as_ref(),
            STICKIES_FOLDER,
        )?;
        fs::create_dir_all(folder.to_fs(&self.root))?;
        let body = format!("{text}\n\nFrom [[{}]]\n", source.title());
        self.create_note(Some(&folder), title, &body)
    }

    /// Moves a note or folder to `.piw/trash/<id>/<path>`.
    pub fn trash(&self, path: &RelPath) -> AppResult<TrashEntry> {
        let guard = self.lock_writes()?;
        let source = path.to_fs(&self.root);
        if fs::symlink_metadata(&source).is_err() {
            return Err(AppError::NotFound { entity: "note" });
        }
        let trash = self.trash_root();
        fs::create_dir_all(&trash)?;
        let stamp = Utc::now().format("%Y%m%dT%H%M%S").to_string();
        let mut id = stamp.clone();
        let mut n = 2;
        while trash.join(&id).exists() {
            id = format!("{stamp}-{n}");
            n += 1;
        }
        let dir = trash.join(&id);
        let target = path.to_fs(&dir);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(dir.join(ORIGINAL_FILE), path.as_str())?;
        fs::rename(&source, &target)?;
        drop(guard);
        self.refresh(std::slice::from_ref(path))?;
        Ok(TrashEntry {
            id,
            path: path.clone(),
        })
    }

    /// Everything in the trash, newest first.
    pub fn trash_entries(&self) -> AppResult<Vec<TrashEntry>> {
        let trash = self.trash_root();
        let Ok(dirs) = fs::read_dir(&trash) else {
            return Ok(Vec::new());
        };
        let mut entries = Vec::new();
        for dir in dirs.filter_map(Result::ok) {
            let id = dir.file_name().to_string_lossy().into_owned();
            if let Ok(original) = fs::read_to_string(dir.path().join(ORIGINAL_FILE))
                && let Ok(path) = RelPath::parse(&original)
                && fs::symlink_metadata(path.to_fs(&dir.path())).is_ok()
            {
                entries.push(TrashEntry { id, path });
            }
        }
        entries.sort_by(|a, b| b.id.cmp(&a.id));
        Ok(entries)
    }

    /// Puts a trashed item back where it was, recreating missing folders. When that name is
    /// taken now, the item gets a free one (` 2`…). Returns where it went.
    pub fn restore(&self, id: &str) -> AppResult<RelPath> {
        let guard = self.lock_writes()?;
        let dir = self.trash_dir(id)?;
        let original = RelPath::parse(&fs::read_to_string(dir.join(ORIGINAL_FILE))?)?;
        let item = original.to_fs(&dir);
        let parent = original.parent();
        let parent_dir = parent
            .as_ref()
            .map_or_else(|| self.root.clone(), |p| p.to_fs(&self.root));
        fs::create_dir_all(&parent_dir)?;
        let note = original.is_note();
        let name = if taken_names(&parent_dir)?.contains(&name_key(original.name())) {
            free_name(
                &parent_dir,
                if note {
                    original.title()
                } else {
                    original.name()
                },
                note,
            )?
        } else {
            original.name().to_owned()
        };
        let target = child(parent.as_ref(), &name)?;
        fs::rename(&item, target.to_fs(&self.root))?;
        fs::remove_dir_all(&dir)?;
        drop(guard);
        if note {
            self.refresh(std::slice::from_ref(&target))?;
        } else {
            self.sync()?;
        }
        Ok(target)
    }

    /// Deletes a trashed item for good.
    pub fn purge(&self, id: &str) -> AppResult<()> {
        let _guard = self.lock_writes()?;
        fs::remove_dir_all(self.trash_dir(id)?)?;
        Ok(())
    }

    fn trash_dir(&self, id: &str) -> AppResult<PathBuf> {
        let valid = !id.is_empty() && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-');
        let dir = self.trash_root().join(id);
        if !valid || !dir.join(ORIGINAL_FILE).is_file() {
            return Err(AppError::NotFound {
                entity: "trash item",
            });
        }
        Ok(dir)
    }

    fn existing_folder(&self, folder: Option<&RelPath>) -> AppResult<PathBuf> {
        let dir = folder.map_or_else(|| self.root.clone(), |f| f.to_fs(&self.root));
        if !dir.is_dir() {
            return Err(AppError::NotFound { entity: "folder" });
        }
        Ok(dir)
    }
}

fn read_note(root: &Path, path: &RelPath) -> AppResult<Vec<u8>> {
    if !path.is_note() {
        return Err(AppError::validation("only .md files are notes"));
    }
    fs::read(path.to_fs(root)).map_err(|error| match error.kind() {
        std::io::ErrorKind::NotFound => AppError::NotFound { entity: "note" },
        _ => error.into(),
    })
}

fn child(parent: Option<&RelPath>, name: &str) -> AppResult<RelPath> {
    match parent {
        Some(parent) => parent.join(name),
        None => RelPath::parse(name),
    }
}

fn name_taken() -> AppError {
    AppError::validation("a note or folder with that name already exists here")
}

/// The names in `dir`, compared as [`name_key`] does.
fn taken_names(dir: &Path) -> AppResult<HashSet<String>> {
    Ok(fs::read_dir(dir)?
        .filter_map(Result::ok)
        .map(|e| name_key(&e.file_name().to_string_lossy()))
        .collect())
}

/// `stem` (a note's title or a folder's name), then `stem 2`, `stem 3`…, whichever is free.
fn free_name(dir: &Path, stem: &str, note: bool) -> AppResult<String> {
    let taken = taken_names(dir)?;
    let mut n = 1;
    loop {
        let candidate = if n == 1 {
            stem.to_owned()
        } else {
            format!("{stem} {n}")
        };
        let name = if note {
            note_file_name(&candidate)
        } else {
            candidate
        };
        if !taken.contains(&name_key(&name)) {
            return Ok(name);
        }
        n += 1;
    }
}

/// Replaces `[[target` with `[[replacement` wherever the link continues with `]]`, `|` or `#`.
/// The target is compared ignoring case, as links resolve.
fn rewrite_links(text: &str, target: &str, replacement: &str) -> String {
    let wanted = target.to_lowercase();
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(at) = rest.find("[[") {
        out.push_str(&rest[..at + 2]);
        rest = &rest[at + 2..];
        if let Some(candidate) = rest.get(..target.len())
            && candidate.to_lowercase() == wanted
            && rest[target.len()..].starts_with([']', '|', '#'])
        {
            out.push_str(replacement);
            rest = &rest[target.len()..];
        }
    }
    out.push_str(rest);
    out
}
