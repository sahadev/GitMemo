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
        NSBackingStoreType, NSColor, NSFont, NSTextAlignment, NSTextField, NSView, NSWindow,
        NSWindowStyleMask,
    };
    use objc2_foundation::{NSPoint, NSRect, NSSize, NSString};
    use objc2_quartz_core::{
        kCAMediaTimingFunctionEaseInEaseOut, CABasicAnimation, CALayer, CAMediaTiming,
        CAMediaTimingFunction,
    };
    use std::cell::RefCell;
    use tauri::AppHandle;

    const MAIN_WINDOW_LABEL: &str = "main";
    const FALLBACK_WINDOW_WIDTH: f64 = 960.0;
    const FALLBACK_WINDOW_HEIGHT: f64 = 680.0;
    const WINDOW_CORNER_RADIUS: f64 = 18.0;
    const CONTENT_WIDTH: f64 = 420.0;
    const TITLE_HEIGHT: f64 = 40.0;
    const LOADER_WIDTH: f64 = 72.0;
    const LOADER_HEIGHT: f64 = 36.0;
    const PROGRESS_WIDTH: f64 = 240.0;
    const PROGRESS_HEIGHT: f64 = 6.0;
    const PROGRESS_INDICATOR_WIDTH: f64 = 72.0;
    const LOADER_DOT_SIZE: f64 = 8.0;
    const LOADER_DOT_GAP: f64 = 14.0;
    const STACK_HEIGHT: f64 = 136.0;

    #[derive(Clone, Copy)]
    struct SkeletonWindowSize {
        width: f64,
        height: f64,
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
        let view =
            NSView::initWithFrame(NSView::alloc(mtm), rect(0.0, 0.0, size.width, size.height));
        style_layer(
            &view,
            &color(0x16, 0x19, 0x15, 1.0),
            None,
            0.0,
            WINDOW_CORNER_RADIUS,
            true,
        );

        let center_x = size.width / 2.0;
        let stack_top = (size.height + STACK_HEIGHT) / 2.0;
        let content_x = center_x - (CONTENT_WIDTH / 2.0);

        add_label(
            &view,
            mtm,
            "GitMemo 正在启动中",
            content_x,
            stack_top - TITLE_HEIGHT,
            CONTENT_WIDTH,
            TITLE_HEIGHT,
            24.0,
            true,
            color(0xec, 0xf4, 0xe8, 1.0),
        );
        add_loader(
            &view,
            mtm,
            center_x - (LOADER_WIDTH / 2.0),
            stack_top - TITLE_HEIGHT - 32.0 - LOADER_HEIGHT,
        );
        let progress_x = center_x - (PROGRESS_WIDTH / 2.0);
        let progress_y = stack_top - TITLE_HEIGHT - 32.0 - LOADER_HEIGHT - 30.0 - PROGRESS_HEIGHT;
        add_progress_track(
            &view,
            mtm,
            progress_x,
            progress_y,
            PROGRESS_WIDTH,
            PROGRESS_HEIGHT,
        );

        view
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

    fn add_loader(parent: &NSView, mtm: MainThreadMarker, x: f64, y: f64) {
        let container =
            NSView::initWithFrame(NSView::alloc(mtm), rect(x, y, LOADER_WIDTH, LOADER_HEIGHT));
        style_layer(
            &container,
            &color(0x17, 0x1a, 0x15, 1.0),
            None,
            0.0,
            LOADER_HEIGHT / 2.0,
            true,
        );
        let base_x = (LOADER_WIDTH - (3.0 * LOADER_DOT_SIZE) - (2.0 * LOADER_DOT_GAP)) / 2.0;
        for index in 0..3 {
            let dot_x = base_x + (index as f64 * (LOADER_DOT_SIZE + LOADER_DOT_GAP));
            let dot = NSView::initWithFrame(
                NSView::alloc(mtm),
                rect(
                    dot_x,
                    (LOADER_HEIGHT - LOADER_DOT_SIZE) / 2.0,
                    LOADER_DOT_SIZE,
                    LOADER_DOT_SIZE,
                ),
            );
            style_layer(
                &dot,
                &color(0xa7, 0xc7, 0x79, 0.95),
                None,
                0.0,
                LOADER_DOT_SIZE / 2.0,
                true,
            );
            add_opacity_pulse(&dot, index as f64 * 0.18);
            container.addSubview(&dot);
        }
        parent.addSubview(&container);
    }

    fn add_progress_track(
        parent: &NSView,
        mtm: MainThreadMarker,
        x: f64,
        y: f64,
        width: f64,
        height: f64,
    ) {
        let track = NSView::initWithFrame(NSView::alloc(mtm), rect(x, y, width, height));
        style_layer(
            &track,
            &color(0x2d, 0x35, 0x2d, 1.0),
            None,
            0.0,
            height / 2.0,
            true,
        );
        parent.addSubview(&track);

        let indicator = NSView::initWithFrame(
            NSView::alloc(mtm),
            rect(x, y, PROGRESS_INDICATOR_WIDTH, height),
        );
        style_layer(
            &indicator,
            &color(0xa7, 0xc7, 0x79, 1.0),
            None,
            0.0,
            height / 2.0,
            true,
        );
        add_progress_slide(&indicator, width - PROGRESS_INDICATOR_WIDTH);
        parent.addSubview(&indicator);
    }

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
        label.setAlignment(NSTextAlignment::Center);
        label.setTextColor(Some(&text_color));
        let font = if bold {
            NSFont::boldSystemFontOfSize(size)
        } else {
            NSFont::systemFontOfSize(size)
        };
        label.setFont(Some(&font));
        parent.addSubview(label.as_super().as_super());
    }

    fn add_opacity_pulse(view: &NSView, begin_time: f64) {
        let animation =
            CABasicAnimation::animationWithKeyPath(Some(&NSString::from_str("opacity")));
        unsafe {
            animation.setFromValue(Some(ns_number(0.35).as_ref()));
            animation.setToValue(Some(ns_number(1.0).as_ref()));
        }
        animation.setDuration(0.72);
        animation.setAutoreverses(true);
        animation.setRepeatCount(f32::INFINITY);
        animation.setBeginTime(begin_time);
        animation.setTimingFunction(Some(&ease_in_out_timing()));

        if let Some(layer) = view.layer() {
            layer.addAnimation_forKey(
                animation.as_super(),
                Some(&NSString::from_str("opacityPulse")),
            );
        }
    }

    fn add_progress_slide(view: &NSView, travel: f64) {
        let animation = CABasicAnimation::animationWithKeyPath(Some(&NSString::from_str(
            "transform.translation.x",
        )));
        unsafe {
            animation.setFromValue(Some(ns_number(0.0).as_ref()));
            animation.setToValue(Some(ns_number(travel).as_ref()));
        }
        animation.setDuration(1.45);
        animation.setAutoreverses(true);
        animation.setRepeatCount(f32::INFINITY);
        animation.setTimingFunction(Some(&ease_in_out_timing()));

        if let Some(layer) = view.layer() {
            layer.addAnimation_forKey(
                animation.as_super(),
                Some(&NSString::from_str("progressSlide")),
            );
        }
    }

    fn ease_in_out_timing() -> Retained<CAMediaTimingFunction> {
        unsafe { CAMediaTimingFunction::functionWithName(kCAMediaTimingFunctionEaseInEaseOut) }
    }

    fn ns_number(value: f64) -> Retained<objc2_foundation::NSNumber> {
        objc2_foundation::NSNumber::numberWithDouble(value)
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
