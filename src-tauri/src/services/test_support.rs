//! Helpers for service tests: a migrated in-memory database with the default spaces.

use crate::storage::Database;

pub fn db() -> Database {
    let db = Database::open_in_memory().expect("in-memory database");
    db.write(super::spaces::ensure_seeded).expect("seed spaces");
    db
}

pub fn space_named(db: &Database, name: &str) -> String {
    db.read(super::spaces::list)
        .unwrap()
        .into_iter()
        .find(|s| s.name == name)
        .map(|s| s.id)
        .expect("space exists")
}
