//! Pure geometry helpers used to keep windows reachable when monitors change.
//!
//! All rectangles are in physical pixels of the virtual desktop, the coordinate space that
//! Tauri reports for monitors and outer window positions.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "bindings/")]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

impl Rect {
    pub const fn new(x: i32, y: i32, width: u32, height: u32) -> Self {
        Self {
            x,
            y,
            width,
            height,
        }
    }

    fn right(&self) -> i64 {
        i64::from(self.x) + i64::from(self.width)
    }

    fn bottom(&self) -> i64 {
        i64::from(self.y) + i64::from(self.height)
    }

    fn area(&self) -> i128 {
        i128::from(self.width) * i128::from(self.height)
    }

    /// Area shared by both rectangles. `i128` because two `u32` sides overflow `i64`.
    pub fn intersection_area(&self, other: &Rect) -> i128 {
        let left = i64::from(self.x.max(other.x));
        let top = i64::from(self.y.max(other.y));
        let right = self.right().min(other.right());
        let bottom = self.bottom().min(other.bottom());
        if right <= left || bottom <= top {
            0
        } else {
            i128::from(right - left) * i128::from(bottom - top)
        }
    }
}

/// Minimum share of a window that must lie on one work area for it to be left in place.
pub const MIN_VISIBLE_RATIO: f64 = 0.3;

/// Height of the strip at the top of a window that must stay reachable so it can be dragged.
pub const GRAB_STRIP: u32 = 32;

/// Returns a position for `window` that keeps it usable on the given work areas.
///
/// * If at least [`MIN_VISIBLE_RATIO`] of the window is on some work area, the window stays
///   there and is only nudged so that its top strip is fully inside that work area.
/// * Otherwise the window is centred on the fallback work area (`fallback`, usually the primary
///   monitor), shrinking it if it does not fit.
///
/// Returns `None` when there are no work areas (the platform could not report monitors); in
/// that case the caller should let the window manager place the window.
pub fn ensure_visible(window: Rect, work_areas: &[Rect], fallback: usize) -> Option<Rect> {
    if work_areas.is_empty() {
        return None;
    }
    let window_area = window.area().max(1);
    let best = work_areas
        .iter()
        .map(|area| (area, window.intersection_area(area)))
        .max_by_key(|(_, overlap)| *overlap);

    if let Some((area, overlap)) = best {
        #[allow(clippy::cast_precision_loss)]
        let ratio = overlap as f64 / window_area as f64;
        if ratio >= MIN_VISIBLE_RATIO {
            return Some(clamp_into(window, area));
        }
    }

    let target = work_areas.get(fallback).unwrap_or(&work_areas[0]);
    Some(center_in(window, target))
}

/// Moves (never resizes, unless larger than the area) `window` so it fits inside `area`.
fn clamp_into(window: Rect, area: &Rect) -> Rect {
    let width = window.width.min(area.width);
    let height = window.height.min(area.height);
    let max_x = area.right() - i64::from(width);
    let max_y = area.bottom() - i64::from(height.clamp(1, GRAB_STRIP));
    let x = i64::from(window.x).clamp(i64::from(area.x), max_x.max(i64::from(area.x)));
    let y = i64::from(window.y).clamp(i64::from(area.y), max_y.max(i64::from(area.y)));
    Rect::new(to_i32(x), to_i32(y), width, height)
}

fn center_in(window: Rect, area: &Rect) -> Rect {
    let width = window.width.min(area.width);
    let height = window.height.min(area.height);
    let x = i64::from(area.x) + (i64::from(area.width) - i64::from(width)) / 2;
    let y = i64::from(area.y) + (i64::from(area.height) - i64::from(height)) / 2;
    Rect::new(to_i32(x), to_i32(y), width, height)
}

fn to_i32(value: i64) -> i32 {
    i32::try_from(value).unwrap_or(if value < 0 { i32::MIN } else { i32::MAX })
}

#[cfg(test)]
mod tests {
    use super::*;

    // Mirrors the development machine: a 4K monitor and a 1080p monitor below it.
    const PRIMARY: Rect = Rect::new(0, 0, 3840, 2160);
    const SECONDARY: Rect = Rect::new(620, 2160, 1920, 1080);

    #[test]
    fn keeps_a_fully_visible_window_in_place() {
        let window = Rect::new(100, 100, 300, 200);
        assert_eq!(
            ensure_visible(window, &[PRIMARY, SECONDARY], 0),
            Some(window)
        );
    }

    #[test]
    fn keeps_a_window_on_the_secondary_monitor() {
        let window = Rect::new(800, 2400, 300, 200);
        assert_eq!(
            ensure_visible(window, &[PRIMARY, SECONDARY], 0),
            Some(window)
        );
    }

    #[test]
    fn recentres_a_window_from_a_disconnected_monitor() {
        let window = Rect::new(800, 2400, 300, 200);
        let placed = ensure_visible(window, &[PRIMARY], 0).unwrap();
        assert_eq!(placed, Rect::new(1770, 980, 300, 200));
    }

    #[test]
    fn recentres_a_window_far_off_screen() {
        let window = Rect::new(-50_000, -50_000, 300, 200);
        let placed = ensure_visible(window, &[PRIMARY, SECONDARY], 0).unwrap();
        assert_eq!(PRIMARY.intersection_area(&placed), 300 * 200);
    }

    #[test]
    fn nudges_a_mostly_visible_window_so_it_can_be_grabbed() {
        // Title strip above the top edge of the monitor.
        let window = Rect::new(100, -20, 300, 200);
        let placed = ensure_visible(window, &[PRIMARY], 0).unwrap();
        assert_eq!(placed, Rect::new(100, 0, 300, 200));
    }

    #[test]
    fn shrinks_a_window_larger_than_the_work_area() {
        let window = Rect::new(0, 0, 5000, 3000);
        let placed = ensure_visible(window, &[SECONDARY], 0).unwrap();
        assert_eq!(placed, SECONDARY);
    }

    #[test]
    fn falls_back_to_the_first_area_for_an_invalid_index() {
        let window = Rect::new(-9000, 0, 100, 100);
        let placed = ensure_visible(window, &[SECONDARY], 7).unwrap();
        assert!(SECONDARY.intersection_area(&placed) > 0);
    }

    #[test]
    fn returns_none_without_monitors() {
        assert_eq!(ensure_visible(Rect::new(0, 0, 10, 10), &[], 0), None);
    }

    #[test]
    fn handles_extreme_coordinates_without_overflow() {
        let window = Rect::new(i32::MAX - 10, i32::MAX - 10, u32::MAX, u32::MAX);
        assert!(ensure_visible(window, &[PRIMARY], 0).is_some());
    }
}
