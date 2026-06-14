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

    const MAIN_WINDOW_LABEL: &str = "main";
    const FALLBACK_WINDOW_WIDTH: f64 = 960.0;
    const FALLBACK_WINDOW_HEIGHT: f64 = 680.0;
    const WINDOW_MARGIN: f64 = 24.0;
    const PANEL_GAP: f64 = 24.0;
    const SIDEBAR_WIDTH: f64 = 260.0;

    #[derive(Clone, Copy)]
    struct SkeletonWindowSize {
        width: f64,
        height: f64,
    }

    #[derive(Clone, Copy)]
    struct SkeletonLayout {
        size: SkeletonWindowSize,
        sidebar_x: f64,
        sidebar_y: f64,
        sidebar_width: f64,
        sidebar_height: f64,
        content_x: f64,
        content_width: f64,
        top_y: f64,
        top_height: f64,
        middle_y: f64,
        middle_height: f64,
        bottom_y: f64,
        bottom_height: f64,
    }

    thread_local! {
        static SKELETON_WINDOW: RefCell<Option<Retained<NSWindow>>> = const { RefCell::new(None) };
    }

    pub(crate) fn show(app: &AppHandle) {
        let size = startup_skeleton_window_size(app);
        if let Err(e) = app.run_on_main_thread(move || show_on_main_thread(size)) {
            log::warn!("Failed to show native startup skeleton: {e}");
        }
    }

    pub(crate) fn close(app: &AppHandle) {
        if let Err(e) = app.run_on_main_thread(close_on_main_thread) {
            log::warn!("Failed to close native startup skeleton: {e}");
        }
    }

    fn show_on_main_thread(size: SkeletonWindowSize) {
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

            let window = create_window(mtm, size);
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

    fn startup_skeleton_window_size(app: &AppHandle) -> SkeletonWindowSize {
        app.config()
            .app
            .windows
            .iter()
            .find(|window| window.label == MAIN_WINDOW_LABEL)
            .map(|window| SkeletonWindowSize {
                width: window.width,
                height: window.height,
            })
            .unwrap_or(SkeletonWindowSize {
                width: FALLBACK_WINDOW_WIDTH,
                height: FALLBACK_WINDOW_HEIGHT,
            })
    }

    fn skeleton_layout(size: SkeletonWindowSize) -> SkeletonLayout {
        let content_x = WINDOW_MARGIN + SIDEBAR_WIDTH + PANEL_GAP;
        let content_width = size.width - content_x - WINDOW_MARGIN;
        let top_height = 220.0;
        let middle_height = 170.0;
        let bottom_y = WINDOW_MARGIN;
        let top_y = size.height - WINDOW_MARGIN - top_height;
        let middle_y = top_y - PANEL_GAP - middle_height;
        let bottom_height = middle_y - PANEL_GAP - bottom_y;

        SkeletonLayout {
            size,
            sidebar_x: WINDOW_MARGIN,
            sidebar_y: WINDOW_MARGIN,
            sidebar_width: SIDEBAR_WIDTH,
            sidebar_height: size.height - (WINDOW_MARGIN * 2.0),
            content_x,
            content_width,
            top_y,
            top_height,
            middle_y,
            middle_height,
            bottom_y,
            bottom_height,
        }
    }

    fn create_window(mtm: MainThreadMarker, size: SkeletonWindowSize) -> Retained<NSWindow> {
        let frame = rect(0.0, 0.0, size.width, size.height);
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
        let content_view = create_content_view(mtm, size);
        window.setContentView(Some(&content_view));
        window.center();
        window
    }

    fn create_content_view(mtm: MainThreadMarker, size: SkeletonWindowSize) -> Retained<NSView> {
        let layout = skeleton_layout(size);
        let view = NSView::initWithFrame(
            NSView::alloc(mtm),
            rect(0.0, 0.0, layout.size.width, layout.size.height),
        );

        add_panel(
            &view,
            mtm,
            layout.sidebar_x,
            layout.sidebar_y,
            layout.sidebar_width,
            layout.sidebar_height,
            color(0x20, 0x26, 0x1f, 1.0),
            14.0,
        );
        add_panel(
            &view,
            mtm,
            layout.content_x,
            layout.top_y,
            layout.content_width,
            layout.top_height,
            color(0x20, 0x25, 0x20, 1.0),
            16.0,
        );
        let middle_card_width = (layout.content_width - PANEL_GAP) / 2.0;
        add_panel(
            &view,
            mtm,
            layout.content_x,
            layout.middle_y,
            middle_card_width,
            layout.middle_height,
            color(0x21, 0x27, 0x22, 1.0),
            14.0,
        );
        add_panel(
            &view,
            mtm,
            layout.content_x + middle_card_width + PANEL_GAP,
            layout.middle_y,
            middle_card_width,
            layout.middle_height,
            color(0x1f, 0x25, 0x23, 1.0),
            14.0,
        );
        add_panel(
            &view,
            mtm,
            layout.content_x,
            layout.bottom_y,
            layout.content_width,
            layout.bottom_height,
            color(0x20, 0x25, 0x20, 1.0),
            14.0,
        );

        add_label(
            &view,
            mtm,
            "GitMemo",
            layout.sidebar_x + 34.0,
            layout.sidebar_y + layout.sidebar_height - 70.0,
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
            layout.sidebar_x + 34.0,
            layout.sidebar_y + layout.sidebar_height - 108.0,
            150.0,
            20.0,
            13.0,
            false,
            color(0xa8, 0xb5, 0xa3, 1.0),
        );

        let sidebar_row_start = layout.sidebar_y + layout.sidebar_height - 175.0;
        for index in 0..8 {
            let y = sidebar_row_start - (index as f64 * 48.0);
            let accent = if index == 0 {
                color(0x8e, 0xb1, 0x66, 1.0)
            } else {
                color(0x34, 0x3c, 0x33, 1.0)
            };
            add_placeholder(
                &view,
                mtm,
                layout.sidebar_x + 34.0,
                y,
                180.0,
                12.0,
                accent,
                6.0,
            );
            add_placeholder(
                &view,
                mtm,
                layout.sidebar_x + 34.0,
                y - 20.0,
                if index % 2 == 0 { 120.0 } else { 96.0 },
                8.0,
                color(0x2c, 0x34, 0x2c, 1.0),
                4.0,
            );
        }

        add_label(
            &view,
            mtm,
            "Loading GitMemo",
            layout.content_x + 40.0,
            layout.top_y + layout.top_height - 70.0,
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
            layout.content_x + 40.0,
            layout.top_y + layout.top_height - 108.0,
            260.0,
            20.0,
            13.0,
            false,
            color(0x9e, 0xab, 0x99, 1.0),
        );
        add_spinner(
            &view,
            mtm,
            layout.content_x + layout.content_width - 64.0,
            layout.top_y + layout.top_height - 84.0,
        );

        for offset in [135.0, 165.0, 195.0] {
            add_placeholder(
                &view,
                mtm,
                layout.content_x + 40.0,
                layout.top_y + layout.top_height - offset,
                layout.content_width - 80.0,
                12.0,
                color(0x33, 0x3b, 0x33, 1.0),
                6.0,
            );
        }

        for card_x in [
            layout.content_x + 40.0,
            layout.content_x + middle_card_width + PANEL_GAP + 40.0,
        ] {
            add_placeholder(
                &view,
                mtm,
                card_x,
                layout.middle_y + layout.middle_height - 70.0,
                middle_card_width - 80.0,
                12.0,
                color(0x36, 0x3f, 0x35, 1.0),
                6.0,
            );
            add_placeholder(
                &view,
                mtm,
                card_x,
                layout.middle_y + 52.0,
                middle_card_width * 0.45,
                8.0,
                color(0x2d, 0x35, 0x2d, 1.0),
                4.0,
            );
        }

        for (offset, width) in [(62.0_f64, 520.0_f64), (94.0, 400.0), (126.0, 120.0)] {
            add_placeholder(
                &view,
                mtm,
                layout.content_x + 40.0,
                layout.bottom_y + layout.bottom_height - offset,
                width.min(layout.content_width - 80.0),
                if offset == 126.0 { 8.0 } else { 12.0 },
                if offset == 126.0 {
                    color(0x2d, 0x35, 0x2d, 1.0)
                } else {
                    color(0x36, 0x3f, 0x35, 1.0)
                },
                if offset == 126.0 { 4.0 } else { 6.0 },
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
