use cocoa::appkit::{NSEvent, NSScreen};
use cocoa::base::nil;
use cocoa::foundation::NSRect;
use core_graphics::event::{CGEvent, CGEventFlags, CGKeyCode};
use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};
use objc::{msg_send, sel, sel_impl};
use arboard::Clipboard;
use std::thread;
use std::time::Duration;
use std::sync::atomic::{AtomicI32, Ordering};

const VK_C: CGKeyCode = 8;
const VK_V: CGKeyCode = 9;

#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn AXIsProcessTrustedWithOptions(options: *const std::ffi::c_void) -> bool;
}

pub fn request_accessibility_if_needed() {
    unsafe {
        let cls = objc::runtime::Class::get("NSDictionary").unwrap();
        let key: *mut objc::runtime::Object = msg_send![
            objc::runtime::Class::get("NSString").unwrap(),
            stringWithUTF8String: b"AXTrustedCheckOptionPrompt\0".as_ptr()
        ];
        let val: *mut objc::runtime::Object = msg_send![
            objc::runtime::Class::get("NSNumber").unwrap(),
            numberWithBool: objc::runtime::YES
        ];
        let options: *mut objc::runtime::Object =
            msg_send![cls, dictionaryWithObject: val forKey: key];
        AXIsProcessTrustedWithOptions(options as *const std::ffi::c_void);
    }
}

/// Stores the PID of the app that was frontmost when text was captured.
static SOURCE_APP_PID: AtomicI32 = AtomicI32::new(-1);

/// Synthesizes and posts a keyboard event with Command modifier
fn simulate_command_key(key_code: CGKeyCode) {
    let source = CGEventSource::new(CGEventSourceStateID::HIDSystemState)
        .unwrap_or_else(|_| CGEventSource::new(CGEventSourceStateID::CombinedSessionState).unwrap());

    // Key Down event
    if let Ok(event_down) = CGEvent::new_keyboard_event(source.clone(), key_code, true) {
        event_down.set_flags(CGEventFlags::CGEventFlagCommand);
        event_down.post(core_graphics::event::CGEventTapLocation::HID);
    }
    
    thread::sleep(Duration::from_millis(10));

    // Key Up event
    if let Ok(event_up) = CGEvent::new_keyboard_event(source, key_code, false) {
        event_up.set_flags(CGEventFlags::CGEventFlagCommand);
        event_up.post(core_graphics::event::CGEventTapLocation::HID);
    }
}

/// Retrieve the current mouse cursor coordinates, flipping the Y axis to match top-left origins
pub fn get_mouse_position() -> (f64, f64) {
    unsafe {
        let mouse_loc = NSEvent::mouseLocation(nil);
        let screen = NSScreen::mainScreen(nil);
        if screen == nil {
            return (mouse_loc.x, mouse_loc.y);
        }
        let frame: NSRect = screen.frame();
        let screen_height = frame.size.height;
        (mouse_loc.x, screen_height - mouse_loc.y)
    }
}

/// Captures the highlighted text from the current active application.
/// It uses clipboard backup and restore mechanism to bypass clipboard pollution.
pub fn get_selected_text() -> Option<String> {
    let mut clipboard = Clipboard::new().ok()?;

    let original_content = clipboard.get_text().ok();

    let sentinel = "__dadumi_sentinel__";
    let _ = clipboard.set_text(sentinel.to_string());

    simulate_command_key(VK_C);

    let copied_text = (0..8).find_map(|_| {
        thread::sleep(Duration::from_millis(50));
        clipboard.get_text().ok().filter(|s| s != sentinel && !s.is_empty())
    });

    match original_content {
        Some(orig) if orig != sentinel => { let _ = clipboard.set_text(orig); }
        _ => { let _ = clipboard.set_text("".to_string()); }
    }

    copied_text
}

pub fn get_frontmost_pid() -> i32 {
    unsafe {
        let cls = objc::runtime::Class::get("NSWorkspace").unwrap();
        let workspace: *mut objc::runtime::Object = msg_send![cls, sharedWorkspace];
        let app: *mut objc::runtime::Object = msg_send![workspace, frontmostApplication];
        msg_send![app, processIdentifier]
    }
}

pub fn activate_pid(pid: i32) {
    unsafe {
        let cls = objc::runtime::Class::get("NSRunningApplication").unwrap();
        let app: *mut objc::runtime::Object =
            msg_send![cls, runningApplicationWithProcessIdentifier: pid];
        if !app.is_null() {
            let _: objc::runtime::BOOL =
                msg_send![app, activateWithOptions: 0x03_u64]; // NSApplicationActivateIgnoringOtherApps | NSApplicationActivateAllWindows
        }
    }
}

pub fn save_source_pid() {
    SOURCE_APP_PID.store(get_frontmost_pid(), Ordering::Relaxed);
}

pub fn restore_source_app() {
    let pid = SOURCE_APP_PID.load(Ordering::Relaxed);
    if pid > 0 {
        activate_pid(pid);
    }
}

/// Inserts the provided text into the active application by writing it to the clipboard,
/// simulating Cmd + V, and restoring the original clipboard content.
pub fn paste_text(text: String) -> bool {
    let mut clipboard = match Clipboard::new() {
        Ok(c) => c,
        Err(_) => return false,
    };
    
    // 1. Backup existing clipboard content
    let original_content = clipboard.get_text().ok();
    
    // 2. Set target text to clipboard
    if clipboard.set_text(text).is_err() {
        return false;
    }
    
    // 3. Emulate Cmd + V
    simulate_command_key(VK_V);

    thread::sleep(Duration::from_millis(300));
    
    // 5. Restore original clipboard content
    if let Some(orig) = original_content {
        let _ = clipboard.set_text(orig);
    } else {
        let _ = clipboard.set_text("".to_string());
    }
    
    true
}
