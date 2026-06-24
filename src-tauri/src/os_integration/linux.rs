use arboard::Clipboard;
use std::thread;
use std::time::Duration;

pub fn get_mouse_position() -> (f64, f64) {
    (0.0, 0.0)
}

pub fn get_selected_text() -> Option<String> {
    let mut clipboard = Clipboard::new().ok()?;
    let original = clipboard.get_text().ok();
    let _ = clipboard.set_text("".to_string());

    let _ = std::process::Command::new("xdotool")
        .args(["key", "--clearmodifiers", "ctrl+c"])
        .output();

    thread::sleep(Duration::from_millis(150));

    let copied = clipboard.get_text().ok().filter(|s| !s.is_empty());

    if let Some(orig) = original {
        let _ = clipboard.set_text(orig);
    } else {
        let _ = clipboard.set_text("".to_string());
    }

    copied
}

pub fn paste_text(text: String) -> bool {
    let mut clipboard = match Clipboard::new() {
        Ok(c) => c,
        Err(_) => return false,
    };

    let original = clipboard.get_text().ok();

    if clipboard.set_text(text).is_err() {
        return false;
    }

    thread::sleep(Duration::from_millis(50));

    let _ = std::process::Command::new("xdotool")
        .args(["key", "--clearmodifiers", "ctrl+v"])
        .output();

    thread::sleep(Duration::from_millis(150));

    if let Some(orig) = original {
        let _ = clipboard.set_text(orig);
    } else {
        let _ = clipboard.set_text("".to_string());
    }

    true
}

pub fn save_source_pid() {}
pub fn restore_source_app() {}
