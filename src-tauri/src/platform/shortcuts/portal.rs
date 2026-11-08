//! Global shortcuts through the XDG Desktop Portal (Linux, Wayland sessions).
//!
//! Requires a desktop entry named after the app identifier (e.g. `app.piw.Piw.desktop`) so the
//! portal can attribute the shortcut to Piw; packages install it, and `scripts/dev-desktop-entry.sh`
//! installs one for development builds.

use ashpd::desktop::global_shortcuts::{GlobalShortcuts, NewShortcut};
use ashpd::{AppID, register_host_app};
use futures_util::StreamExt;
use tauri::{AppHandle, Manager, Runtime};
use tokio::sync::oneshot;

use super::accelerator::to_portal_trigger;

const SHORTCUT_ID: &str = "quick-capture";

/// Keeps the portal session alive; dropping or stopping it releases the shortcut.
pub struct PortalHandle {
    stop: Option<oneshot::Sender<()>>,
}

impl PortalHandle {
    pub fn stop(mut self) {
        if let Some(stop) = self.stop.take() {
            let _ = stop.send(());
        }
    }
}

/// Binds the quick-capture shortcut. Returns the handle and the trigger the desktop reports.
pub async fn bind<R: Runtime>(
    app: AppHandle<R>,
    accelerator: &str,
    on_trigger: fn(&AppHandle<R>),
) -> Result<(PortalHandle, Option<String>), ashpd::Error> {
    let identifier = app.config().identifier.clone();
    match AppID::try_from(identifier.as_str()) {
        Ok(app_id) => {
            if let Err(error) = register_host_app(app_id).await {
                // Older portals lack the registry; binding may still work via the process.
                log::warn!("portal host registration failed: {error}");
            }
        }
        Err(error) => log::warn!("identifier is not a valid portal app id: {error}"),
    }

    let portal = GlobalShortcuts::new().await?;
    let session = portal.create_session(Default::default()).await?;
    let trigger = to_portal_trigger(accelerator);
    let shortcut = NewShortcut::new(SHORTCUT_ID, "Open Piw Quick Capture")
        .preferred_trigger(trigger.as_deref());
    let response = portal
        .bind_shortcuts(&session, &[shortcut], None, Default::default())
        .await?
        .response()?;
    let bound = response
        .shortcuts()
        .iter()
        .find(|s| s.id() == SHORTCUT_ID)
        .map(|s| s.trigger_description().to_owned())
        .filter(|t| !t.is_empty());
    if response.shortcuts().is_empty() {
        return Err(ashpd::Error::NoResponse);
    }

    let mut activated = portal.receive_activated().await?;
    let (stop_tx, mut stop_rx) = oneshot::channel::<()>();
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::select! {
                event = activated.next() => match event {
                    Some(event) if event.shortcut_id() == SHORTCUT_ID => {
                        let handle = app.app_handle().clone();
                        on_trigger(&handle);
                    }
                    Some(_) => {}
                    None => break,
                },
                _ = &mut stop_rx => break,
            }
        }
        if let Err(error) = session.close().await {
            log::warn!("could not close portal session: {error}");
        }
        drop(portal);
    });

    Ok((
        PortalHandle {
            stop: Some(stop_tx),
        },
        bound,
    ))
}
