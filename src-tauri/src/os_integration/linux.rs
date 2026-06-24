use arboard::Clipboard;
use std::thread;
use std::time::Duration;
use std::sync::atomic::{AtomicU64, Ordering};

static SOURCE_WID: AtomicU64 = AtomicU64::new(0);

pub fn get_mouse_position() -> (f64, f64) {
    let output = std::process::Command::new("xdotool")
        .args(["getmouselocation", "--shell"])
        .output();

    if let Ok(out) = output {
        let text = String::from_utf8_lossy(&out.stdout);
        let x = text.lines()
            .find(|l| l.starts_with("X="))
            .and_then(|l| l[2..].parse::<f64>().ok())
            .unwrap_or(0.0);
        let y = text.lines()
            .find(|l| l.starts_with("Y="))
            .and_then(|l| l[2..].parse::<f64>().ok())
            .unwrap_or(0.0);
        return (x, y);
    }

    (0.0, 0.0)
}

pub fn get_selected_text() -> Option<String> {
    let mut clipboard = Clipboard::new().ok()?;
    let original = clipboard.get_text().ok();

    let sentinel = "__dadumi_sentinel__";
    let _ = clipboard.set_text(sentinel.to_string());

    let _ = std::process::Command::new("xdotool")
        .args(["key", "--clearmodifiers", "ctrl+c"])
        .output();

    let copied = (0..8).find_map(|_| {
        thread::sleep(Duration::from_millis(50));
        clipboard.get_text().ok().filter(|s| s != sentinel && !s.is_empty())
    });

    match original {
        Some(orig) if orig != sentinel => { let _ = clipboard.set_text(orig); }
        _ => { let _ = clipboard.set_text("".to_string()); }
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

    thread::sleep(Duration::from_millis(300));

    match original {
        Some(orig) => { let _ = clipboard.set_text(orig); }
        None => { let _ = clipboard.set_text("".to_string()); }
    }

    true
}

pub fn save_source_pid() {
    if let Ok(out) = std::process::Command::new("xdotool")
        .args(["getactivewindow"])
        .output()
    {
        if let Ok(wid) = String::from_utf8_lossy(&out.stdout).trim().parse::<u64>() {
            SOURCE_WID.store(wid, Ordering::Relaxed);
        }
    }
}

pub fn restore_source_app() {
    let wid = SOURCE_WID.load(Ordering::Relaxed);
    if wid != 0 {
        let _ = std::process::Command::new("xdotool")
            .args(["windowfocus", "--sync", &wid.to_string()])
            .output();
        thread::sleep(Duration::from_millis(50));
    }
}
