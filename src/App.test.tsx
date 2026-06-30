import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { SettingsProvider } from "./context/SettingsContext";
import * as tauriBridge from "./utils/tauriBridge";

type EventHandler = (payload: unknown) => void;
const eventHandlers: Map<string, EventHandler[]> = new Map();

vi.mock("./utils/tauriBridge", () => ({
  isTauri: vi.fn(() => false),
  invokeCmd: vi.fn().mockResolvedValue(true),
  listenEvent: vi.fn(async (event: string, handler: EventHandler) => {
    if (!eventHandlers.has(event)) {
      eventHandlers.set(event, []);
    }
    eventHandlers.get(event)!.push(handler);
    return () => {
      const handlers = eventHandlers.get(event);
      if (handlers) {
        const idx = handlers.indexOf(handler);
        if (idx !== -1) handlers.splice(idx, 1);
      }
    };
  }),
  triggerMockEvent: vi.fn((event: string, payload: unknown) => {
    const handlers = eventHandlers.get(event);
    if (handlers) {
      handlers.forEach((h) => h(payload));
    }
  }),
}));

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

function renderApp() {
  return render(
    <SettingsProvider>
      <App />
    </SettingsProvider>
  );
}

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eventHandlers.clear();
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ output: { message: { content: [{ text: "response" }] } } }))
    );
  });

  describe("browser simulator mode", () => {
    it("shows simulator bar when not in Tauri", () => {
      renderApp();

      expect(screen.getByText("Browser Simulator Mode")).toBeInTheDocument();
    });

    it("shows app selector dropdown", () => {
      renderApp();

      expect(screen.getByText("Google Chrome")).toBeInTheDocument();
      expect(screen.getByRole("combobox")).toBeInTheDocument();
    });

    it("shows mock selection input", () => {
      renderApp();

      const input = screen.getByPlaceholderText("Type highlighted text here...");
      expect(input).toBeInTheDocument();
    });

    it("shows Trigger Hotkey button", () => {
      renderApp();

      expect(screen.getByRole("button", { name: "Trigger Hotkey" })).toBeInTheDocument();
    });

    it("shows Alt + Space hint", () => {
      renderApp();

      const hint = screen.getByText(/or press/);
      expect(hint.textContent).toContain("Alt + Space");
    });

    it("shows instructions when overlay is closed", () => {
      renderApp();

      expect(screen.getByText("In-Line AI Assistant")).toBeInTheDocument();
      expect(screen.getByText(/Press/)).toBeInTheDocument();
    });
  });

  describe("app selector", () => {
    it("can change simulated app", async () => {
      const user = userEvent.setup();
      renderApp();

      const select = screen.getByRole("combobox");
      await user.selectOptions(select, "Slack");

      expect((screen.getByRole("option", { name: "Slack" }) as HTMLOptionElement).selected).toBe(true);
    });

    it("has all expected app options", () => {
      renderApp();

      expect(screen.getByRole("option", { name: "Google Chrome" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Slack" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Notion" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "MS Word" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Terminal" })).toBeInTheDocument();
    });
  });

  describe("mock selection input", () => {
    it("can edit mock selection text", async () => {
      const user = userEvent.setup();
      renderApp();

      const input = screen.getByPlaceholderText("Type highlighted text here...");
      await user.clear(input);
      await user.type(input, "New test text");

      expect(input).toHaveValue("New test text");
    });

    it("has default text", () => {
      renderApp();

      const input = screen.getByPlaceholderText("Type highlighted text here...") as HTMLInputElement;
      expect(input.value).toContain("Inline AI");
    });
  });

  describe("Trigger Hotkey button", () => {
    it("opens FloatingMenu when clicked", async () => {
      const user = userEvent.setup();
      renderApp();

      await user.click(screen.getByRole("button", { name: "Trigger Hotkey" }));

      expect(screen.getByText("Fix Grammar")).toBeInTheDocument();
    });

    it("passes mock selection text to FloatingMenu", async () => {
      const user = userEvent.setup();
      renderApp();

      const input = screen.getByPlaceholderText("Type highlighted text here...");
      await user.clear(input);
      await user.type(input, "Custom selection");
      await user.click(screen.getByRole("button", { name: "Trigger Hotkey" }));

      expect(tauriBridge.triggerMockEvent).toHaveBeenCalledWith(
        "selection-captured",
        expect.objectContaining({ text: "Custom selection" })
      );
    });

    it("passes selected app to event", async () => {
      const user = userEvent.setup();
      renderApp();

      const select = screen.getByRole("combobox");
      await user.selectOptions(select, "Notion");
      await user.click(screen.getByRole("button", { name: "Trigger Hotkey" }));

      expect(tauriBridge.triggerMockEvent).toHaveBeenCalledWith(
        "selection-captured",
        expect.objectContaining({ app_name: "Notion" })
      );
    });
  });

  describe("keyboard shortcuts", () => {
    it("Alt+Space opens FloatingMenu in browser mode", async () => {
      const user = userEvent.setup();
      renderApp();

      await user.keyboard("{Alt>} {/Alt}");

      expect(tauriBridge.triggerMockEvent).toHaveBeenCalledWith(
        "selection-captured",
        expect.anything()
      );
    });

    it("Escape closes FloatingMenu", async () => {
      const user = userEvent.setup();
      renderApp();

      await user.click(screen.getByRole("button", { name: "Trigger Hotkey" }));
      expect(screen.getByText("Fix Grammar")).toBeInTheDocument();

      await user.keyboard("{Escape}");

      expect(screen.queryByText("Fix Grammar")).not.toBeInTheDocument();
    });
  });

  describe("FloatingMenu integration", () => {
    it("hides instructions when overlay is open", async () => {
      const user = userEvent.setup();
      renderApp();

      await user.click(screen.getByRole("button", { name: "Trigger Hotkey" }));

      expect(screen.queryByText("In-Line AI Assistant")).not.toBeInTheDocument();
    });

    it("clicking outside FloatingMenu closes it", async () => {
      const user = userEvent.setup();
      renderApp();

      await user.click(screen.getByRole("button", { name: "Trigger Hotkey" }));
      expect(screen.getByText("Fix Grammar")).toBeInTheDocument();

      const appRoot = document.querySelector(".app-root")!;
      await user.click(appRoot);

      expect(screen.queryByText("Fix Grammar")).not.toBeInTheDocument();
    });
  });

  describe("Tauri event listener", () => {
    it("sets up selection-captured listener on mount", () => {
      renderApp();

      expect(tauriBridge.listenEvent).toHaveBeenCalledWith(
        "selection-captured",
        expect.any(Function)
      );
    });

    it("cleans up listener on unmount", async () => {
      const unsubscribe = vi.fn();
      vi.mocked(tauriBridge.listenEvent).mockResolvedValue(unsubscribe);

      const { unmount } = renderApp();
      
      // Wait for the async listenEvent to resolve
      await vi.waitFor(() => {
        expect(tauriBridge.listenEvent).toHaveBeenCalled();
      });
      
      unmount();

      await vi.waitFor(() => {
        expect(unsubscribe).toHaveBeenCalled();
      });
    });
  });

  describe("Tauri mode", () => {
    it("hides simulator bar in Tauri mode", () => {
      vi.mocked(tauriBridge.isTauri).mockReturnValue(true);
      renderApp();

      expect(screen.queryByText("Browser Simulator Mode")).not.toBeInTheDocument();
    });

    it("adds in-tauri class in Tauri mode", () => {
      vi.mocked(tauriBridge.isTauri).mockReturnValue(true);
      renderApp();

      const appRoot = document.querySelector(".app-root");
      expect(appRoot).toHaveClass("in-tauri");
    });

    it("adds browser-env class in browser mode", () => {
      vi.mocked(tauriBridge.isTauri).mockReturnValue(false);
      renderApp();

      const appRoot = document.querySelector(".app-root");
      expect(appRoot).toHaveClass("browser-env");
    });
  });

  describe("selection-captured event handling", () => {
    it("opens overlay when event has text", async () => {
      let capturedHandler: ((payload: any) => void) | null = null;
      vi.mocked(tauriBridge.listenEvent).mockImplementation(async (_event, handler) => {
        capturedHandler = handler;
        return () => {};
      });

      renderApp();

      act(() => {
        capturedHandler?.({ text: "Selected text", source: "hotkey" });
      });

      expect(screen.getByText("Fix Grammar")).toBeInTheDocument();
    });

    it("does not open overlay for hotkey with empty text", async () => {
      let capturedHandler: ((payload: any) => void) | null = null;
      vi.mocked(tauriBridge.listenEvent).mockImplementation(async (_event, handler) => {
        capturedHandler = handler;
        return () => {};
      });

      renderApp();

      act(() => {
        capturedHandler?.({ text: "   ", source: "hotkey" });
      });

      expect(screen.queryByText("Fix Grammar")).not.toBeInTheDocument();
    });

    it("opens overlay for non-hotkey source even with empty text", async () => {
      let capturedHandler: ((payload: any) => void) | null = null;
      vi.mocked(tauriBridge.listenEvent).mockImplementation(async (_event, handler) => {
        capturedHandler = handler;
        return () => {};
      });

      renderApp();

      act(() => {
        capturedHandler?.({ text: "", source: "menu" });
      });

      expect(screen.getByText("Fix Grammar")).toBeInTheDocument();
    });
  });

  describe("hide_window command", () => {
    it("handleHide calls invokeCmd with hide_window", async () => {
      vi.mocked(tauriBridge.isTauri).mockReturnValue(true);
      
      let capturedHandler: ((payload: unknown) => void) | null = null;
      vi.mocked(tauriBridge.listenEvent).mockImplementation(async (_event, handler) => {
        capturedHandler = handler;
        return () => {};
      });

      renderApp();

      act(() => {
        capturedHandler?.({ text: "test", source: "hotkey" });
      });

      expect(screen.getByText("Fix Grammar")).toBeInTheDocument();
    });
  });
});
