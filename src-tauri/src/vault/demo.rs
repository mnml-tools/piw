//! The demo vault (`PIW_DEMO=1`, `pnpm demo`): the notes in `fixtures/demo/`, with their dates
//! moved to today, and two stickies on the desktop. The browser preview shows the same notes
//! (`src/dev/mock-vault.ts`).

use std::fs;
use std::path::Path;

use chrono::{Days, NaiveDate};

use crate::domain::model::ColorName;
use crate::domain::time::format_date;
use crate::error::AppResult;

macro_rules! demo_files {
    ($($path:literal),* $(,)?) => {
        &[$(($path, include_str!(concat!("../../../fixtures/demo/", $path)))),*]
    };
}

/// Every note of the demo, by vault path.
pub const FILES: &[(&str, &str)] = demo_files![
    "Welcome.md",
    "Work/Inbox.md",
    "Work/Weekly sync.md",
    "Work/Projects/Refactor 2FA.md",
    "Work/Projects/Onboarding.md",
    "Work/Projects/Website launch.md",
    "Work/Projects/Mobile app.md",
    "Work/Design/Design principles.md",
    "Work/Design/Colour tokens.md",
    "Work/Meetings/Design review.md",
    "Work/Meetings/1-1 with John.md",
    "Work/Stickies/Release checklist.md",
    "Personal/Inbox.md",
    "Personal/Trip to Lisbon.md",
    "Personal/Gift ideas.md",
    "Personal/Reading list.md",
    "Personal/Recipes/Pastéis de nata.md",
    "Personal/Home/Moving checklist.md",
];

/// What the demo puts on the desktop.
pub enum DemoSticky {
    Note {
        path: &'static str,
        color: ColorName,
    },
    Tasks {
        view: &'static str,
        color: ColorName,
    },
}

pub const STICKIES: &[DemoSticky] = &[
    DemoSticky::Note {
        path: "Work/Stickies/Release checklist.md",
        color: ColorName::Yellow,
    },
    DemoSticky::Tasks {
        view: "today",
        color: ColorName::Mint,
    },
];

/// `{{today}}`, `{{today+3}}` and `{{today-2}}` as dates around `today`.
pub fn expand(text: &str, today: NaiveDate) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(start) = rest.find("{{today") {
        out.push_str(&rest[..start]);
        let after = &rest[start + "{{today".len()..];
        let Some(end) = after.find("}}") else {
            out.push_str(&rest[start..]);
            return out;
        };
        let offset = &after[..end];
        let date = match offset.split_at_checked(1) {
            None => Some(today),
            Some(("+", n)) => n
                .parse()
                .ok()
                .and_then(|n| today.checked_add_days(Days::new(n))),
            Some(("-", n)) => n
                .parse()
                .ok()
                .and_then(|n| today.checked_sub_days(Days::new(n))),
            Some(_) => None,
        };
        match date {
            Some(date) => out.push_str(&format_date(date)),
            None => out.push_str(&rest[start..start + "{{today".len() + end + 2]),
        }
        rest = &after[end + 2..];
    }
    out.push_str(rest);
    out
}

/// Writes the demo notes into `root`, which must hold no notes yet (the caller checks).
pub fn write(root: &Path, today: NaiveDate) -> AppResult<()> {
    for (path, text) in FILES {
        let file = root.join(path);
        if let Some(folder) = file.parent() {
            fs::create_dir_all(folder)?;
        }
        if !file.exists() {
            fs::write(&file, expand(text, today))?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn day(s: &str) -> NaiveDate {
        NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
    }

    #[test]
    fn dates_move_to_today() {
        let today = day("2026-11-10");
        assert_eq!(
            expand(
                "a {{today}} b {{today+3}} c {{today-12}} {{today*2}} {{today",
                today
            ),
            "a 2026-11-10 b 2026-11-13 c 2026-10-29 {{today*2}} {{today"
        );
    }

    #[test]
    fn lists_every_file_of_the_fixture() {
        fn walk(dir: &Path, base: &Path, out: &mut Vec<String>) {
            for entry in fs::read_dir(dir).unwrap() {
                let path = entry.unwrap().path();
                if path.is_dir() {
                    walk(&path, base, out);
                } else {
                    let rel = path.strip_prefix(base).unwrap();
                    out.push(rel.to_string_lossy().replace('\\', "/"));
                }
            }
        }
        let base = Path::new(env!("CARGO_MANIFEST_DIR")).join("../fixtures/demo");
        let mut on_disk = Vec::new();
        walk(&base, &base, &mut on_disk);
        on_disk.sort();
        let mut listed: Vec<String> = FILES.iter().map(|(p, _)| (*p).to_owned()).collect();
        listed.sort();
        assert_eq!(listed, on_disk);
        for sticky in STICKIES {
            if let DemoSticky::Note { path, .. } = sticky {
                assert!(
                    listed.iter().any(|p| p == path),
                    "{path} is not a demo note"
                );
            }
        }
    }

    #[test]
    fn seeds_a_vault_with_tasks_and_no_tokens_left() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("vault");
        write(&root, day("2026-11-10")).unwrap();
        let vault = crate::vault::Vault::open(&root, &dir.path().join("data")).unwrap();
        vault.sync().unwrap();
        let notes = vault.index().notes().unwrap();
        assert_eq!(notes.len(), FILES.len());
        assert!(notes.iter().map(|n| n.tasks_open).sum::<i64>() > 20);
        for (path, _) in FILES {
            assert!(!fs::read_to_string(root.join(path)).unwrap().contains("{{"));
        }
    }
}
