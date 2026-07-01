use tauri::{Manager, Emitter, WebviewWindowBuilder, WebviewUrl};
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;
use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut, GlobalShortcutExt};
#[cfg(windows)]
use tauri::WebviewWindow;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

const COPILOT_CLIENT_ID: &str = "Iv1.b507a08c87ecfe98";

#[derive(serde::Serialize, serde::Deserialize)]
struct DeviceCodeResponse {
    device_code: String,
    user_code: String,
    verification_uri: String,
    interval: u64,
    expires_in: u64,
    #[serde(default)]
    error: Option<String>,
}

#[tauri::command]
async fn copilot_device_code() -> Result<DeviceCodeResponse, String> {
    let client = reqwest::Client::new();
    let res = client
        .post("https://github.com/login/device/code")
        .header("Accept", "application/json")
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "client_id": COPILOT_CLIENT_ID }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let data: DeviceCodeResponse = res.json().await.map_err(|e| e.to_string())?;
    if let Some(ref err) = data.error {
        return Err(err.clone());
    }
    Ok(data)
}

#[derive(serde::Serialize, serde::Deserialize)]
struct TokenPollResponse {
    access_token: Option<String>,
    error: Option<String>,
    interval: Option<u64>,
}

#[tauri::command]
async fn copilot_poll_token(device_code: String) -> Result<TokenPollResponse, String> {
    let client = reqwest::Client::new();
    let res = client
        .post("https://github.com/login/oauth/access_token")
        .header("Accept", "application/json")
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "client_id": COPILOT_CLIENT_ID,
            "device_code": device_code,
            "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let data: TokenPollResponse = res.json().await.map_err(|e| e.to_string())?;
    Ok(data)
}

#[derive(serde::Serialize, serde::Deserialize)]
struct CopilotTokenResponse {
    token: String,
    expires_at: u64,
}

#[tauri::command]
async fn copilot_exchange_token(github_token: String) -> Result<CopilotTokenResponse, String> {
    let client = reqwest::Client::new();
    let res = client
        .get("https://api.github.com/copilot_internal/v2/token")
        .header("Authorization", format!("token {}", github_token.trim()))
        .header("Accept", "application/json")
        .header("User-Agent", "GitHubCopilotChat/0.26.7")
        .header("Editor-Version", "vscode/1.99.3")
        .header("Editor-Plugin-Version", "copilot-chat/0.26.7")
        .header("Copilot-Integration-Id", "vscode-chat")
        .send()
        .await
        .map_err(|e| format!("Token exchange failed: {}", e))?;

    let status = res.status();
    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
        return Err("Authentication failed: re-authenticate required".to_string());
    }
    if !status.is_success() {
        return Err(format!("Token exchange failed: HTTP {}", status));
    }

    let data: CopilotTokenResponse = res.json().await.map_err(|e| format!("Token exchange failed: {}", e))?;
    Ok(data)
}

const COPILOT_API_BASE: &str = "https://api.githubcopilot.com";
const COPILOT_API_VERSION: &str = "2026-06-01";

fn copilot_api_headers(session_token: &str) -> Result<reqwest::header::HeaderMap, String> {
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        reqwest::header::AUTHORIZATION,
        format!("Bearer {}", session_token)
            .parse()
            .map_err(|_| "Invalid session token: contains illegal header characters".to_string())?,
    );
    headers.insert(
        "X-GitHub-Api-Version",
        reqwest::header::HeaderValue::from_static(COPILOT_API_VERSION),
    );
    headers.insert(
        reqwest::header::USER_AGENT,
        reqwest::header::HeaderValue::from_static("GitHubCopilotChat/0.26.7"),
    );
    headers.insert(
        "Editor-Version",
        reqwest::header::HeaderValue::from_static("vscode/1.99.3"),
    );
    headers.insert(
        "Editor-Plugin-Version",
        reqwest::header::HeaderValue::from_static("copilot-chat/0.26.7"),
    );
    headers.insert(
        "Copilot-Integration-Id",
        reqwest::header::HeaderValue::from_static("vscode-chat"),
    );
    Ok(headers)
}

#[tauri::command]
async fn copilot_models(session_token: String) -> Result<String, String> {
    let client = reqwest::Client::new();
    let res = client
        .get(format!("{}/models", COPILOT_API_BASE))
        .headers(copilot_api_headers(&session_token)?)
        .send()
        .await
        .map_err(|e| format!("Models fetch failed: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("Models fetch failed: HTTP {}", res.status()));
    }

    res.text().await.map_err(|e| format!("Models fetch failed: {}", e))
}

#[tauri::command]
async fn copilot_chat(
    session_token: String,
    model: String,
    system_prompt: String,
    user_message: String,
) -> Result<String, String> {
    let client = reqwest::Client::new();
    let mut headers = copilot_api_headers(&session_token)?;
    headers.insert(
        reqwest::header::CONTENT_TYPE,
        reqwest::header::HeaderValue::from_static("application/json"),
    );
    headers.insert(
        "X-Initiator",
        reqwest::header::HeaderValue::from_static("user"),
    );
    headers.insert(
        "Openai-Intent",
        reqwest::header::HeaderValue::from_static("conversation-edits"),
    );
    if model.to_lowercase().contains("claude") {
        headers.insert(
            "anthropic-beta",
            reqwest::header::HeaderValue::from_static("interleaved-thinking-2025-05-14"),
        );
    }

    let m = model.to_lowercase();
    let system_role = if m.starts_with("o1")
        || m.starts_with("o3")
        || m.starts_with("o4")
        || m.contains("gpt-5")
    {
        "developer"
    } else {
        "system"
    };

    let mut messages: Vec<serde_json::Value> = Vec::new();
    if !system_prompt.trim().is_empty() {
        messages.push(serde_json::json!({ "role": system_role, "content": system_prompt }));
    }
    messages.push(serde_json::json!({ "role": "user", "content": user_message }));

    let body = serde_json::json!({
        "model": model,
        "messages": messages,
        "stream": false
    });

    let res = client
        .post(format!("{}/chat/completions", COPILOT_API_BASE))
        .headers(headers)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Chat failed: {}", e))?;

    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_else(|_| "<no body>".to_string());
        return Err(format!("Chat failed: HTTP {} — {}", status, body));
    }

    res.text().await.map_err(|e| format!("Chat failed: {}", e))
}

