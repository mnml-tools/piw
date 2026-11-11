//! Keeps the index in step with changes made outside Piw (another editor, Syncthing).
//!
//! Events are collected until the folder has been quiet for a moment, then the touched notes are
//! re-read. Piw's own writes come through here too and change nothing, because the index already
//! has their hash. Hidden paths (`.piw`, temporary files) are ignored.

use std::collections::BTreeSet;
use std::sync::Arc;
use std::sync::mpsc::{Receiver, RecvTimeoutError, channel};
use std::time::{Duration, Instant};

use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};

use super::paths::RelPath;
use super::{SyncReport, Vault};
use crate::error::{AppError, AppResult};

/// How long the folder must be quiet before a batch is applied.
const SETTLE: Duration = Duration::from_millis(150);
/// A batch is applied at the latest after this long, even if events keep coming.
const MAX_BATCH: Duration = Duration::from_secs(2);

/// Stops watching when dropped.
pub struct VaultWatcher {
    _watcher: RecommendedWatcher,
}

/// Watches `vault` and calls `on_change` with each batch that changed the index.
pub fn watch(
    vault: Arc<Vault>,
    on_change: impl Fn(SyncReport) + Send + 'static,
) -> AppResult<VaultWatcher> {
    let unavailable = |error: notify::Error| {
        AppError::Platform(format!("cannot watch the vault for changes: {error}"))
    };
    let (sender, events) = channel();
    let mut watcher = notify::recommended_watcher(sender).map_err(unavailable)?;
    watcher
        .watch(vault.root(), RecursiveMode::Recursive)
        .map_err(unavailable)?;
    std::thread::Builder::new()
        .name("vault-watcher".into())
        .spawn(move || run(&vault, &events, &on_change))
        .map_err(|e| AppError::Platform(format!("cannot start the vault watcher: {e}")))?;
    Ok(VaultWatcher { _watcher: watcher })
}

/// Runs until the watcher is dropped (its sender closes the channel).
fn run(vault: &Vault, events: &Receiver<notify::Result<Event>>, on_change: &dyn Fn(SyncReport)) {
    while let Ok(first) = events.recv() {
        let mut batch = Batch::default();
        batch.add(vault, first);
        let started = Instant::now();
        let mut closed = false;
        while started.elapsed() < MAX_BATCH {
            match events.recv_timeout(SETTLE) {
                Ok(event) => batch.add(vault, event),
                Err(RecvTimeoutError::Timeout) => break,
                Err(RecvTimeoutError::Disconnected) => {
                    closed = true;
                    break;
                }
            }
        }
        let paths: Vec<RelPath> = batch.paths.into_iter().collect();
        let result = if batch.rescan {
            vault.sync()
        } else {
            vault.refresh(&paths)
        };
        match result {
            Ok(report) if !report.is_empty() => on_change(report),
            Ok(_) => {}
            Err(error) => log::warn!("vault watcher: refresh failed ({:?})", error.code()),
        }
        if closed {
            break;
        }
    }
}

#[derive(Default)]
struct Batch {
    paths: BTreeSet<RelPath>,
    /// The watcher lost events or failed: compare the whole vault instead.
    rescan: bool,
}

impl Batch {
    fn add(&mut self, vault: &Vault, event: notify::Result<Event>) {
        let event = match event {
            Ok(event) => event,
            Err(_) => {
                self.rescan = true;
                return;
            }
        };
        if event.need_rescan() {
            self.rescan = true;
        }
        if matches!(event.kind, EventKind::Access(_)) {
            return;
        }
        self.paths.extend(
            event
                .paths
                .iter()
                .filter_map(|path| RelPath::from_fs(vault.root(), path)),
        );
    }
}
