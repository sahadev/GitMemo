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
        NSBackingStoreType, NSColor, NSControlSize, NSFont, NSProgressIndicator,
        NSProgressIndicatorStyle, NSTextField, NSView, NSWindow, NSWindowStyleMask,
    };
    use objc2_foundation::{NSPoint, NSRect, NSSize, NSString};
    use objc2_quartz_core::CALayer;
    use std::cell::RefCell;
    use tauri::AppHandle;

    const MAIN_WINDOW_LABEL: &str = "main";
    const FALLBACK_WINDOW_WIDTH: f64 = 960.0;
    const FALLBACK_WINDOW_HEIGHT: f64 = 680.0;
    // 8pt spacing scale for the native startup skeleton.
    const SPACE_1: f64 = 8.0;
    const SPACE_2: f64 = 16.0;
    const SPACE_3: f64 = 24.0;
    const SPACE_4: f64 = 32.0;
    const SPACE_5: f64 = 40.0;
    const WINDOW_PADDING: f64 = SPACE_5;
    const PANEL_GAP: f64 = SPACE_3;
    const PANEL_PADDING: f64 = SPACE_5;
    const SIDEBAR_WIDTH: f64 = 256.0;
    const WINDOW_CORNER_RADIUS: f64 = 18.0;
    const PANEL_CORNER_RADIUS: f64 = 16.0;
    const CARD_CORNER_RADIUS: f64 = 14.0;
    const PLACEHOLDER_RADIUS: f64 = 6.0;
    const SMALL_PLACEHOLDER_RADIUS: f64 = 4.0;
    const STATUS_TITLE_HEIGHT: f64 = SPACE_4 - 2.0;
    const STATUS_SUBTITLE_HEIGHT: f64 = SPACE_2 + 6.0;
    const STATUS_PROGRESS_HEIGHT: f64 = SPACE_1 + 6.0;
    const STATUS_SPINNER_SIZE: f64 = SPACE_3 + 2.0;
    const TOP_PANEL_HEIGHT: f64 = 220.0;
    const MIDDLE_PANEL_HEIGHT: f64 = 170.0;
    const SIDEBAR_ROW_GAP: f64 = 48.0;

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
        let content_x = WINDOW_PADDING + SIDEBAR_WIDTH + PANEL_GAP;
        let content_width = size.width - content_x - WINDOW_PADDING;
        let top_height = TOP_PANEL_HEIGHT;
        let middle_height = MIDDLE_PANEL_HEIGHT;
        let bottom_y = WINDOW_PADDING;
        let top_y = size.height - WINDOW_PADDING - top_height;
        let middle_y = top_y - PANEL_GAP - middle_height;
        let bottom_height = middle_y - PANEL_GAP - bottom_y;

        SkeletonLayout {
            size,
            sidebar_x: WINDOW_PADDING,
            sidebar_y: WINDOW_PADDING,
            sidebar_width: SIDEBAR_WIDTH,
            sidebar_height: size.height - (WINDOW_PADDING * 2.0),
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
        window.setOpaque(false);
        window.setHasShadow(true);
        window.setMovableByWindowBackground(true);
        window.setBackgroundColor(Some(&NSColor::clearColor()));
        let content_view = create_content_view(mtm, size);
        window.setContentView(Some(&content_view));
        window.invalidateShadow();
        window.center();
        window
    }

    fn create_content_view(mtm: MainThreadMarker, size: SkeletonWindowSize) -> Retained<NSView> {
        let layout = skeleton_layout(size);
        let view = NSView::initWithFrame(
            NSView::alloc(mtm),
            rect(0.0, 0.0, layout.size.width, layout.size.height),
        );
        style_layer(
            &view,
            &color(0x17, 0x1a, 0x15, 1.0),
            None,
            0.0,
            WINDOW_CORNER_RADIUS,
            true,
        );
        let root = &view;

        add_panel(
            root,
            mtm,
            layout.sidebar_x,
            layout.sidebar_y,
            layout.sidebar_width,
            layout.sidebar_height,
            color(0x20, 0x26, 0x1f, 1.0),
            CARD_CORNER_RADIUS,
        );
        add_panel(
            root,
            mtm,
            layout.content_x,
            layout.top_y,
            layout.content_width,
            layout.top_height,
            color(0x20, 0x25, 0x20, 1.0),
            PANEL_CORNER_RADIUS,
        );
        let middle_card_width = (layout.content_width - PANEL_GAP) / 2.0;
        add_panel(
            root,
            mtm,
            layout.content_x,
            layout.middle_y,
            middle_card_width,
            layout.middle_height,
            color(0x21, 0x27, 0x22, 1.0),
            CARD_CORNER_RADIUS,
        );
        add_panel(
            root,
            mtm,
            layout.content_x + middle_card_width + PANEL_GAP,
            layout.middle_y,
            middle_card_width,
            layout.middle_height,
            color(0x1f, 0x25, 0x23, 1.0),
            CARD_CORNER_RADIUS,
        );
        add_panel(
            root,
            mtm,
            layout.content_x,
            layout.bottom_y,
            layout.content_width,
            layout.bottom_height,
            color(0x20, 0x25, 0x20, 1.0),
            CARD_CORNER_RADIUS,
        );

        let sidebar_content_x = layout.sidebar_x + PANEL_PADDING;
        let sidebar_content_width = layout.sidebar_width - (PANEL_PADDING * 2.0);
        let sidebar_top = layout.sidebar_y + layout.sidebar_height;
        add_label(
            root,
            mtm,
            "GitMemo",
            sidebar_content_x,
            sidebar_top - PANEL_PADDING - STATUS_TITLE_HEIGHT,
            sidebar_content_width,
            STATUS_TITLE_HEIGHT,
            22.0,
            true,
            color(0xec, 0xf4, 0xe8, 1.0),
        );
        add_label(
            root,
            mtm,
            "正在启动工作区",
            sidebar_content_x,
            sidebar_top - PANEL_PADDING - STATUS_TITLE_HEIGHT - SPACE_3 - STATUS_SUBTITLE_HEIGHT,
            sidebar_content_width,
            STATUS_SUBTITLE_HEIGHT,
            13.0,
            false,
            color(0xa8, 0xb5, 0xa3, 1.0),
        );

        let sidebar_row_start = sidebar_top - PANEL_PADDING - 116.0;
        for index in 0..8 {
            let y = sidebar_row_start - (index as f64 * SIDEBAR_ROW_GAP);
            let accent = if index == 0 {
                color(0x8e, 0xb1, 0x66, 1.0)
            } else {
                color(0x34, 0x3c, 0x33, 1.0)
            };
            add_placeholder(
                root,
                mtm,
                sidebar_content_x,
                y,
                sidebar_content_width,
                12.0,
                accent,
                PLACEHOLDER_RADIUS,
            );
            add_placeholder(
                root,
                mtm,
                sidebar_content_x,
                y - SPACE_3,
                if index % 2 == 0 { 120.0 } else { 96.0 },
                SPACE_1,
                color(0x2c, 0x34, 0x2c, 1.0),
                SMALL_PLACEHOLDER_RADIUS,
            );
        }

        add_startup_status(root, mtm, &layout);

        for card_x in [
            layout.content_x + PANEL_PADDING,
            layout.content_x + middle_card_width + PANEL_GAP + PANEL_PADDING,
        ] {
            add_placeholder(
                root,
                mtm,
                card_x,
                layout.middle_y + layout.middle_height - PANEL_PADDING - 12.0,
                middle_card_width - (PANEL_PADDING * 2.0),
                12.0,
                color(0x36, 0x3f, 0x35, 1.0),
                PLACEHOLDER_RADIUS,
            );
            add_placeholder(
                root,
                mtm,
                card_x,
                layout.middle_y + PANEL_PADDING + 12.0,
                middle_card_width * 0.45,
                SPACE_1,
                color(0x2d, 0x35, 0x2d, 1.0),
                SMALL_PLACEHOLDER_RADIUS,
            );
        }

        let bottom_content_x = layout.content_x + PANEL_PADDING;
        let bottom_content_width = layout.content_width - (PANEL_PADDING * 2.0);
        for (offset, width) in [(62.0_f64, 520.0_f64), (94.0, 400.0), (126.0, 120.0)] {
            add_placeholder(
                root,
                mtm,
                bottom_content_x,
                layout.bottom_y + layout.bottom_height - offset,
                width.min(bottom_content_width),
                if offset == 126.0 { SPACE_1 } else { 12.0 },
                if offset == 126.0 {
                    color(0x2d, 0x35, 0x2d, 1.0)
                } else {
                    color(0x36, 0x3f, 0x35, 1.0)
                },
                if offset == 126.0 {
                    SMALL_PLACEHOLDER_RADIUS
                } else {
                    PLACEHOLDER_RADIUS
                },
            );
        }

        view
    }

    fn add_startup_status(parent: &NSView, mtm: MainThreadMarker, layout: &SkeletonLayout) {
        let content_x = layout.content_x + PANEL_PADDING;
        let content_width = layout.content_width - (PANEL_PADDING * 2.0);
        let panel_top = layout.top_y + layout.top_height;
        let title_y = panel_top - PANEL_PADDING - STATUS_TITLE_HEIGHT;
        let subtitle_y = title_y - SPACE_2 - STATUS_SUBTITLE_HEIGHT;
        let progress_y = layout.top_y + PANEL_PADDING;

        add_label(
            parent,
            mtm,
            "正在启动 GitMemo",
            content_x,
            title_y,
            content_width - STATUS_SPINNER_SIZE - SPACE_3,
            STATUS_TITLE_HEIGHT,
            18.0,
            true,
            color(0xe7, 0xef, 0xe0, 1.0),
        );
        add_label(
            parent,
            mtm,
            "正在准备笔记、剪贴板与同步状态",
            content_x,
            subtitle_y,
            content_width - STATUS_SPINNER_SIZE - SPACE_3,
            STATUS_SUBTITLE_HEIGHT,
            13.0,
            false,
            color(0x9e, 0xab, 0x99, 1.0),
        );
        add_spinner(
            parent,
            mtm,
            content_x + content_width - STATUS_SPINNER_SIZE,
            title_y + ((STATUS_TITLE_HEIGHT - STATUS_SPINNER_SIZE) / 2.0),
        );
        add_progress_bar(
            parent,
            mtm,
            content_x,
            progress_y,
            content_width,
            STATUS_PROGRESS_HEIGHT,
        );
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
        let panel = NSView::initWithFrame(NSView::alloc(mtm), rect(x, y, width, height));
        style_layer(
            &panel,
            &fill,
            Some(&color(0x2d, 0x35, 0x2c, 1.0)),
            1.0,
            radius,
            true,
        );
        parent.addSubview(&panel);
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
        let placeholder = NSView::initWithFrame(NSView::alloc(mtm), rect(x, y, width, height));
        style_layer(&placeholder, &fill, None, 0.0, radius, true);
        parent.addSubview(&placeholder);
    }

    fn style_layer(
        view: &NSView,
        fill: &NSColor,
        border: Option<&NSColor>,
        border_width: f64,
        radius: f64,
        masks_to_bounds: bool,
    ) {
        view.setWantsLayer(true);
        let layer = view.layer().unwrap_or_else(|| {
            let layer = CALayer::layer();
            view.setLayer(Some(&layer));
            layer
        });
        layer.setBackgroundColor(Some(&fill.CGColor()));
        layer.setBorderWidth(border_width);
        layer.setBorderColor(border.map(|color| color.CGColor()).as_deref());
        layer.setCornerRadius(radius);
        layer.setMasksToBounds(masks_to_bounds);
    }

    fn add_progress_bar(
        parent: &NSView,
        mtm: MainThreadMarker,
        x: f64,
        y: f64,
        width: f64,
        height: f64,
    ) {
        let progress = NSProgressIndicator::initWithFrame(
            NSProgressIndicator::alloc(mtm),
            rect(x, y, width, height),
        );
        progress.setStyle(NSProgressIndicatorStyle::Bar);
        progress.setIndeterminate(true);
        progress.setDisplayedWhenStopped(true);
        unsafe {
            progress.setUsesThreadedAnimation(true);
            progress.startAnimation(None);
        }
        parent.addSubview(progress.as_super());
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
            rect(x, y, STATUS_SPINNER_SIZE, STATUS_SPINNER_SIZE),
        );
        spinner.setStyle(NSProgressIndicatorStyle::Spinning);
        spinner.setControlSize(NSControlSize::Regular);
        spinner.setIndeterminate(true);
        spinner.setDisplayedWhenStopped(true);
        unsafe {
            spinner.setUsesThreadedAnimation(true);
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
