//! Timestamps and calendar dates.

use chrono::{NaiveDate, SecondsFormat, Utc};

use crate::error::{AppError, AppResult};

/// Current UTC time as stored in the database (`2026-11-06T12:00:00.000Z`).
pub fn now() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

/// Validates a due date (`YYYY-MM-DD`).
pub fn parse_date(value: &str) -> AppResult<NaiveDate> {
    NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .ok()
        .filter(|d| d.format("%Y-%m-%d").to_string() == value)
        .ok_or_else(|| AppError::validation("dates must use the YYYY-MM-DD format"))
}

pub fn format_date(date: NaiveDate) -> String {
    date.format("%Y-%m-%d").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn timestamps_sort_chronologically_as_text() {
        let a = now();
        std::thread::sleep(std::time::Duration::from_millis(2));
        let b = now();
        assert!(a < b);
        assert!(a.ends_with('Z') && a.len() == 24);
    }

    #[test]
    fn validates_dates_strictly() {
        assert!(parse_date("2026-11-06").is_ok());
        assert!(parse_date("2026-02-30").is_err());
        assert!(parse_date("2026-1-6").is_err());
        assert!(parse_date("06/11/2026").is_err());
    }
}
