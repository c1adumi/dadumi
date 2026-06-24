# Dadumi — Frontend API Guide

> For writing test code. Covers every public function, event, IPC command, localStorage key, and component interface exposed by the frontend.

---

## Table of Contents

1. [tauriBridge.ts — Core API](#tauribridgets--core-api)
2. [Tauri IPC Commands](#tauri-ipc-commands)
3. [Tauri Events](#tauri-events)
4. [FloatingMenu Component](#floatingmenu-component)
5. [App Component](#app-component)
6. [localStorage Keys](#localstorage-keys)
7. [Gemini API Integration](#gemini-api-integration)
8. [Browser Simulator (Mock Mode)](#browser-simulator-mock-mode)
9. [Test Patterns & Examples](#test-patterns--examples)

---

## `tauriBridge.ts` — Core API

**Path**: `src/utils/tauriBridge.ts`

All Tauri/OS interactions must go through this module. **Never import `@tauri-apps/api` directly** — the bridge provides browser mock fallbacks so tests run without a Tauri runtime.

---

### `isTauri(): boolean`

Returns `true` when the app is running inside a Tauri container (detects `window.__TAURI_INTERNALS__`).

```ts
import { isTauri } from "./utils/tauriBridge";

isTauri(); // false in browser/test, true in Tauri desktop
```

---

### `invokeCmd(command, args?): Promise<any>`

Invokes a Tauri IPC command. Falls back to mock responses in browser/test mode.

```ts
import { invokeCmd } from "./utils/tauriBridge";

// In Tauri: calls real Rust command
// In browser: returns mock response (see mock table below)
const result = await invokeCmd("get_caret_position");
// → { x: number, y: number }

await invokeCmd("paste_text", { text: "Hello world" });
// → true (browser: shows alert + console log)

await invokeCmd("hide_window");
// → true (browser: console log only)
```

**Mock return values by command** (browser / test environment):

| Command | Mock Return Value | Side Effect |
|---|---|---|
| `get_caret_position` | `{ x: window.innerWidth / 2 - 250, y: window.innerHeight / 2 - 180 }` | None |
| `paste_text` | `true` | `alert()` + `console.log` |
| `hide_window` | `true` | `console.log` |
| `stream_completion` | `null` (unimplemented) | None |
| *(any other)* | `null` | None |

> **Testing tip**: spy on `invokeCmd` to assert the right command and args are passed without triggering real OS operations.

---

### `listenEvent(eventName, handler): Promise<() => void>`

Registers a listener for a Tauri event (or mock event in browser). Returns a cleanup/unsubscribe function.

```ts
import { listenEvent } from "./utils/tauriBridge";

const unsubscribe = await listenEvent("selection-captured", (payload) => {
  console.log(payload.text);    // selected text string
  console.log(payload.app_name); // source app name
});

// Later: clean up
unsubscribe();
```

**Payload type for `"selection-captured"`**:

```ts
interface SelectionCapturedPayload {
  text: string;      // The selected text from the focused app
  app_name: string;  // Name of the app where text was selected
}
```

---

### `triggerMockEvent(eventName, payload): void`

Fires a mock event in browser mode. **No-op inside Tauri.** Used by the browser simulator and test code.

```ts
import { triggerMockEvent } from "./utils/tauriBridge";

// Simulate the user pressing Option+Space in another app
triggerMockEvent("selection-captured", {
  text: "This is the selected text to rewrite.",
  app_name: "Slack",
});
```

> Use this as your primary way to drive the overlay in tests — it's the exact mechanism the simulator uses.

---

## Tauri IPC Commands

Defined in `src-tauri/src/lib.rs`. Called via `invokeCmd()`.

| Command | Args | Return | Description |
|---|---|---|---|
| `greet` | `{ name: string }` | `string` | Debug only, unused in prod |
| `hide_window` | — | `true` | Hides the Tauri overlay window |
| `paste_text` | `{ text: string }` | `true` | Hides window → 150ms delay → OS paste (Cmd+V) |
| `get_caret_position` | — | `{ x: number, y: number }` | Returns current mouse position (caret tracking TODO) |
| `stream_completion` | `{ instruction: string, text: string }` | — | Rust-side LLM stream (not yet implemented; app falls back to direct HTTP) |

---

## Tauri Events

Events emitted **from Rust → JavaScript** via `window.emit()`.

### `"selection-captured"`

Emitted when the user presses `Option+Space` / `Alt+Space` and Rust captures selected text.

```ts
// Payload shape
{
  text: string;      // Selected text (empty string if nothing selected)
  app_name: string;  // The app where the hotkey was pressed
}
```

**Listener registration** (done in `App.tsx`):

```ts
await listenEvent("selection-captured", (payload) => {
  setSelectionText(payload.text);
  setIsOpen(true);
});
```

---

## `FloatingMenu` Component

**Path**: `src/components/FloatingMenu.tsx`

The entire overlay UI. Receives selection text and emits a hide callback.

### Props

```ts
interface FloatingMenuProps {
  selectionText: string; // Text captured from the user's active app
  onHide: () => void;    // Called when the overlay should close
}
```

### Internal State (reference for testing)

| State | Type | Default | Description |
|---|---|---|---|
| `customPrompt` | `string` | `""` | Value of the custom instruction input |
| `streamedText` | `string` | `""` | Accumulated AI response text |
| `isGenerating` | `boolean` | `false` | Whether an AI stream is in-flight |
| `showSettings` | `boolean` | `false` | Whether the settings panel is open |
| `copySuccess` | `boolean` | `false` | Transient "Copied!" feedback state (resets after 2s) |
| `apiKey` | `string` | `localStorage` | Gemini API key |
| `model` | `string` | `"gemini-2.5-flash"` | Selected Gemini model |
| `systemPrompt` | `string` | *(default instruction)* | System-level AI instruction |

### Preset Actions

Defined inline in the component. Each calls `handleAIQuery(instruction)` on click.

| `id` | Button Label | Full Instruction Sent to Gemini |
|---|---|---|
| `grammar` | Fix Grammar | `"Correct any spelling, grammatical, or punctuation errors in this text while keeping the exact meaning and tone unchanged."` |
| `improve` | Improve Writing | `"Improve the clarity, vocabulary, flow, and overall quality of this text. Ensure it sounds polished and natural."` |
| `professional` | Professional Tone | `"Rewrite this text in a professional, polite, and clear business tone, suitable for emails, Slack, and reports."` |
| `continue` | Continue Writing | `"Using the text below as the start, write the next 1-2 logical sentences, matching the style and flow."` |

Preset buttons are **disabled** when `isGenerating === true` or `selectionText === ""`.

### Key Handlers

#### `handleAIQuery(instruction: string): Promise<void>`

Starts a Gemini SSE stream. Sets `isGenerating = true`, accumulates chunks into `streamedText`, sets `isGenerating = false` on finish/abort.

#### `handleStop(): void`

Aborts the in-flight stream via `AbortController`. Sets `isGenerating = false`.

#### `handlePasteBack(): Promise<void>`

Calls `invokeCmd("paste_text", { text: streamedText || selectionText })`, then calls `onHide()`.

#### `handleCopyToClipboard(): void`

Writes `streamedText || selectionText` to `navigator.clipboard`. Sets `copySuccess = true` for 2 seconds.

#### `saveSettings(newKey, newModel, newSys): void`

Updates all three settings states and persists them to `localStorage`.

---

## `App` Component

**Path**: `src/App.tsx`

Root component. Manages overlay open/close state and wires up the Tauri event listener.

### State

| State | Type | Description |
|---|---|---|
| `selectionText` | `string` | Text received from `"selection-captured"` event |
| `isOpen` | `boolean` | Controls whether `FloatingMenu` is rendered |
| `mockActiveApp` | `string` | Simulator: active app name (default: `"Google Chrome"`) |
| `mockSelectionInput` | `string` | Simulator: text to inject on hotkey trigger |

### Key Functions

#### `handleHide(): void`

Sets `isOpen = false` and calls `invokeCmd("hide_window")`.

#### `handleSimulateTrigger(): void`

Fires `triggerMockEvent("selection-captured", { text: mockSelectionInput, app_name: mockActiveApp })`. Same as pressing `Alt+Space` in the browser.

### Keyboard shortcuts (browser mode only)

| Key | Action |
|---|---|
| `Alt + Space` | Trigger mock `"selection-captured"` event |
| `Escape` | Close overlay (`setIsOpen(false)`) |

---

## `localStorage` Keys

All keys are prefixed with `dadumi_`. Never access these keys without the prefix.

| Key | Type | Default Value | Description |
|---|---|---|---|
| `dadumi_gemini_api_key` | `string` | `""` | Gemini API key |
| `dadumi_gemini_model` | `string` | `"gemini-2.5-flash"` | Active Gemini model ID |
| `dadumi_system_prompt` | `string` | *(writing assistant default)* | System instruction prepended to every Gemini request |

**Default system prompt value**:
```
You are a helpful writing assistant. Respond ONLY with the requested text edit or completion, without any intro, outro, explanations, markdown code blocks, or conversational filler.
```

---

## Gemini API Integration

Called directly from the WebView (no Rust proxy) when `apiKey` is set.

### Endpoint

```
POST https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse&key={apiKey}
```

### Request Body

```json
{
  "contents": [
    {
      "parts": [{ "text": "<assembled prompt>" }]
    }
  ]
}
```

### Assembled Prompt Format

```
{systemPrompt}

Task: {instruction}

Input Text:
"""
{selectionText}
"""

Final Output:
```

### SSE Response Parsing

- Lines prefixed with `data:` are JSON payloads.
- Text chunk path: `candidates[0].content.parts[0].text`
- `[DONE]` sentinel is skipped gracefully.
- Parse errors on partial chunks are silently ignored.

### Available Models

| Model ID | Label |
|---|---|
| `gemini-2.5-flash` | Gemini 2.5 Flash (Fastest) — **default** |
| `gemini-2.5-pro` | Gemini 2.5 Pro (Analytical) |
| `gemini-1.5-flash` | Gemini 1.5 Flash (Older Fast) |
| `gemini-1.5-pro` | Gemini 1.5 Pro (Older Quality) |

### Error States

- **No API key**: `streamedText` is set to `"⚠️ Error: Please open settings (⚙️) and enter your Gemini API Key first."`
- **HTTP error**: throws with message from `error.message` in the JSON body or `HTTP error {status}`.
- **Abort**: `err.name === "AbortError"` — silent, `isGenerating` reset to `false`.
- **Stream error**: appended to `streamedText` as `"\n\n⚠️ Error during generation: {message}"`.

The `result-panel` div gets class `error-state` when `streamedText` contains `"⚠️"` or `"Error"`.

---

## Browser Simulator (Mock Mode)

Activated automatically when `isTauri()` returns `false` (i.e., `npm run dev`).

### DevSimulatorBar (rendered in `App.tsx`)

| UI Element | Purpose |
|---|---|
| **Simulate App** dropdown | Sets `mockActiveApp` (Chrome, Slack, Notion, MS Word, Terminal) |
| **Mock Selection** input | Sets `mockSelectionInput` — the text that will be "selected" |
| **Trigger Hotkey** button | Calls `handleSimulateTrigger()` → fires mock event |
| `Alt + Space` keyboard shortcut | Same as the button |

### Mocked `invokeCmd` behavior in tests

```ts
// paste_text → shows alert() and logs to console
await invokeCmd("paste_text", { text: "result" });

// hide_window → console.log only, no real window operation
await invokeCmd("hide_window");

// get_caret_position → returns center of current viewport
const pos = await invokeCmd("get_caret_position");
// { x: window.innerWidth / 2 - 250, y: window.innerHeight / 2 - 180 }
```

---

## Test Patterns & Examples

### 1. Triggering the overlay

```ts
import { triggerMockEvent } from "../utils/tauriBridge";

// Simulate Option+Space with selected text
triggerMockEvent("selection-captured", {
  text: "Fix this sentance please.",
  app_name: "Notion",
});
// → App sets isOpen=true, FloatingMenu renders with selectionText
```

### 2. Spying on IPC commands

```ts
import * as bridge from "../utils/tauriBridge";

const spy = vi.spyOn(bridge, "invokeCmd").mockResolvedValue(true);

// Trigger paste-back action (e.g. click "Insert / Replace" button)
// Then assert:
expect(spy).toHaveBeenCalledWith("paste_text", { text: "expected output" });
```

### 3. Mocking localStorage for settings

```ts
beforeEach(() => {
  localStorage.setItem("dadumi_gemini_api_key", "test-api-key");
  localStorage.setItem("dadumi_gemini_model", "gemini-2.5-flash");
  localStorage.setItem(
    "dadumi_system_prompt",
    "You are a helpful writing assistant..."
  );
});

afterEach(() => {
  localStorage.clear();
});
```

### 4. Mocking the Gemini SSE stream

```ts
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  body: {
    getReader: () => ({
      read: vi
        .fn()
        .mockResolvedValueOnce({
          value: new TextEncoder().encode(
            'data: {"candidates":[{"content":{"parts":[{"text":"Fixed sentence."}]}}]}\n'
          ),
          done: false,
        })
        .mockResolvedValueOnce({ value: undefined, done: true }),
    }),
  },
});
```

### 5. Testing event listener cleanup

```ts
import { listenEvent } from "../utils/tauriBridge";

const handler = vi.fn();
const unsubscribe = await listenEvent("selection-captured", handler);

triggerMockEvent("selection-captured", { text: "hello", app_name: "Chrome" });
expect(handler).toHaveBeenCalledTimes(1);

unsubscribe(); // Remove listener

triggerMockEvent("selection-captured", { text: "world", app_name: "Chrome" });
expect(handler).toHaveBeenCalledTimes(1); // Not called again
```

### 6. Checking `isTauri()` branching

```ts
import * as bridge from "../utils/tauriBridge";

// Force Tauri mode
vi.spyOn(bridge, "isTauri").mockReturnValue(true);

// Force browser mode  
vi.spyOn(bridge, "isTauri").mockReturnValue(false);
```

---

> **See also**: [`AGENTS.md`](../.opencode/AGENTS.md) for full project architecture, [`DESIGN.md`](../DESIGN.md) for design system tokens.
