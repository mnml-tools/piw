//! Command-line actions.
//!
//! These flags are also forwarded from a second instance via the single-instance plugin, which
//! makes them the universal fallback for global shortcuts: any desktop environment can bind a
//! key to `piw --quick-note`.

/// What the user asked the app to do on launch (or via a second instance).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LaunchAction {
    /// Show the workspace window (default when launched normally).
    ShowWorkspace,
    /// Start in the background, e.g. when launched by autostart.
    StartHidden,
    QuickNote,
    QuickTask,
}

pub const FLAG_QUICK_NOTE: &str = "--quick-note";
pub const FLAG_QUICK_TASK: &str = "--quick-task";
pub const FLAG_HIDDEN: &str = "--hidden";

/// Parses process arguments (including the program name in position 0).
///
/// Unknown arguments are ignored so that platform launchers adding their own flags
/// (e.g. macOS `-psn_…`) do not break startup.
pub fn parse_args<I, S>(args: I) -> LaunchAction
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let mut action = LaunchAction::ShowWorkspace;
    for arg in args.into_iter().skip(1) {
        match arg.as_ref() {
            FLAG_QUICK_NOTE => return LaunchAction::QuickNote,
            FLAG_QUICK_TASK => return LaunchAction::QuickTask,
            FLAG_HIDDEN => action = LaunchAction::StartHidden,
            _ => {}
        }
    }
    action
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_to_showing_the_workspace() {
        assert_eq!(parse_args(["piw"]), LaunchAction::ShowWorkspace);
    }

    #[test]
    fn recognises_capture_flags() {
        assert_eq!(parse_args(["piw", "--quick-note"]), LaunchAction::QuickNote);
        assert_eq!(parse_args(["piw", "--quick-task"]), LaunchAction::QuickTask);
    }

    #[test]
    fn capture_flags_win_over_hidden() {
        assert_eq!(
            parse_args(["piw", "--hidden", "--quick-task"]),
            LaunchAction::QuickTask
        );
    }

    #[test]
    fn recognises_hidden_and_ignores_unknown_flags() {
        assert_eq!(
            parse_args(["piw", "-psn_0_123", "--hidden"]),
            LaunchAction::StartHidden
        );
    }

    #[test]
    fn ignores_the_program_name() {
        assert_eq!(parse_args(["--quick-note"]), LaunchAction::ShowWorkspace);
    }
}
