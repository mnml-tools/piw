//! Services over the app's own database: preferences, the Quick Capture draft and sticky
//! windows (device state; the notes live in the vault, `crate::vault`). Each write runs inside the
//! caller's transaction and returns the [`ChangeSet`](crate::domain::change::ChangeSet) to
//! broadcast after commit.

pub mod drafts;
pub mod settings;
pub mod stickies;
pub mod vault_stickies;

#[cfg(test)]
pub(crate) mod test_support;
