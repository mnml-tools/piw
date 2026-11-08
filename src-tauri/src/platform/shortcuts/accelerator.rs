//! Accelerator strings in Tauri's format (`CommandOrControl+Shift+Space`) and their
//! conversion to the XDG "shortcuts" trigger format used by the desktop portal.

pub const DEFAULT_ACCELERATOR: &str = "CommandOrControl+Shift+Space";

/// Converts a Tauri accelerator to an XDG shortcuts trigger (e.g. `CTRL+SHIFT+space`).
///
/// Returns `None` when a token cannot be represented, in which case the portal is asked to
/// bind the shortcut without a preferred trigger and the user picks one.
pub fn to_portal_trigger(accelerator: &str) -> Option<String> {
    let mut parts = Vec::new();
    let tokens: Vec<&str> = accelerator.split('+').map(str::trim).collect();
    let (key, modifiers) = tokens.split_last()?;
    for modifier in modifiers {
        let mapped = match modifier.to_ascii_lowercase().as_str() {
            "commandorcontrol" | "cmdorctrl" | "control" | "ctrl" => "CTRL",
            "shift" => "SHIFT",
            "alt" | "option" => "ALT",
            "super" | "meta" | "command" | "cmd" => "LOGO",
            _ => return None,
        };
        if !parts.contains(&mapped) {
            parts.push(mapped);
        }
    }
    let key = portal_key(key)?;
    let mut trigger = parts.join("+");
    if !trigger.is_empty() {
        trigger.push('+');
    }
    trigger.push_str(&key);
    Some(trigger)
}

fn portal_key(key: &str) -> Option<String> {
    let lower = key.to_ascii_lowercase();
    let named = match lower.as_str() {
        "space" => "space",
        "enter" | "return" => "Return",
        "tab" => "Tab",
        "backspace" => "BackSpace",
        "escape" | "esc" => "Escape",
        "up" | "arrowup" => "Up",
        "down" | "arrowdown" => "Down",
        "left" | "arrowleft" => "Left",
        "right" | "arrowright" => "Right",
        "period" | "." => "period",
        "comma" | "," => "comma",
        "slash" | "/" => "slash",
        "semicolon" | ";" => "semicolon",
        _ => "",
    };
    if !named.is_empty() {
        return Some(named.to_owned());
    }
    if lower.len() == 1 && lower.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Some(lower);
    }
    let is_function_key = lower.len() <= 3
        && lower.starts_with('f')
        && lower[1..]
            .parse::<u8>()
            .is_ok_and(|n| (1..=24).contains(&n));
    is_function_key.then(|| lower.to_ascii_uppercase())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_the_default_accelerator() {
        assert_eq!(
            to_portal_trigger(DEFAULT_ACCELERATOR).as_deref(),
            Some("CTRL+SHIFT+space")
        );
    }

    #[test]
    fn converts_letters_function_keys_and_super() {
        assert_eq!(
            to_portal_trigger("Super+Alt+N").as_deref(),
            Some("LOGO+ALT+n")
        );
        assert_eq!(to_portal_trigger("Ctrl+F12").as_deref(), Some("CTRL+F12"));
        assert_eq!(to_portal_trigger("F5").as_deref(), Some("F5"));
    }

    #[test]
    fn rejects_unknown_tokens() {
        assert_eq!(to_portal_trigger("Hyper+Space"), None);
        assert_eq!(to_portal_trigger("Ctrl+F99"), None);
        assert_eq!(to_portal_trigger(""), None);
    }
}
