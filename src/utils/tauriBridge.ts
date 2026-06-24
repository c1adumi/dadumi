// Tauri Bridge to support browser preview fallback

const isTauriVal = typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__ !== undefined;

// Registry for mock event listeners
const mockListeners: { [eventName: string]: ((event: { payload: any }) => void)[] } = {};

/**
 * Checks if the application is running inside a Tauri container.
 */
export function isTauri(): boolean {
  return isTauriVal;
}

/**
 * Invokes a Tauri IPC command, falling back to mock implementation in the browser.
 */
export async function invokeCmd(command: string, args?: any): Promise<any> {
  if (isTauriVal) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke(command, args);
  }

  // Mock implementation for browser development
  console.log(`[Tauri Mock] Invoke command: "${command}"`, args);

  switch (command) {
    case "get_caret_position":
      return { x: window.innerWidth / 2 - 250, y: window.innerHeight / 2 - 180 };
    case "paste_text":
      console.log(`%c[Pasted Back]%c: "${args?.text}"`, "color: #8B5CF6; font-weight: bold", "color: inherit");
      alert(`[Tauri Mock Paste Back]\n\nInserted Text:\n"${args?.text}"`);
      return true;
    case "hide_window":
      console.log("[Tauri Mock] Window hidden");
      return true;
    default:
      return null;
  }
}

/**
 * Listens to a Tauri event, falling back to mock registry in the browser.
 */
export async function listenEvent(
  eventName: string,
  handler: (payload: any) => void
): Promise<() => void> {
  if (isTauriVal) {
    const { listen } = await import("@tauri-apps/api/event");
    return listen(eventName, (event: any) => {
      handler(event.payload);
    });
  }

  // Mock implementation
  if (!mockListeners[eventName]) {
    mockListeners[eventName] = [];
  }

  const wrappedHandler = (event: { payload: any }) => handler(event.payload);
  mockListeners[eventName].push(wrappedHandler);

  console.log(`[Tauri Mock] Registered listener for event: "${eventName}"`);

  return () => {
    mockListeners[eventName] = mockListeners[eventName].filter((h) => h !== wrappedHandler);
    console.log(`[Tauri Mock] Unsubscribed listener from event: "${eventName}"`);
  };
}

/**
 * Triggers a mock event in the browser. Used by the simulator overlay.
 */
export function triggerMockEvent(eventName: string, payload: any) {
  if (isTauriVal) return;
  console.log(`[Tauri Mock] Triggering event "${eventName}" with payload:`, payload);
  const listeners = mockListeners[eventName] || [];
  listeners.forEach((handler) => handler({ payload }));
}
