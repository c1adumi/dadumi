use tauri::{Manager, Emitter, WebviewWindowBuilder, WebviewUrl};
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;
use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut, GlobalShortcutExt};
use std::sync::atomic::{AtomicBool, Ordering};

mod os_integration;

static SETTINGS_OPENING: AtomicBool = AtomicBool::new(false);

#[derive(Clone, serde::Serialize)]
struct SelectionPayload {
    text: String,
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

fn show_settings_window(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("settings") {
        let _ = win.show();
        let _ = win.set_focus();
        return;
    }

    SETTINGS_OPENING.store(true, Ordering::SeqCst);

    let win = match WebviewWindowBuilder::new(
        app,
        "settings",
        WebviewUrl::App("index.html?view=settings".into()),
    )
    .title("Dadumi Settings")
    .inner_size(420.0, 500.0)
    .resizable(false)
    .decorations(true)
    .transparent(false)
    .visible(false)
    .skip_taskbar(false)
    .build() {
        Ok(w) => w,
        Err(_) => {
            SETTINGS_OPENING.store(false, Ordering::SeqCst);
            return;
        }
    };

    let win_clone = win.clone();
    let app_clone = app.clone();
    win.on_webview_event(move |event| {
        if let tauri::WebviewEvent::DomReady = event {
            SETTINGS_OPENING.store(false, Ordering::SeqCst);
            let _ = win_clone.show();
            let _ = win_clone.set_focus();
        }
    });

    let app_for_close = app_clone.clone();
    win.on_window_event(move |event| {
        match event {
            tauri::WindowEvent::CloseRequested { .. } | tauri::WindowEvent::Destroyed => {
                SETTINGS_OPENING.store(false, Ordering::SeqCst);
                if let Some(main) = app_for_close.get_webview_window("main") {
                    let _ = main.show();
                }
            }
            _ => {}
        }
    });
}

#[tauri::command]
fn paste_text(text: String, window: tauri::WebviewWindow) {
    let _ = window.hide();
    os_integration::restore_source_app();
    std::thread::sleep(std::time::Duration::from_millis(300));
    os_integration::paste_text(text);
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
                        let app_handle = app.clone();
                        std::thread::spawn(move || {
                            os_integration::save_source_pid();
                            // Do NOT call restore_source_app() here — source app is still focused
                            // get_selected_text() sends Ctrl+C while source app has focus
                            let captured_text = os_integration::get_selected_text().unwrap_or_default();
                            let (mouse_x, mouse_y) = os_integration::get_mouse_position();

                            if let Some(window) = app_handle.get_webview_window("main") {
                                let win_x = (mouse_x + 32.0) as i32;
                                let win_y = (mouse_y - 24.0) as i32;
                                let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(win_x, win_y)));
                                let _ = window.show();
                                let _ = window.set_focus();
                                let payload = SelectionPayload { text: captured_text };
                                let _ = window.emit("selection-captured", payload);
                            }
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
                                    let payload = SelectionPayload { text: String::new() };
                                    let _ = window.emit("selection-captured", payload);
                                }
                            });
                        }
                        _ => {}
                    }
                })
                .build(app)?;

            let shortcut = Shortcut::new(Some(Modifiers::ALT), Code::Space);
            let _ = app.global_shortcut().register(shortcut);

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
            paste_text,
            get_caret_position
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
