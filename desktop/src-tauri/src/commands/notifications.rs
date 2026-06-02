use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

const NOTIFICATION_NAVIGATE_EVENT: &str = "gitmemo-notification-navigate";

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationNavigateTarget {
    page: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    focus: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    ai_records_tab: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    open_path: Option<String>,
}

impl NotificationNavigateTarget {
    fn validate(&self) -> Result<(), String> {
        const VALID_PAGES: [&str; 11] = [
            "dashboard",
            "search",
            "ai-records",
            "notes",
            "clipboard",
            "favorites",
            "imports",
            "claude-config",
            "editor-home",
            "external-files",
            "settings",
        ];
        if !VALID_PAGES.contains(&self.page.as_str()) {
            return Err(format!("Invalid notification target page: {}", self.page));
        }
        if let Some(tab) = self.ai_records_tab.as_deref() {
            if tab != "conversations" && tab != "plans" {
                return Err(format!("Invalid notification target tab: {tab}"));
            }
        }
        Ok(())
    }
}

pub(crate) fn emit_notification_navigate(app: &AppHandle, target: &NotificationNavigateTarget) {
    let _ = app.emit(NOTIFICATION_NAVIGATE_EVENT, target);
}

#[tauri::command]
pub fn send_desktop_notification(
    app: AppHandle,
    title: String,
    body: Option<String>,
    target: Option<NotificationNavigateTarget>,
) -> Result<(), String> {
    if let Some(target) = &target {
        target.validate()?;
    }

    #[cfg(target_os = "macos")]
    {
        macos::send_notification(app, title, body.unwrap_or_default(), target)
    }

    #[cfg(not(target_os = "macos"))]
    {
        use tauri_plugin_notification::NotificationExt;

        let mut builder = app.notification().builder().title(title);
        if let Some(body) = body.filter(|body| !body.is_empty()) {
            builder = builder.body(body);
        }
        builder.show().map_err(|e| e.to_string())
    }
}

#[cfg(target_os = "macos")]
#[allow(deprecated)]
mod macos {
    use super::{emit_notification_navigate, NotificationNavigateTarget};
    use crate::show_main_window_from_app;
    use objc2::rc::Retained;
    use objc2::runtime::ProtocolObject;
    use objc2::{class, define_class, msg_send, MainThreadMarker, MainThreadOnly};
    use objc2_foundation::{
        NSObject, NSObjectProtocol, NSString, NSUserNotification, NSUserNotificationActivationType,
        NSUserNotificationCenter, NSUserNotificationCenterDelegate,
    };
    use std::cell::OnceCell;
    use std::collections::HashMap;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::sync::{Mutex, Once, OnceLock};
    use std::time::{Duration, Instant};
    use tauri::AppHandle;

    const TARGET_TTL: Duration = Duration::from_secs(10 * 60);

    static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();
    static CONFIGURE_APPLICATION: Once = Once::new();
    static NEXT_NOTIFICATION_ID: AtomicU64 = AtomicU64::new(1);
    static PENDING_TARGETS: OnceLock<Mutex<HashMap<String, PendingTarget>>> = OnceLock::new();

    thread_local! {
        static NOTIFICATION_DELEGATE: OnceCell<Retained<GitMemoNotificationDelegate>> = const { OnceCell::new() };
    }

    #[derive(Clone)]
    struct PendingTarget {
        target: NotificationNavigateTarget,
        at: Instant,
    }

