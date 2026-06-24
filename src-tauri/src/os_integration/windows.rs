use arboard::Clipboard;
use std::thread;
use std::time::Duration;
use std::sync::atomic::{AtomicI64, Ordering};
use windows_sys::Win32::Foundation::POINT;
use windows_sys::Win32::UI::WindowsAndMessaging::{
    GetCursorPos, GetForegroundWindow, SetForegroundWindow, GetWindowThreadProcessId,
};
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP,
    VK_C, VK_V, VK_CONTROL,
};
use windows_sys::Win32::System::Threading::GetCurrentProcessId;

static SOURCE_HWND: AtomicI64 = AtomicI64::new(0);

pub fn get_mouse_position() -> (f64, f64) {
    unsafe {
        let mut point = POINT { x: 0, y: 0 };
        if GetCursorPos(&mut point) != 0 {
            (point.x as f64, point.y as f64)
        } else {
            (0.0, 0.0)
        }
    }
}

fn kbd_input(vk: u16, flags: u32) -> INPUT {
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: windows_sys::Win32::UI::Input::KeyboardAndMouse::INPUT_0 {
            ki: KEYBDINPUT {
                wVk: vk,
                wScan: 0,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    }
}

fn simulate_ctrl_key(vk: u16) {
    let inputs = [
        kbd_input(VK_CONTROL, 0),
        kbd_input(vk, 0),
        kbd_input(vk, KEYEVENTF_KEYUP),
        kbd_input(VK_CONTROL, KEYEVENTF_KEYUP),
    ];
    unsafe {
        SendInput(
            inputs.len() as u32,
            inputs.as_ptr(),
            std::mem::size_of::<INPUT>() as i32,
        );
    }
}

pub fn get_selected_text() -> Option<String> {
    let mut clipboard = Clipboard::new().ok()?;
    let original = clipboard.get_text().ok();

    let sentinel = "__dadumi_sentinel__";
    let _ = clipboard.set_text(sentinel.to_string());

    simulate_ctrl_key(VK_C);

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
    simulate_ctrl_key(VK_V);
    thread::sleep(Duration::from_millis(300));

    match original {
        Some(orig) => { let _ = clipboard.set_text(orig); }
        None => { let _ = clipboard.set_text("".to_string()); }
    }

    true
}

pub fn save_source_pid() {
    unsafe {
        let hwnd = GetForegroundWindow();
        SOURCE_HWND.store(hwnd as i64, Ordering::Relaxed);
    }
}

pub fn restore_source_app() {
    unsafe {
        let hwnd = SOURCE_HWND.load(Ordering::Relaxed) as windows_sys::Win32::Foundation::HWND;
        if hwnd != 0 {
            let mut pid = 0u32;
            GetWindowThreadProcessId(hwnd, &mut pid);
            let current = GetCurrentProcessId();
            if pid != current {
                SetForegroundWindow(hwnd);
            }
        }
    }
}
