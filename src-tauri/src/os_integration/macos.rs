use cocoa::appkit::{NSEvent, NSScreen};
use cocoa::base::nil;
use cocoa::foundation::NSRect;
use objc::{msg_send, sel, sel_impl};
use arboard::Clipboard;
use std::thread;
use std::time::Duration;
use std::sync::atomic::{AtomicI32, Ordering};
use core_graphics::event::{CGEvent, CGEventFlags, CGEventTapLocation};
use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};

const KEY_C: u16 = 8;
const KEY_V: u16 = 9;

fn send_cmd_key(key_code: u16) {
    if let Ok(source) = CGEventSource::new(CGEventSourceStateID::HIDSystemState) {
        if let Ok(down) = CGEvent::new_keyboard_event(source.clone(), key_code, true) {
            down.set_flags(CGEventFlags::CGEventFlagCommand);
            down.post(CGEventTapLocation::HID);
        }
        thread::sleep(Duration::from_millis(10));
        if let Ok(up) = CGEvent::new_keyboard_event(source, key_code, false) {
            up.set_flags(CGEventFlags::CGEventFlagCommand);
            up.post(CGEventTapLocation::HID);
        }
    }
}

#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn AXIsProcessTrustedWithOptions(options: *const std::ffi::c_void) -> bool;
}

pub fn request_accessibility_if_needed() {
    unsafe {
        let trusted: bool = {
            let cls_dict = objc::runtime::Class::get("NSDictionary").unwrap();
            let key: *mut objc::runtime::Object = msg_send![
                objc::runtime::Class::get("NSString").unwrap(),
                stringWithUTF8String: b"AXTrustedCheckOptionPrompt\0".as_ptr()
            ];
            let val_no: *mut objc::runtime::Object = msg_send![
                objc::runtime::Class::get("NSNumber").unwrap(),
                numberWithBool: objc::runtime::NO
            ];
            let opts_check: *mut objc::runtime::Object =
                msg_send![cls_dict, dictionaryWithObject: val_no forKey: key];
            AXIsProcessTrustedWithOptions(opts_check as *const std::ffi::c_void)
        };

        if !trusted {
            let _ = std::process::Command::new("tccutil")
                .args(["reset", "Accessibility", "com.gayeonlee.dadumi"])
                .output();

            thread::sleep(Duration::from_millis(200));

            let cls_dict = objc::runtime::Class::get("NSDictionary").unwrap();
            let key: *mut objc::runtime::Object = msg_send![
                objc::runtime::Class::get("NSString").unwrap(),
                stringWithUTF8String: b"AXTrustedCheckOptionPrompt\0".as_ptr()
            ];
            let val_yes: *mut objc::runtime::Object = msg_send![
                objc::runtime::Class::get("NSNumber").unwrap(),
                numberWithBool: objc::runtime::YES
            ];
            let opts_prompt: *mut objc::runtime::Object =
                msg_send![cls_dict, dictionaryWithObject: val_yes forKey: key];
            AXIsProcessTrustedWithOptions(opts_prompt as *const std::ffi::c_void);
        }
    }
}

static SOURCE_APP_PID: AtomicI32 = AtomicI32::new(-1);

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

pub fn get_selected_text() -> Option<String> {
    let mut clipboard = Clipboard::new().ok()?;
    let original = clipboard.get_text().ok();

    let sentinel = "__dadumi_sentinel__";
    let _ = clipboard.set_text(sentinel.to_string());

    send_cmd_key(KEY_C);

    let copied = (0..10).find_map(|_| {
        thread::sleep(Duration::from_millis(50));
        clipboard.get_text().ok().filter(|s| s != sentinel && !s.is_empty())
    });

    match original {
        Some(orig) if orig != sentinel => { let _ = clipboard.set_text(orig); }
        _ => { let _ = clipboard.set_text("".to_string()); }
    }

    copied
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
                msg_send![app, activateWithOptions: 0x03_u64];
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

pub fn paste_text(text: String) -> bool {
    let mut clipboard = match Clipboard::new() {
        Ok(c) => c,
        Err(_) => return false,
    };

    let original = clipboard.get_text().ok();

    if clipboard.set_text(text).is_err() {
        return false;
    }

    send_cmd_key(KEY_V);
    thread::sleep(Duration::from_millis(300));

    match original {
        Some(orig) => { let _ = clipboard.set_text(orig); }
        None => { let _ = clipboard.set_text("".to_string()); }
    }

    true
}
