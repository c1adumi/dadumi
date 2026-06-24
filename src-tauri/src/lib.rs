use tauri::{Manager, Emitter};
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;
use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut, GlobalShortcutExt};

mod os_integration;

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
                            let captured_text = os_integration::get_selected_text().unwrap_or_default();
                            let (mouse_x, mouse_y) = os_integration::get_mouse_position();
                            
                            if let Some(window) = app_handle.get_webview_window("main") {
                                // Align the card (at 24px top-left padding inside transparent window) to the cursor
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
            // Create tray menu items
            let show_i = MenuItemBuilder::with_id("show", "Show Assistant").build(app)?;
            let quit_i = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
            let menu = MenuBuilder::new(app).items(&[&show_i, &quit_i]).build()?;

            // Build tray icon
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| {
                    match event.id().as_ref() {
                        "quit" => {
                            app.exit(0);
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
                                    
                                    // Send empty selection when opened from tray
                                    let payload = SelectionPayload { text: String::new() };
                                    let _ = window.emit("selection-captured", payload);
                                }
                            });
                        }
                        _ => {}
                    }
                })
                .build(app)?;

            // Register Option + Space (ALT + Space)
            let shortcut = Shortcut::new(Some(Modifiers::ALT), Code::Space);
            let _ = app.global_shortcut().register(shortcut);
            
            // Auto-hide window when it loses focus
            if let Some(window) = app.get_webview_window("main") {
                let w_clone = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::Focused(focused) = event {
                        if !*focused {
                            let _ = w_clone.hide();
                        }
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            hide_window,
            paste_text,
            get_caret_position
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
