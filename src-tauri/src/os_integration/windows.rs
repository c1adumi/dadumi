use arboard::Clipboard;
use std::thread;
use std::time::Duration;
use std::sync::atomic::{AtomicIsize, Ordering};
use windows_sys::Win32::Foundation::{POINT, CloseHandle};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    GetCursorPos, GetForegroundWindow, SetForegroundWindow, GetWindowThreadProcessId,
    MessageBoxW, MB_OK, MB_ICONWARNING,
};
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP,
    VK_C, VK_V, VK_CONTROL, VK_MENU,
};
use windows_sys::Win32::System::Threading::{GetCurrentProcessId, OpenProcessToken, GetCurrentProcess};
use windows_sys::Win32::Security::{GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY};

static SOURCE_HWND: AtomicIsize = AtomicIsize::new(0);

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

fn simulate_ctrl_key(vk: u16) -> bool {
    unsafe {
        let alt_up = kbd_input(VK_MENU, KEYEVENTF_KEYUP);
        SendInput(1, &alt_up, std::mem::size_of::<INPUT>() as i32);
        thread::sleep(Duration::from_millis(10));
    }
    let inputs = [
        kbd_input(VK_CONTROL, 0),
        kbd_input(vk, 0),
        kbd_input(vk, KEYEVENTF_KEYUP),
        kbd_input(VK_CONTROL, KEYEVENTF_KEYUP),
    ];
    unsafe {
        let sent = SendInput(
            inputs.len() as u32,
            inputs.as_ptr(),
            std::mem::size_of::<INPUT>() as i32,
        );
        sent == inputs.len() as u32
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

    match &original {
        Some(orig) if orig != sentinel => { let _ = clipboard.set_text(orig.clone()); }
        _ => {}
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
    thread::sleep(Duration::from_millis(500));

    if let Some(orig) = original {
        let _ = clipboard.set_text(orig);
    }

    true
}

pub fn save_source_pid() {
    unsafe {
        let hwnd = GetForegroundWindow();
        SOURCE_HWND.store(hwnd as isize, Ordering::Release);
    }
}

pub fn restore_source_app() {
    unsafe {
        let hwnd = SOURCE_HWND.load(Ordering::Acquire) as windows_sys::Win32::Foundation::HWND;
        if hwnd == 0 { return; }

        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, &mut pid);
        let current = GetCurrentProcessId();
        if pid != current {
            let alt_down = kbd_input(VK_MENU, 0);
            let alt_up = kbd_input(VK_MENU, KEYEVENTF_KEYUP);
            SendInput(1, &alt_down, std::mem::size_of::<INPUT>() as i32);
            SetForegroundWindow(hwnd);
            SendInput(1, &alt_up, std::mem::size_of::<INPUT>() as i32);
        }
    }
}

pub fn request_accessibility_if_needed() {
    if is_elevated() {
        thread::spawn(|| unsafe {
            let msg: Vec<u16> = "Dadumi is running as administrator.\nText capture may not work in non-elevated apps.\nConsider running Dadumi without administrator privileges."
                .encode_utf16().chain(std::iter::once(0)).collect();
            let title: Vec<u16> = "Dadumi – Notice"
                .encode_utf16().chain(std::iter::once(0)).collect();
            MessageBoxW(0isize as _, msg.as_ptr(), title.as_ptr(), MB_OK | MB_ICONWARNING);
        });
    }
}

fn is_elevated() -> bool {
    unsafe {
        let mut token = 0isize;
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) == 0 {
            return false;
        }
        let mut elevation = TOKEN_ELEVATION { TokenIsElevated: 0 };
        let mut size = std::mem::size_of::<TOKEN_ELEVATION>() as u32;
        let ok = GetTokenInformation(
            token,
            TokenElevation,
            &mut elevation as *mut _ as *mut _,
            size,
            &mut size,
        );
        CloseHandle(token);
        ok != 0 && elevation.TokenIsElevated != 0
    }
}
