//! Application error type shared by services and Tauri commands.
//!
//! Errors are serialised to the UI as `{ code, message }`. Messages never include note or
//! task content so they are safe to show and to log.

use serde::Serialize;
use ts_rs::TS;

/// Stable, machine-readable error category exposed to the UI.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export, export_to = "bindings/")]
pub enum ErrorCode {
    NotFound,
    Validation,
    Conflict,
    Storage,
    Platform,
    Internal,
}

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{entity} not found")]
    NotFound { entity: &'static str },
    #[error("{0}")]
    Validation(String),
    #[error("{entity} was changed elsewhere; reload and try again")]
    Conflict { entity: &'static str },
    #[error("storage error: {0}")]
    Storage(String),
    #[error("{0}")]
    Platform(String),
    #[error("internal error: {0}")]
    Internal(String),
}

impl AppError {
    pub fn code(&self) -> ErrorCode {
        match self {
            Self::NotFound { .. } => ErrorCode::NotFound,
            Self::Validation(_) => ErrorCode::Validation,
            Self::Conflict { .. } => ErrorCode::Conflict,
            Self::Storage(_) => ErrorCode::Storage,
            Self::Platform(_) => ErrorCode::Platform,
            Self::Internal(_) => ErrorCode::Internal,
        }
    }

    pub fn validation(message: impl Into<String>) -> Self {
        Self::Validation(message.into())
    }
}

impl From<tauri::Error> for AppError {
    fn from(error: tauri::Error) -> Self {
        Self::Platform(error.to_string())
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(error: rusqlite::Error) -> Self {
        match error {
            rusqlite::Error::QueryReturnedNoRows => Self::NotFound { entity: "record" },
            other => Self::Storage(other.to_string()),
        }
    }
}

impl From<std::io::Error> for AppError {
    fn from(error: std::io::Error) -> Self {
        Self::Storage(error.to_string())
    }
}

/// Wire format of an error as seen by the UI.
#[derive(Debug, Serialize, TS)]
#[ts(export, export_to = "bindings/", rename = "AppError")]
pub struct ErrorPayload {
    pub code: ErrorCode,
    pub message: String,
}

impl Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        ErrorPayload {
            code: self.code(),
            message: self.to_string(),
        }
        .serialize(serializer)
    }
}

pub type AppResult<T> = Result<T, AppError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serialises_as_code_and_message() {
        let json = serde_json::to_value(AppError::Conflict { entity: "note" }).unwrap();
        assert_eq!(json["code"], "conflict");
        assert_eq!(
            json["message"],
            "note was changed elsewhere; reload and try again"
        );
    }

    #[test]
    fn missing_row_maps_to_not_found() {
        let error: AppError = rusqlite::Error::QueryReturnedNoRows.into();
        assert_eq!(error.code(), ErrorCode::NotFound);
    }
}
