//! Navigation lockdown. Every Piw webview may only show Piw's own pages: any other navigation
//! (a link in pasted content, a compromised renderer) is refused, and new windows are denied.
//! External links open in the user's browser through `open_link`, which validates them.

use tauri::Url;

/// Whether `url` is one of the app's own pages (bundled assets, or the dev server in debug).
pub fn is_app_url(url: &Url, dev_server: Option<&Url>) -> bool {
    match url.scheme() {
        // Bundled assets: `tauri://localhost` (Linux/macOS), `http(s)://tauri.localhost` (Windows).
        "tauri" => url.host_str() == Some("localhost"),
        "http" | "https" => {
            url.host_str() == Some("tauri.localhost")
                || dev_server.is_some_and(|dev| {
                    dev.scheme() == url.scheme()
                        && dev.host_str() == url.host_str()
                        && dev.port_or_known_default() == url.port_or_known_default()
                })
        }
        // `about:blank` is used internally by webviews while loading.
        "about" => url.as_str() == "about:blank",
        _ => false,
    }
}

const MAX_LINK_LENGTH: usize = 2048;

/// Links that may be opened in the user's browser or mail client.
pub fn is_openable_link(link: &str) -> bool {
    if link.len() > MAX_LINK_LENGTH || link.chars().any(char::is_control) {
        return false;
    }
    match Url::parse(link) {
        Ok(url) => match url.scheme() {
            "http" | "https" => url.host_str().is_some_and(|h| !h.is_empty()),
            "mailto" => !url.path().is_empty(),
            _ => false,
        },
        Err(_) => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn url(s: &str) -> Url {
        Url::parse(s).unwrap()
    }

    #[test]
    fn only_app_pages_are_allowed() {
        assert!(is_app_url(&url("tauri://localhost/index.html"), None));
        assert!(is_app_url(&url("http://tauri.localhost/index.html"), None));
        assert!(is_app_url(&url("about:blank"), None));
        for bad in [
            "https://example.com/",
            "http://tauri.localhost.evil.com/",
            "file:///etc/passwd",
            "javascript:alert(1)",
            "http://localhost:1420/",
            "tauri://evil/",
        ] {
            assert!(!is_app_url(&url(bad), None), "{bad}");
        }
    }

    #[test]
    fn the_dev_server_is_allowed_only_when_given() {
        let dev = url("http://localhost:1420/");
        assert!(is_app_url(
            &url("http://localhost:1420/src/main.tsx"),
            Some(&dev)
        ));
        assert!(!is_app_url(&url("http://localhost:1421/"), Some(&dev)));
    }

    #[test]
    fn only_web_and_mail_links_open_externally() {
        assert!(is_openable_link("https://www.rfc-editor.org/rfc/rfc6238"));
        assert!(is_openable_link("mailto:team@example.com"));
        for bad in [
            "file:///etc/passwd",
            "javascript:alert(1)",
            "smb://server/share",
            "//example.com",
            "/relative",
            "https://",
            "https://exa\nmple.com",
        ] {
            assert!(!is_openable_link(bad), "{bad}");
        }
    }
}
