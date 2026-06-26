use tauri::{Manager, Emitter, WebviewWindowBuilder, WebviewUrl};
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;
use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut, GlobalShortcutExt};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

mod os_integration;

static SETTINGS_OPENING: AtomicBool = AtomicBool::new(false);
static SETTINGS_HANDLER_BOUND: AtomicBool = AtomicBool::new(false);
static HOTKEY_IN_PROGRESS: AtomicBool = AtomicBool::new(false);
static HOTKEY_PENDING: AtomicBool = AtomicBool::new(false);
static LAST_HOTKEY_MS: AtomicU64 = AtomicU64::new(0);

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn capture_selected_text_with_retry() -> Option<String> {
    // Ensure source app is foreground before the first capture attempt.
    os_integration::restore_source_app();
    std::thread::sleep(std::time::Duration::from_millis(40));

    // First attempt right after foreground restore.
    if let Some(text) = os_integration::get_selected_text() {
        if !text.trim().is_empty() {
            return Some(text);
        }
    }

    // Windows apps may need extra focus/clipboard settle time after Alt+Space.
    let retry_delays_ms = [120_u64, 180_u64, 260_u64, 340_u64];

    for delay in retry_delays_ms {
        os_integration::restore_source_app();
        std::thread::sleep(std::time::Duration::from_millis(delay));

        if let Some(text) = os_integration::get_selected_text() {
            if !text.trim().is_empty() {
                return Some(text);
            }
        }
    }

    None
}

#[derive(Clone, serde::Serialize)]
struct SelectionPayload {
    text: String,
    source: String,
}

#[derive(serde::Serialize)]
struct CaretPosition {
    x: f64,
    y: f64,
}

#[tauri::command]
fn hide_window(window: tauri::WebviewWindow) {
    let _ = window.hide();
}

#[tauri::command]
fn show_main_window(app: tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
    }
}

#[tauri::command]
fn open_settings(app: tauri::AppHandle) {
    show_settings_window(&app);
}

#[tauri::command]
fn notify_dom_ready(app: tauri::AppHandle) {
    // Ignore background startup renders. We only surface the settings window
    // when it is being explicitly opened by user action.
    if !SETTINGS_OPENING.load(Ordering::SeqCst) {
        return;
    }

    for _ in 0..10 {
        if let Some(win) = app.get_webview_window("settings") {
            let _ = win.show();
            let _ = win.set_focus();
            SETTINGS_OPENING.store(false, Ordering::SeqCst);
            return;
        }
        std::thread::sleep(std::time::Duration::from_millis(50));
    }
    SETTINGS_OPENING.store(false, Ordering::SeqCst);
}

fn show_settings_window(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("settings") {
        ensure_settings_window_close_handler(app, &win);
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
        SETTINGS_OPENING.store(false, Ordering::SeqCst);
        return;
    }

    SETTINGS_OPENING.store(true, Ordering::SeqCst);

    let win = match WebviewWindowBuilder::new(
        app,
        "settings",
        WebviewUrl::App("index.html".into()),
    )
    .title("Dadumi Settings")
    .inner_size(420.0, 500.0)
    .resizable(false)
    .decorations(true)
    .transparent(false)
    .always_on_top(true)
    .initialization_script("window.__DADUMI_VIEW = 'settings';")
    // Keep this window visible right after creation so Windows does not depend
    // on renderer timing to surface the settings UI.
    .visible(true)
    .skip_taskbar(false)
    .build() {
        Ok(w) => w,
        Err(_) => {
            SETTINGS_OPENING.store(false, Ordering::SeqCst);
            return;
        }
    };

    let _ = win.unminimize();
    let _ = win.show();
    let _ = win.set_focus();

    ensure_settings_window_close_handler(app, &win);
}

fn ensure_settings_window_close_handler(app: &tauri::AppHandle, win: &tauri::WebviewWindow) {
    if SETTINGS_HANDLER_BOUND.swap(true, Ordering::SeqCst) {
        return;
    }

    let app_for_close = app.clone();
    let win_for_close = win.clone();
    win.on_window_event(move |event| {
        match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                // Keep a single settings window instance and make the native X
                // button reliable on Windows by translating close into hide.
                api.prevent_close();
                let _ = win_for_close.hide();
                SETTINGS_OPENING.store(false, Ordering::SeqCst);
                if let Some(main) = app_for_close.get_webview_window("main") {
                    let _ = main.show();
                    let _ = main.set_focus();
                }
            }
            tauri::WindowEvent::Destroyed => {
                SETTINGS_HANDLER_BOUND.store(false, Ordering::SeqCst);
                SETTINGS_OPENING.store(false, Ordering::SeqCst);
            }
            _ => {}
        }
    });
}

