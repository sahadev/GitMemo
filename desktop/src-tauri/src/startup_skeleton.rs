#[cfg(not(target_os = "macos"))]
use tauri::AppHandle;

#[cfg(not(target_os = "macos"))]
pub(crate) fn show(_app: &AppHandle) {}

#[cfg(not(target_os = "macos"))]
pub(crate) fn close(_app: &AppHandle) {}

#[cfg(target_os = "macos")]
mod macos {
    use objc2::rc::Retained;
    use objc2::{ClassType, MainThreadMarker, MainThreadOnly};
    use objc2_app_kit::{
        NSBackingStoreType, NSBox, NSBoxType, NSColor, NSFont, NSProgressIndicator,
        NSProgressIndicatorStyle, NSTextField, NSView, NSWindow, NSWindowStyleMask,
    };
    use objc2_foundation::{NSPoint, NSRect, NSSize, NSString};
    use std::cell::RefCell;
    use tauri::AppHandle;

    const WINDOW_WIDTH: f64 = 760.0;
    const WINDOW_HEIGHT: f64 = 520.0;

    thread_local! {
        static SKELETON_WINDOW: RefCell<Option<Retained<NSWindow>>> = const { RefCell::new(None) };
    }

    pub(crate) fn show(app: &AppHandle) {
        if let Err(e) = app.run_on_main_thread(show_on_main_thread) {
            log::warn!("Failed to show native startup skeleton: {e}");
        }
    }

    pub(crate) fn close(app: &AppHandle) {
        if let Err(e) = app.run_on_main_thread(close_on_main_thread) {
            log::warn!("Failed to close native startup skeleton: {e}");
        }
    }

    fn show_on_main_thread() {
        SKELETON_WINDOW.with(|slot| {
            if let Some(window) = slot.borrow().as_ref() {
                if !window.isVisible() {
                    window.makeKeyAndOrderFront(None);
                }
                return;
            }

            let Some(mtm) = MainThreadMarker::new() else {
                return;
            };

            let window = create_window(mtm);
            window.makeKeyAndOrderFront(None);
            *slot.borrow_mut() = Some(window);
        });
    }

    fn close_on_main_thread() {
        SKELETON_WINDOW.with(|slot| {
            if let Some(window) = slot.borrow_mut().take() {
                window.orderOut(None);
            }
        });
    }

    fn create_window(mtm: MainThreadMarker) -> Retained<NSWindow> {
        let frame = rect(0.0, 0.0, WINDOW_WIDTH, WINDOW_HEIGHT);
        let window = unsafe {
            NSWindow::initWithContentRect_styleMask_backing_defer(
                NSWindow::alloc(mtm),
                frame,
                NSWindowStyleMask::Borderless,
                NSBackingStoreType::Buffered,
                false,
            )
        };

        unsafe {
            window.setReleasedWhenClosed(false);
        }
        window.setOpaque(true);
        window.setMovableByWindowBackground(true);
        window.setBackgroundColor(Some(&color(0x17, 0x1a, 0x15, 1.0)));
        let content_view = create_content_view(mtm);
        window.setContentView(Some(&content_view));
        window.center();
        window
    }

    fn create_content_view(mtm: MainThreadMarker) -> Retained<NSView> {
        let view = NSView::initWithFrame(
            NSView::alloc(mtm),
            rect(0.0, 0.0, WINDOW_WIDTH, WINDOW_HEIGHT),
        );

        add_panel(
            &view,
            mtm,
            20.0,
            20.0,
            210.0,
            480.0,
            color(0x20, 0x26, 0x1f, 1.0),
            14.0,
        );
        add_panel(
            &view,
            mtm,
            250.0,
            320.0,
            490.0,
            180.0,
            color(0x20, 0x25, 0x20, 1.0),
            16.0,
        );
        add_panel(
            &view,
            mtm,
            250.0,
            170.0,
            230.0,
            130.0,
            color(0x21, 0x27, 0x22, 1.0),
            14.0,
        );
        add_panel(
            &view,
            mtm,
            500.0,
            170.0,
            240.0,
            130.0,
            color(0x1f, 0x25, 0x23, 1.0),
            14.0,
        );
        add_panel(
            &view,
            mtm,
            250.0,
            20.0,
            490.0,
            130.0,
            color(0x20, 0x25, 0x20, 1.0),
            14.0,
        );

        add_label(
            &view,
            mtm,
            "GitMemo",
            44.0,
            448.0,
            150.0,
            30.0,
            22.0,
            true,
            color(0xec, 0xf4, 0xe8, 1.0),
        );
        add_label(
            &view,
            mtm,
            "Starting workspace",
            44.0,
            416.0,
            150.0,
            20.0,
            13.0,
            false,
            color(0xa8, 0xb5, 0xa3, 1.0),
        );

        for (index, y) in [360.0, 312.0, 264.0, 216.0, 168.0].into_iter().enumerate() {
            let accent = if index == 0 {
                color(0x8e, 0xb1, 0x66, 1.0)
            } else {
                color(0x34, 0x3c, 0x33, 1.0)
            };
            add_placeholder(&view, mtm, 44.0, y, 140.0, 12.0, accent, 6.0);
            add_placeholder(
                &view,
                mtm,
                44.0,
                y - 20.0,
                94.0,
                8.0,
                color(0x2c, 0x34, 0x2c, 1.0),
                4.0,
            );
        }

        add_label(
            &view,
            mtm,
            "Loading GitMemo",
            280.0,
            448.0,
            240.0,
            24.0,
            18.0,
            true,
            color(0xe7, 0xef, 0xe0, 1.0),
        );
        add_label(
            &view,
            mtm,
            "Preparing notes, clips, and sync state",
            280.0,
            418.0,
            260.0,
            20.0,
            13.0,
            false,
            color(0x9e, 0xab, 0x99, 1.0),
        );
        add_spinner(&view, mtm, 690.0, 438.0);

        for y in [382.0, 354.0, 326.0] {
            add_placeholder(
                &view,
                mtm,
                280.0,
                y,
                400.0,
                12.0,
                color(0x33, 0x3b, 0x33, 1.0),
                6.0,
            );
        }

        for (x, y, w) in [
            (280.0, 254.0, 150.0),
            (530.0, 254.0, 160.0),
            (280.0, 92.0, 380.0),
            (280.0, 64.0, 320.0),
        ] {
            add_placeholder(&view, mtm, x, y, w, 12.0, color(0x36, 0x3f, 0x35, 1.0), 6.0);
        }

        for (x, y) in [(280.0, 210.0), (530.0, 210.0), (280.0, 36.0)] {
            add_placeholder(
                &view,
                mtm,
                x,
                y,
                90.0,
                8.0,
                color(0x2d, 0x35, 0x2d, 1.0),
                4.0,
            );
        }

        view
    }