#[tauri::command]
async fn copilot_enable_model(session_token: String, model_id: String) -> Result<bool, String> {
    let client = reqwest::Client::new();
    let mut headers = copilot_api_headers(&session_token)?;
    headers.insert(
        reqwest::header::CONTENT_TYPE,
        reqwest::header::HeaderValue::from_static("application/json"),
    );
    headers.insert(
        "openai-intent",
        reqwest::header::HeaderValue::from_static("chat-policy"),
    );
    headers.insert(
        "x-interaction-type",
        reqwest::header::HeaderValue::from_static("chat-policy"),
    );

    let res = client
        .post(format!("{}/models/{}/policy", COPILOT_API_BASE, model_id))
        .headers(headers)
        .json(&serde_json::json!({ "state": "enabled" }))
        .send()
        .await
        .map_err(|e| format!("Enable model failed: {}", e))?;

    Ok(res.status().is_success())
}

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

fn center_on_same_monitor(
    anchor_win: &tauri::WebviewWindow,
    win_w: f64,
    win_h: f64,
) -> tauri::PhysicalPosition<i32> {
    let anchor_pos = anchor_win
        .outer_position()
        .unwrap_or(tauri::PhysicalPosition::new(0, 0));

    if let Ok(monitors) = anchor_win.available_monitors() {
        for monitor in &monitors {
            let m_pos = monitor.position();
            let m_size = monitor.size();
            let scale = monitor.scale_factor();
            let pw = (win_w * scale) as i32;
            let ph = (win_h * scale) as i32;

            let in_x = anchor_pos.x >= m_pos.x
                && anchor_pos.x < m_pos.x + m_size.width as i32;
            let in_y = anchor_pos.y >= m_pos.y
                && anchor_pos.y < m_pos.y + m_size.height as i32;

            if in_x && in_y {
                return tauri::PhysicalPosition::new(
                    m_pos.x + (m_size.width as i32 - pw) / 2,
                    m_pos.y + (m_size.height as i32 - ph) / 2,
                );
            }
        }

        if let Some(primary) = monitors.first() {
            let m_pos = primary.position();
            let m_size = primary.size();
            let scale = primary.scale_factor();
            let pw = (win_w * scale) as i32;
            let ph = (win_h * scale) as i32;
            return tauri::PhysicalPosition::new(
                m_pos.x + (m_size.width as i32 - pw) / 2,
                m_pos.y + (m_size.height as i32 - ph) / 2,
            );
        }
    }

    tauri::PhysicalPosition::new(0, 0)
}

fn show_settings_window(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("settings") {
        ensure_settings_window_close_handler(app, &win);
        if let Some(main) = app.get_webview_window("main") {
            let pos = center_on_same_monitor(&main, 420.0, 500.0);
            let _ = win.set_position(tauri::Position::Physical(pos));
        }
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
        SETTINGS_OPENING.store(false, Ordering::SeqCst);
        return;
    }

    SETTINGS_OPENING.store(true, Ordering::SeqCst);

    let initial_pos: Option<tauri::PhysicalPosition<i32>> = app
        .get_webview_window("main")
        .map(|main| center_on_same_monitor(&main, 420.0, 500.0));

    let mut builder = WebviewWindowBuilder::new(
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
    .visible(true)
    .skip_taskbar(false);

    if let Some(pos) = initial_pos {
        builder = builder.position(pos.x as f64, pos.y as f64);
    }

    let win = match builder.build() {
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
        .plugin(tauri_plugin_shell::init())
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
            #[cfg(windows)]
            let accessibility_hwnd: isize = app
                .get_webview_window("main")
                .and_then(|w| w.hwnd().ok())
                .map(|h| h.0 as isize)
                .unwrap_or(0);
            #[cfg(not(windows))]
            let accessibility_hwnd: isize = 0;
            os_integration::request_accessibility_if_needed(accessibility_hwnd);

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
                                let w_delayed = w_clone.clone();
                                std::thread::spawn(move || {
                                    std::thread::sleep(std::time::Duration::from_millis(150));
                                    let still_unfocused = w_delayed
                                        .is_focused()
                                        .unwrap_or(false);
                                    if !still_unfocused {
                                        let _ = w_delayed.hide();
                                    }
                                });
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
            get_caret_position,
            copilot_device_code,
            copilot_poll_token,
            copilot_exchange_token,
            copilot_models,
            copilot_chat,
            copilot_enable_model,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
