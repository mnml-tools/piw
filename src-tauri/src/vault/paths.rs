//! Vault-relative paths (docs/vault-format.md §1–2).
//!
//! A [`RelPath`] is `/`-separated, in Unicode NFC, and can never leave the vault or point into a
//! hidden folder. Files already on disk are accepted with any name the OS allows
//! ([`RelPath::parse`]); names Piw creates must also pass [`validate_name`].

use std::fmt;
use std::path::{Component, Path, PathBuf};

use unicode_normalization::UnicodeNormalization;

use crate::error::{AppError, AppResult};

/// Extension of a note file, compared case-insensitively.
pub const NOTE_EXTENSION: &str = "md";
/// Longest name Piw creates, in characters, without the extension.
pub const MAX_NAME_CHARS: usize = 120;

const FORBIDDEN: &[char] = &['/', '\\', ':', '*', '?', '"', '<', '>', '|'];
const RESERVED: &[&str] = &[
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct RelPath(String);

impl RelPath {
    /// Accepts any path to a visible entry inside the vault: no empty, `.` or `..` segment, no
    /// segment starting with `.`, no backslash or control character. The result is NFC.
    pub fn parse(value: &str) -> AppResult<Self> {
        let value: String = value.nfc().collect();
        if value.is_empty() || value.split('/').any(|segment| !is_visible_segment(segment)) {
            return Err(AppError::validation("that path is not inside the vault"));
        }
        Ok(Self(value))
    }

    /// A path read back from the index, which only ever stores parsed paths.
    pub(super) fn trusted(value: String) -> Self {
        Self(value)
    }

    /// The vault-relative path of `abs`, or `None` if it is outside `root`, hidden, or not
    /// valid Unicode.
    pub fn from_fs(root: &Path, abs: &Path) -> Option<Self> {
        let relative = abs.strip_prefix(root).ok()?;
        let mut segments = Vec::new();
        for component in relative.components() {
            match component {
                Component::Normal(name) => segments.push(name.to_str()?),
                _ => return None,
            }
        }
        Self::parse(&segments.join("/")).ok()
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// The path on disk under `root`.
    pub fn to_fs(&self, root: &Path) -> PathBuf {
        let mut path = root.to_path_buf();
        path.extend(self.0.split('/'));
        path
    }

    /// The last segment.
    pub fn name(&self) -> &str {
        self.0.rsplit('/').next().unwrap_or(&self.0)
    }

    pub fn parent(&self) -> Option<Self> {
        self.0
            .rsplit_once('/')
            .map(|(parent, _)| Self(parent.to_owned()))
    }

    /// `self/name`, with `name` validated as one segment.
    pub fn join(&self, name: &str) -> AppResult<Self> {
        Self::parse(&format!("{}/{name}", self.0))
    }

    pub fn is_note(&self) -> bool {
        is_note_name(self.name())
    }

    /// The space a note belongs to: its first segment, when it is inside a folder.
    pub fn space(&self) -> Option<&str> {
        self.0.split_once('/').map(|(space, _)| space)
    }

    /// A note's title: its file name without the extension.
    pub fn title(&self) -> &str {
        let name = self.name();
        match name.rsplit_once('.') {
            Some((stem, ext)) if ext.eq_ignore_ascii_case(NOTE_EXTENSION) => stem,
            _ => name,
        }
    }

    /// The path without the note extension, lowercased: how links name a note by its path.
    pub fn link_key(&self) -> String {
        let path = &self.0;
        let stem = match path.rsplit_once('.') {
            Some((stem, ext)) if ext.eq_ignore_ascii_case(NOTE_EXTENSION) => stem,
            _ => path,
        };
        stem.to_lowercase()
    }

    /// True when `self` is `other` or inside it.
    pub fn starts_with(&self, other: &RelPath) -> bool {
        self.0 == other.0
            || self
                .0
                .strip_prefix(&other.0)
                .is_some_and(|rest| rest.starts_with('/'))
    }
}

impl fmt::Display for RelPath {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

fn is_visible_segment(segment: &str) -> bool {
    !segment.is_empty()
        && !segment.starts_with('.')
        && !segment.contains('\\')
        && !segment.chars().any(char::is_control)
}

pub fn is_note_name(name: &str) -> bool {
    name.rsplit_once('.')
        .is_some_and(|(stem, ext)| !stem.is_empty() && ext.eq_ignore_ascii_case(NOTE_EXTENSION))
}

/// Checks a note title or folder name that Piw is about to create (docs/vault-format.md §2).
pub fn validate_name(name: &str) -> AppResult<()> {
    let count = name.chars().count();
    if count == 0 {
        return Err(AppError::validation("enter a name"));
    }
    if count > MAX_NAME_CHARS {
        return Err(AppError::validation(format!(
            "names can have at most {MAX_NAME_CHARS} characters"
        )));
    }
    if name.contains(FORBIDDEN) || name.chars().any(char::is_control) {
        return Err(AppError::validation(
            "names cannot contain / \\ : * ? \" < > | or control characters",
        ));
    }
    if name.starts_with(['.', ' ']) || name.ends_with(['.', ' ']) {
        return Err(AppError::validation(
            "names cannot start with a dot or a space, or end with one",
        ));
    }
    let base = name.split('.').next().unwrap_or(name);
    if RESERVED
        .iter()
        .any(|reserved| base.eq_ignore_ascii_case(reserved))
    {
        return Err(AppError::validation("that name is reserved by Windows"));
    }
    Ok(())
}

/// The file name of a note titled `title`.
pub fn note_file_name(title: &str) -> String {
    format!("{title}.{NOTE_EXTENSION}")
}

/// How two names in one folder are compared: case-insensitive, in NFC.
pub fn name_key(name: &str) -> String {
    name.nfc().collect::<String>().to_lowercase()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_keeps_paths_inside_the_vault() {
        for bad in [
            "",
            "/abs.md",
            "a//b.md",
            "../x.md",
            "a/../x.md",
            "./x.md",
            ".piw/index.md",
            "Work/.hidden.md",
            "a\\..\\b.md",
            "tab\there.md",
        ] {
            assert!(RelPath::parse(bad).is_err(), "{bad:?} should be refused");
        }
        let path = RelPath::parse("Work/Projects/Refactor 2FA.md").unwrap();
        assert_eq!(path.space(), Some("Work"));
        assert_eq!(path.title(), "Refactor 2FA");
        assert_eq!(path.parent().unwrap().as_str(), "Work/Projects");
        assert!(path.is_note());
        assert_eq!(path.link_key(), "work/projects/refactor 2fa");
        assert_eq!(RelPath::parse("Loose.md").unwrap().space(), None);
    }

    #[test]
    fn parse_normalises_to_nfc() {
        let decomposed = RelPath::parse("Work/Reunio\u{0303}es.md").unwrap();
        assert_eq!(decomposed.as_str(), "Work/Reuniões.md");
        assert_eq!(name_key("REUNIO\u{0303}ES.md"), "reuniões.md");
    }

    #[test]
    fn from_fs_skips_hidden_and_outside_paths() {
        let root = Path::new("/vault");
        assert_eq!(
            RelPath::from_fs(root, Path::new("/vault/Work/a.md"))
                .unwrap()
                .as_str(),
            "Work/a.md"
        );
        assert!(RelPath::from_fs(root, Path::new("/vault/.piw/trash/a.md")).is_none());
        assert!(RelPath::from_fs(root, Path::new("/elsewhere/a.md")).is_none());
        assert!(RelPath::from_fs(root, Path::new("/vault")).is_none());
    }

    #[test]
    fn starts_with_matches_whole_segments() {
        let folder = RelPath::parse("Work/Projects").unwrap();
        assert!(
            RelPath::parse("Work/Projects/a.md")
                .unwrap()
                .starts_with(&folder)
        );
        assert!(folder.starts_with(&folder));
        assert!(
            !RelPath::parse("Work/Projects 2/a.md")
                .unwrap()
                .starts_with(&folder)
        );
    }

    #[test]
    fn validate_name_follows_the_format() {
        assert!(validate_name("Refactor 2FA").is_ok());
        assert!(validate_name("Reuniões").is_ok());
        for bad in [
            "",
            "a/b",
            "a:b",
            "why?",
            ".hidden",
            " padded",
            "trailing.",
            "CON",
            "nul.txt",
        ] {
            assert!(validate_name(bad).is_err(), "{bad:?} should be refused");
        }
        assert!(validate_name(&"x".repeat(MAX_NAME_CHARS)).is_ok());
        assert!(validate_name(&"x".repeat(MAX_NAME_CHARS + 1)).is_err());
    }
}