    fn add_panel(
        parent: &NSView,
        mtm: MainThreadMarker,
        x: f64,
        y: f64,
        width: f64,
        height: f64,
        fill: Retained<NSColor>,
        radius: f64,
    ) {
        let panel = NSBox::initWithFrame(NSBox::alloc(mtm), rect(x, y, width, height));
        panel.setBoxType(NSBoxType::Custom);
        panel.setFillColor(&fill);
        panel.setBorderColor(&color(0x2d, 0x35, 0x2c, 1.0));
        panel.setBorderWidth(1.0);
        panel.setCornerRadius(radius);
        parent.addSubview(panel.as_super());
    }

    fn add_placeholder(
        parent: &NSView,
        mtm: MainThreadMarker,
        x: f64,
        y: f64,
        width: f64,
        height: f64,
        fill: Retained<NSColor>,
        radius: f64,
    ) {
        let placeholder = NSBox::initWithFrame(NSBox::alloc(mtm), rect(x, y, width, height));
        placeholder.setBoxType(NSBoxType::Custom);
        placeholder.setFillColor(&fill);
        placeholder.setBorderColor(&fill);
        placeholder.setBorderWidth(0.0);
        placeholder.setCornerRadius(radius);
        parent.addSubview(placeholder.as_super());
    }

    #[allow(clippy::too_many_arguments)]
    fn add_label(
        parent: &NSView,
        mtm: MainThreadMarker,
        text: &str,
        x: f64,
        y: f64,
        width: f64,
        height: f64,
        size: f64,
        bold: bool,
        text_color: Retained<NSColor>,
    ) {
        let text = NSString::from_str(text);
        let label = NSTextField::labelWithString(&text, mtm);
        label
            .as_super()
            .as_super()
            .setFrame(rect(x, y, width, height));
        label.setTextColor(Some(&text_color));
        let font = if bold {
            NSFont::boldSystemFontOfSize(size)
        } else {
            NSFont::systemFontOfSize(size)
        };
        label.setFont(Some(&font));
        parent.addSubview(label.as_super().as_super());
    }

    fn add_spinner(parent: &NSView, mtm: MainThreadMarker, x: f64, y: f64) {
        let spinner = NSProgressIndicator::initWithFrame(
            NSProgressIndicator::alloc(mtm),
            rect(x, y, 24.0, 24.0),
        );
        spinner.setStyle(NSProgressIndicatorStyle::Spinning);
        spinner.setIndeterminate(true);
        spinner.setDisplayedWhenStopped(true);
        unsafe {
            spinner.startAnimation(None);
        }
        parent.addSubview(spinner.as_super());
    }

    fn rect(x: f64, y: f64, width: f64, height: f64) -> NSRect {
        NSRect::new(NSPoint::new(x, y), NSSize::new(width, height))
    }

    fn color(red: u8, green: u8, blue: u8, alpha: f64) -> Retained<NSColor> {
        NSColor::colorWithSRGBRed_green_blue_alpha(
            f64::from(red) / 255.0,
            f64::from(green) / 255.0,
            f64::from(blue) / 255.0,
            alpha,
        )
    }
}

#[cfg(target_os = "macos")]
pub(crate) use macos::{close, show};