#[tauri::command]
fn paste_text(text: String, window: tauri::WebviewWindow) -> bool {
    let _ = window.hide();
    let retry_delays_ms = [150_u64, 260_u64, 380_u64];

    for delay in retry_delays_ms {
        std::thread::sleep(std::time::Duration::from_millis(delay));
        os_integration::restore_source_app();
        std::thread::sleep(std::time::Duration::from_millis(120));
        if os_integration::paste_text(text.clone()) {
            return true;
        }
    }

    false
}

#[tauri::command]
fn get_caret_position() -> CaretPosition {
    let (x, y) = os_integration::get_mouse_position();
    CaretPosition { x, y }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                        HOTKEY_PENDING.store(true, Ordering::SeqCst);
                        return;
                    }

                    if event.state() == tauri_plugin_global_shortcut::ShortcutState::Released {
                        if !HOTKEY_PENDING.swap(false, Ordering::SeqCst) {
                            return;
                        }

                        let now = now_millis();
                        let last = LAST_HOTKEY_MS.load(Ordering::SeqCst);
                        if now.saturating_sub(last) < 250 {
                            return;
                        }
                        LAST_HOTKEY_MS.store(now, Ordering::SeqCst);

                        if HOTKEY_IN_PROGRESS.swap(true, Ordering::SeqCst) {
                            return;
                        }

                        let app_handle = app.clone();
                        std::thread::spawn(move || {
                            os_integration::save_source_pid();
                            let Some(captured_text) = capture_selected_text_with_retry() else {
                                HOTKEY_IN_PROGRESS.store(false, Ordering::SeqCst);
                                return;
                            };
                            let (mouse_x, mouse_y) = os_integration::get_mouse_position();

                            if let Some(window) = app_handle.get_webview_window("main") {
                                let win_x = (mouse_x + 32.0) as i32;
                                let win_y = (mouse_y - 24.0) as i32;
                                let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(win_x, win_y)));
                                let _ = window.show();
                                let _ = window.set_focus();
                                let payload = SelectionPayload {
                                    text: captured_text,
                                    source: "hotkey".to_string(),
                                };
                                let _ = window.emit("selection-captured", payload);
                            }

                            HOTKEY_IN_PROGRESS.store(false, Ordering::SeqCst);
                        });
                    }
                })
                .build(),
        )
        .setup(|app| {
            os_integration::request_accessibility_if_needed();

            let show_i = MenuItemBuilder::with_id("show", "Show Assistant").build(app)?;
            let settings_i = MenuItemBuilder::with_id("settings", "Settings").build(app)?;
            let quit_i = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
            let menu = MenuBuilder::new(app).items(&[&show_i, &settings_i, &quit_i]).build()?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| {
                    match event.id().as_ref() {
                        "quit" => {
                            app.cleanup_before_exit();
                            std::process::exit(0);
                        }
                        "settings" => {
                            show_settings_window(app);
                        }
                        "show" => {
                            let app_handle = app.clone();
                            std::thread::spawn(move || {
                                let (mouse_x, mouse_y) = os_integration::get_mouse_position();
                                if let Some(window) = app_handle.get_webview_window("main") {
                                    let win_x = (mouse_x + 32.0) as i32;
                                    let win_y = (mouse_y - 24.0) as i32;
                                    let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(win_x, win_y)));
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                    let payload = SelectionPayload {
                                        text: String::new(),
                                        source: "tray".to_string(),
                                    };
                                    let _ = window.emit("selection-captured", payload);
                                }
                            });
                        }
                        _ => {}
                    }
                })
                .build(app)?;

            #[cfg(target_os = "windows")]
            let shortcut = Shortcut::new(Some(Modifiers::CONTROL), Code::Space);

            #[cfg(not(target_os = "windows"))]
            let shortcut = Shortcut::new(Some(Modifiers::ALT), Code::Space);
            let _ = app.global_shortcut().register(shortcut);

            if let Some(settings_window) = app.get_webview_window("settings") {
                ensure_settings_window_close_handler(&app.handle().clone(), &settings_window);
            }

            if let Some(window) = app.get_webview_window("main") {
                let w_clone = window.clone();
                let app_clone = app.handle().clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::Focused(focused) = event {
                        if !*focused {
                            let settings_busy = SETTINGS_OPENING.load(Ordering::SeqCst);
                            let settings_visible = app_clone
                                .get_webview_window("settings")
                                .and_then(|w| w.is_visible().ok())
                                .unwrap_or(false);
                            if !settings_busy && !settings_visible {
                                let _ = w_clone.hide();
                            }
                        }
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            hide_window,
            show_main_window,
            open_settings,
            notify_dom_ready,
            paste_text,
            get_caret_position
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
