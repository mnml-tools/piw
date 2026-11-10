//! File-system primitives of the vault: scanning, hashing, decoding and atomic writes. Nothing
//! here knows about the index.

use std::fs;
use std::io::Write;
use std::path::Path;
use std::time::UNIX_EPOCH;

use sha2::{Digest, Sha256};

use super::paths::{RelPath, is_note_name};
use crate::error::{AppError, AppResult};

const BOM: &str = "\u{feff}";

/// What the index compares to decide whether a file must be read again.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FileStat {
    pub size: i64,
    pub mtime_ns: i64,
}

pub fn stat(path: &Path) -> std::io::Result<FileStat> {
    let meta = fs::metadata(path)?;
    let mtime_ns = meta
        .modified()?
        .duration_since(UNIX_EPOCH)
        .map(|d| i64::try_from(d.as_nanos()).unwrap_or(i64::MAX))
        .unwrap_or(0);
    Ok(FileStat {
        size: i64::try_from(meta.len()).unwrap_or(i64::MAX),
        mtime_ns,
    })
}

/// SHA-256 of the bytes on disk, in lowercase hex: the conflict guard of every write.
pub fn hash(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    let mut out = String::with_capacity(64);
    for byte in digest {
        out.push(char::from_digit(u32::from(byte >> 4), 16).unwrap_or('0'));
        out.push(char::from_digit(u32::from(byte & 0xf), 16).unwrap_or('0'));
    }
    out
}

/// A note's text as the editor sees it (LF, no byte-order mark), and how the file spelled it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Decoded {
    pub text: String,
    pub bom: bool,
    pub crlf: bool,
}

pub fn decode(bytes: &[u8]) -> AppResult<Decoded> {
    let raw = std::str::from_utf8(bytes)
        .map_err(|_| AppError::validation("this note is not UTF-8 text"))?;
    let (bom, raw) = match raw.strip_prefix(BOM) {
        Some(rest) => (true, rest),
        None => (false, raw),
    };
    let crlf = raw.contains("\r\n");
    let text = if crlf {
        raw.replace("\r\n", "\n")
    } else {
        raw.to_owned()
    };
    Ok(Decoded { text, bom, crlf })
}

/// The bytes to write for `text` in a file that uses `bom` and `crlf`.
pub fn encode(text: &str, bom: bool, crlf: bool) -> Vec<u8> {
    let text = text.replace("\r\n", "\n");
    let mut out = String::with_capacity(text.len() + 3);
    if bom {
        out.push_str(BOM);
    }
    if crlf {
        out.push_str(&text.replace('\n', "\r\n"));
    } else {
        out.push_str(&text);
    }
    out.into_bytes()
}

/// Writes `bytes` to a hidden temporary file next to `path`, flushes it, then renames it over
/// `path`, so a crash leaves either the old file or the new one.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> AppResult<()> {
    let dir = path
        .parent()
        .ok_or_else(|| AppError::Internal("a note path has no folder".into()))?;
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let temp = dir.join(format!(".{name}.{}.piw-tmp", crate::domain::new_id()));
    let result = (|| {
        let mut file = fs::File::create(&temp)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        fs::rename(&temp, path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result.map_err(AppError::from)
}

/// Every visible note and folder under `root`. Symbolic links are not followed.
#[derive(Debug, Default)]
pub struct Scan {
    pub notes: Vec<(RelPath, FileStat)>,
    pub folders: Vec<RelPath>,
    /// Entries skipped because their names are not valid Unicode or not allowed in a path.
    pub skipped: usize,
}

pub fn scan(root: &Path) -> AppResult<Scan> {
    let mut scan = Scan::default();
    scan_dir(root, root, &mut scan)?;
    Ok(scan)
}

fn scan_dir(root: &Path, dir: &Path, scan: &mut Scan) -> AppResult<()> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let name = entry.file_name();
        if name.to_string_lossy().starts_with('.') {
            continue;
        }
        let path = entry.path();
        let Some(rel) = RelPath::from_fs(root, &path) else {
            scan.skipped += 1;
            continue;
        };
        let kind = entry.file_type()?;
        if kind.is_dir() {
            scan.folders.push(rel);
            scan_dir(root, &path, scan)?;
        } else if kind.is_file() && is_note_name(rel.name()) {
            scan.notes.push((rel, stat(&path)?));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decode_and_encode_keep_the_file_spelling() {
        let bytes = "\u{feff}a\r\nb\r\n".as_bytes();
        let decoded = decode(bytes).unwrap();
        assert_eq!(
            decoded,
            Decoded {
                text: "a\nb\n".into(),
                bom: true,
                crlf: true
            }
        );
        assert_eq!(encode(&decoded.text, true, true), bytes);
        assert_eq!(encode("a\nb", false, false), b"a\nb");
        assert!(decode(&[0xff, 0xfe]).is_err());
    }

    #[test]
    fn hash_is_sha256_hex() {
        assert_eq!(
            hash(b""),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }

    #[test]
    fn write_atomic_replaces_the_file_and_leaves_no_temporary() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("a.md");
        fs::write(&path, "old").unwrap();
        write_atomic(&path, b"new").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "new");
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
    }
}
