//! Helpers for service tests.

use crate::storage::Database;

/// A migrated in-memory database.
pub fn db() -> Database {
    Database::open_in_memory().expect("in-memory database")
}
