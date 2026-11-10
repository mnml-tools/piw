//! Small shared types (TypeScript bindings via ts-rs).

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Named colours of stickies (tokens `--sticky-<name>-*`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export, export_to = "bindings/")]
pub enum ColorName {
    Yellow,
    Peach,
    Rose,
    Mint,
    Sky,
    Lavender,
}

impl ColorName {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Yellow => "yellow",
            Self::Peach => "peach",
            Self::Rose => "rose",
            Self::Mint => "mint",
            Self::Sky => "sky",
            Self::Lavender => "lavender",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "yellow" => Some(Self::Yellow),
            "peach" => Some(Self::Peach),
            "rose" => Some(Self::Rose),
            "mint" => Some(Self::Mint),
            "sky" => Some(Self::Sky),
            "lavender" => Some(Self::Lavender),
            _ => None,
        }
    }
}

impl rusqlite::types::FromSql for ColorName {
    fn column_result(value: rusqlite::types::ValueRef<'_>) -> rusqlite::types::FromSqlResult<Self> {
        let text = value.as_str()?;
        Self::parse(text).ok_or_else(|| {
            rusqlite::types::FromSqlError::Other(format!("unexpected colour: {text}").into())
        })
    }
}

impl rusqlite::types::ToSql for ColorName {
    fn to_sql(&self) -> rusqlite::Result<rusqlite::types::ToSqlOutput<'_>> {
        Ok(self.as_str().into())
    }
}
