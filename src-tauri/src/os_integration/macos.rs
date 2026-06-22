use cocoa::appkit::{NSEvent, NSScreen};
use cocoa::base::nil;
use cocoa::foundation::NSRect;
use core_graphics::event::{CGEvent, CGEventFlags, CGKeyCode};
use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};
use arboard::Clipboard;
use std::thread;
use std::time::Duration;

// Virtual keycodes on macOS
const VK_C: CGKeyCode = 8;
const VK_V: CGKeyCode = 9;

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
    
    // 1. Backup existing clipboard content
    let original_content = clipboard.get_text().ok();
    
    // 2. Clear clipboard text to detect if new text gets copied
    let _ = clipboard.set_text("".to_string());
    
    // 3. Emulate Cmd + C
    simulate_command_key(VK_C);
    
    // 4. Give the OS and active app some time to process the shortcut and update clipboard
    thread::sleep(Duration::from_millis(150));
    
    // 5. Read the captured selection from the clipboard
    let copied_text = clipboard.get_text().ok().filter(|s| !s.is_empty());
    
    // 6. Restore original clipboard content
    if let Some(orig) = original_content {
        let _ = clipboard.set_text(orig);
    } else {
        let _ = clipboard.set_text("".to_string());
    }
    
    copied_text
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
    
    // 4. Wait for the target application to read from the clipboard and perform the paste
    thread::sleep(Duration::from_millis(150));
    
    // 5. Restore original clipboard content
    if let Some(orig) = original_content {
        let _ = clipboard.set_text(orig);
    } else {
        let _ = clipboard.set_text("".to_string());
    }
    
    true
}
