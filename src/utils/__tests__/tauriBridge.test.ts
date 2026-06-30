import { describe, it, expect, vi, beforeEach } from "vitest";
import { isTauri, invokeCmd, listenEvent, triggerMockEvent, openUrl } from "../tauriBridge";

describe("tauriBridge", () => {
  beforeEach(() => {
    delete (window as any).__TAURI_INTERNALS__;
  });

  describe("isTauri()", () => {
    it("returns false when __TAURI_INTERNALS__ is undefined", () => {
      expect(isTauri()).toBe(false);
    });

    it("returns true when __TAURI_INTERNALS__ is defined", () => {
      (window as any).__TAURI_INTERNALS__ = {};
      expect(isTauri()).toBe(true);
    });
  });

  describe("invokeCmd() in browser mode", () => {
    it("returns mock caret position for get_caret_position", async () => {
      const result = await invokeCmd("get_caret_position");
      expect(result).toHaveProperty("x");
      expect(result).toHaveProperty("y");
      expect(typeof result.x).toBe("number");
      expect(typeof result.y).toBe("number");
    });

    it("returns true and shows alert for paste_text", async () => {
      const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
      
      const result = await invokeCmd("paste_text", { text: "test paste" });
      
      expect(result).toBe(true);
      expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining("test paste"));
      alertSpy.mockRestore();
    });

    it("returns true for hide_window", async () => {
      const result = await invokeCmd("hide_window");
      expect(result).toBe(true);
    });

    it("returns null for unknown commands", async () => {
      const result = await invokeCmd("unknown_command");
      expect(result).toBeNull();
    });

    it("logs command invocation to console", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      
      await invokeCmd("test_command", { arg: "value" });
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Tauri Mock"),
        expect.anything()
      );
      consoleSpy.mockRestore();
    });
  });

  describe("listenEvent() in browser mode", () => {
    it("registers listener and returns unsubscribe function", async () => {
      const handler = vi.fn();
      const unsubscribe = await listenEvent("test-event", handler);
      
      expect(typeof unsubscribe).toBe("function");
    });

    it("calls handler when triggerMockEvent is called", async () => {
      const handler = vi.fn();
      await listenEvent("my-event", handler);
      
      triggerMockEvent("my-event", { data: "test" });
      
      expect(handler).toHaveBeenCalledWith({ data: "test" });
    });

    it("unsubscribe stops receiving events", async () => {
      const handler = vi.fn();
      const unsubscribe = await listenEvent("my-event", handler);
      
      unsubscribe();
      triggerMockEvent("my-event", { data: "test" });
      
      expect(handler).not.toHaveBeenCalled();
    });

    it("multiple listeners receive same event", async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      
      await listenEvent("shared-event", handler1);
      await listenEvent("shared-event", handler2);
      
      triggerMockEvent("shared-event", { value: 42 });
      
      expect(handler1).toHaveBeenCalledWith({ value: 42 });
      expect(handler2).toHaveBeenCalledWith({ value: 42 });
    });
  });

  describe("triggerMockEvent()", () => {
    it("does nothing when in Tauri mode", () => {
      (window as any).__TAURI_INTERNALS__ = {};
      const handler = vi.fn();
      
      triggerMockEvent("test", { data: "ignored" });
      
      expect(handler).not.toHaveBeenCalled();
    });

    it("triggers event only for matching event name", async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      
      await listenEvent("event-a", handler1);
      await listenEvent("event-b", handler2);
      
      triggerMockEvent("event-a", { x: 1 });
      
      expect(handler1).toHaveBeenCalledWith({ x: 1 });
      expect(handler2).not.toHaveBeenCalled();
    });
  });

  describe("openUrl() in browser mode", () => {
    it("opens URL with window.open", async () => {
      const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
      
      await openUrl("https://example.com");
      
      expect(openSpy).toHaveBeenCalledWith("https://example.com", "_blank");
      openSpy.mockRestore();
    });
  });
});
