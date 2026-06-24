use windows_sys::Win32::Foundation::POINT;
use windows_sys::Win32::UI::WindowsAndMessaging::GetCursorPos;

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

pub fn get_selected_text() -> Option<String> {
    None
}

pub fn paste_text(_text: String) -> bool {
    false
}

pub fn save_source_pid() {}
pub fn restore_source_app() {}