    fn pending_targets() -> &'static Mutex<HashMap<String, PendingTarget>> {
        PENDING_TARGETS.get_or_init(|| Mutex::new(HashMap::new()))
    }

    fn prune_pending_targets(now: Instant) {
        pending_targets()
            .lock()
            .unwrap()
            .retain(|_, pending| now.duration_since(pending.at) <= TARGET_TTL);
    }

    fn take_pending_target(id: &str) -> Option<NotificationNavigateTarget> {
        pending_targets()
            .lock()
            .unwrap()
            .remove(id)
            .map(|pending| pending.target)
    }

    fn configure_notification_application(app: &AppHandle) {
        CONFIGURE_APPLICATION.call_once(|| {
            let identifier = if tauri::is_dev() {
                "com.apple.Terminal".to_string()
            } else {
                app.config().identifier.clone()
            };
            if let Err(e) = mac_notification_sys::set_application(&identifier) {
                log::warn!("Failed to configure macOS notification application {identifier}: {e}");
            }
        });
    }

    define_class!(
        #[unsafe(super = NSObject)]
        #[thread_kind = MainThreadOnly]
        #[ivars = ()]
        struct GitMemoNotificationDelegate;

        unsafe impl NSObjectProtocol for GitMemoNotificationDelegate {}

        unsafe impl NSUserNotificationCenterDelegate for GitMemoNotificationDelegate {
            #[unsafe(method(userNotificationCenter:didActivateNotification:))]
            fn did_activate_notification(
                &self,
                center: &NSUserNotificationCenter,
                notification: &NSUserNotification,
            ) {
                let target = notification
                    .identifier()
                    .as_deref()
                    .map(ToString::to_string)
                    .and_then(|id| take_pending_target(&id));

                center.removeDeliveredNotification(notification);

                if notification.activationType() != NSUserNotificationActivationType::None {
                    if let Some(app) = APP_HANDLE.get() {
                        show_main_window_from_app(app);
                        if let Some(target) = target {
                            emit_notification_navigate(app, &target);
                        }
                    }
                }
            }

            #[unsafe(method(userNotificationCenter:shouldPresentNotification:))]
            fn should_present_notification(
                &self,
                _center: &NSUserNotificationCenter,
                _notification: &NSUserNotification,
            ) -> bool {
                true
            }
        }
    );

    impl GitMemoNotificationDelegate {
        fn new(mtm: MainThreadMarker) -> Retained<Self> {
            let this = Self::alloc(mtm).set_ivars(());
            unsafe { msg_send![super(this), init] }
        }
    }

    fn default_notification_center() -> Option<Retained<NSUserNotificationCenter>> {
        unsafe {
            msg_send![
                class!(NSUserNotificationCenter),
                defaultUserNotificationCenter
            ]
        }
    }

    fn new_user_notification() -> Option<Retained<NSUserNotification>> {
        unsafe { msg_send![class!(NSUserNotification), new] }
    }

    fn ensure_delegate_on_main_thread(center: &NSUserNotificationCenter) {
        NOTIFICATION_DELEGATE.with(|delegate| {
            if delegate.get().is_some() {
                return;
            }

            let Some(mtm) = MainThreadMarker::new() else {
                return;
            };

            let new_delegate = GitMemoNotificationDelegate::new(mtm);
            unsafe {
                center.setDelegate(Some(ProtocolObject::from_ref(&*new_delegate)));
            }
            let _ = delegate.set(new_delegate);
        });
    }

    fn send_plugin_notification(app: &AppHandle, title: String, body: String, id: &str) {
        use tauri_plugin_notification::NotificationExt;

        let _ = take_pending_target(id);

        let mut builder = app.notification().builder().title(title);
        if !body.is_empty() {
            builder = builder.body(body);
        }
        if let Err(e) = builder.show() {
            log::warn!("Failed to send fallback desktop notification: {e}");
        }
    }

    fn deliver_notification_on_main_thread(
        app: AppHandle,
        id: String,
        title: String,
        body: String,
    ) {
        let Some(center) = default_notification_center() else {
            log::warn!("macOS NSUserNotificationCenter is unavailable; using plugin fallback");
            send_plugin_notification(&app, title, body, &id);
            return;
        };
        let Some(notification) = new_user_notification() else {
            log::warn!("macOS NSUserNotification is unavailable; using plugin fallback");
            send_plugin_notification(&app, title, body, &id);
            return;
        };

        ensure_delegate_on_main_thread(&center);

        let title = NSString::from_str(&title);
        let id = NSString::from_str(&id);
        notification.setTitle(Some(&title));
        notification.setIdentifier(Some(&id));
        notification.setHasActionButton(false);

        if !body.is_empty() {
            let body = NSString::from_str(&body);
            notification.setInformativeText(Some(&body));
        }

        center.deliverNotification(&notification);
    }

    pub fn send_notification(
        app: AppHandle,
        title: String,
        body: String,
        target: Option<NotificationNavigateTarget>,
    ) -> Result<(), String> {
        let _ = APP_HANDLE.set(app.clone());
        configure_notification_application(&app);

        let now = Instant::now();
        prune_pending_targets(now);

        let id = format!(
            "gitmemo-{}-{}",
            std::process::id(),
            NEXT_NOTIFICATION_ID.fetch_add(1, Ordering::Relaxed)
        );

        if let Some(target) = target {
            pending_targets()
                .lock()
                .unwrap()
                .insert(id.clone(), PendingTarget { target, at: now });
        }

        let app_for_delivery = app.clone();
        app.run_on_main_thread(move || {
            deliver_notification_on_main_thread(app_for_delivery, id, title, body)
        })
        .map_err(|e| e.to_string())
    }
}
