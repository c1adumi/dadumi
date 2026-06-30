import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsProvider, useSettings } from "../SettingsContext";
import type { ProviderID } from "../../utils/providers";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

function TestConsumer() {
  const ctx = useSettings();
  return (
    <div>
      <span data-testid="provider">{ctx.settings.activeProvider}</span>
      <span data-testid="language">{ctx.settings.language}</span>
      <span data-testid="theme">{ctx.settings.theme}</span>
      <span data-testid="shortcut">{ctx.settings.insertShortcutKey}</span>
      <span data-testid="autoTrigger">{ctx.settings.autoTrigger ? "true" : "false"}</span>
      <span data-testid="model">{ctx.activeProviderSettings.model}</span>
      <span data-testid="providerLabel">{ctx.activeProviderDef.label}</span>
      <span data-testid="systemPrompt">{ctx.currentSystemPrompt}</span>
      <span data-testid="trPresetGrammar">{ctx.tr.presets.grammar}</span>
      <button data-testid="setOpenai" onClick={() => ctx.setActiveProvider("openai")}>OpenAI</button>
      <button data-testid="setKo" onClick={() => ctx.setLanguage("ko")}>Korean</button>
      <button data-testid="setLight" onClick={() => ctx.setTheme("light")}>Light</button>
      <button data-testid="setShortcut" onClick={() => ctx.setInsertShortcutKey("j")}>J</button>
      <button data-testid="setAutoTrigger" onClick={() => ctx.setAutoTrigger(true)}>Auto</button>
      <button data-testid="setModel" onClick={() => ctx.setModel("gpt-4-turbo")}>GPT4T</button>
      <button data-testid="setPrompt" onClick={() => ctx.setSystemPrompt("custom prompt")}>Prompt</button>
    </div>
  );
}

describe("SettingsContext", () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ inferenceProfileSummaries: [] }), { status: 200 })
    );
  });

  describe("useSettings()", () => {
    it("throws when used outside provider", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      
      expect(() => {
        render(<TestConsumer />);
      }).toThrow("useSettings must be used inside SettingsProvider");
      
      consoleSpy.mockRestore();
    });
  });

  describe("SettingsProvider", () => {
    it("provides default settings", () => {
      render(
        <SettingsProvider>
          <TestConsumer />
        </SettingsProvider>
      );

      expect(screen.getByTestId("provider")).toHaveTextContent("bedrock");
      expect(screen.getByTestId("language")).toHaveTextContent("en");
      expect(screen.getByTestId("theme")).toHaveTextContent("dark");
      expect(screen.getByTestId("shortcut")).toHaveTextContent("Enter");
      expect(screen.getByTestId("autoTrigger")).toHaveTextContent("false");
    });

    it("provides activeProviderDef matching activeProvider", () => {
      render(
        <SettingsProvider>
          <TestConsumer />
        </SettingsProvider>
      );

      expect(screen.getByTestId("providerLabel")).toHaveTextContent("AWS Bedrock");
    });

    it("provides translations for current language", () => {
      render(
        <SettingsProvider>
          <TestConsumer />
        </SettingsProvider>
      );

      expect(screen.getByTestId("trPresetGrammar")).toHaveTextContent("Fix Grammar");
    });
  });

  describe("setActiveProvider()", () => {
    it("changes active provider", async () => {
      const user = userEvent.setup();
      render(
        <SettingsProvider>
          <TestConsumer />
        </SettingsProvider>
      );

      await user.click(screen.getByTestId("setOpenai"));

      expect(screen.getByTestId("provider")).toHaveTextContent("openai");
      expect(screen.getByTestId("providerLabel")).toHaveTextContent("OpenAI");
    });

    it("persists to localStorage", async () => {
      const user = userEvent.setup();
      render(
        <SettingsProvider>
          <TestConsumer />
        </SettingsProvider>
      );

      await user.click(screen.getByTestId("setOpenai"));

      const saved = JSON.parse(localStorage.getItem("dadumi_settings")!);
      expect(saved.activeProvider).toBe("openai");
    });
  });

  describe("setLanguage()", () => {
    it("changes language and updates translations", async () => {
      const user = userEvent.setup();
      render(
        <SettingsProvider>
          <TestConsumer />
        </SettingsProvider>
      );

      await user.click(screen.getByTestId("setKo"));

      expect(screen.getByTestId("language")).toHaveTextContent("ko");
      expect(screen.getByTestId("trPresetGrammar")).toHaveTextContent("문법 수정");
    });
  });

  describe("setTheme()", () => {
    it("changes theme", async () => {
      const user = userEvent.setup();
      render(
        <SettingsProvider>
          <TestConsumer />
        </SettingsProvider>
      );

      await user.click(screen.getByTestId("setLight"));

      expect(screen.getByTestId("theme")).toHaveTextContent("light");
    });

    it("sets data-theme attribute on document", async () => {
      const user = userEvent.setup();
      render(
        <SettingsProvider>
          <TestConsumer />
        </SettingsProvider>
      );

      await user.click(screen.getByTestId("setLight"));

      expect(document.documentElement.dataset.theme).toBe("light");
    });
  });

  describe("setInsertShortcutKey()", () => {
    it("changes shortcut key", async () => {
      const user = userEvent.setup();
      render(
        <SettingsProvider>
          <TestConsumer />
        </SettingsProvider>
      );

      await user.click(screen.getByTestId("setShortcut"));

      expect(screen.getByTestId("shortcut")).toHaveTextContent("j");
    });
  });

  describe("setAutoTrigger()", () => {
    it("enables auto trigger", async () => {
      const user = userEvent.setup();
      render(
        <SettingsProvider>
          <TestConsumer />
        </SettingsProvider>
      );

      await user.click(screen.getByTestId("setAutoTrigger"));

      expect(screen.getByTestId("autoTrigger")).toHaveTextContent("true");
    });
  });

  describe("setModel()", () => {
    it("changes model for active provider", async () => {
      const user = userEvent.setup();
      render(
        <SettingsProvider>
          <TestConsumer />
        </SettingsProvider>
      );

      await user.click(screen.getByTestId("setOpenai"));
      await user.click(screen.getByTestId("setModel"));

      expect(screen.getByTestId("model")).toHaveTextContent("gpt-4-turbo");
    });
  });

  describe("setSystemPrompt()", () => {
    it("changes system prompt for current language", async () => {
      const user = userEvent.setup();
      render(
        <SettingsProvider>
          <TestConsumer />
        </SettingsProvider>
      );

      await user.click(screen.getByTestId("setPrompt"));

      expect(screen.getByTestId("systemPrompt")).toHaveTextContent("custom prompt");
    });
  });

  describe("cross-window sync", () => {
    it("updates state when storage event fires", async () => {
      render(
        <SettingsProvider>
          <TestConsumer />
        </SettingsProvider>
      );

      const newSettings = {
        activeProvider: "gemini" as ProviderID,
        systemPrompts: { en: "", ko: "" },
        language: "ko" as const,
        theme: "light" as const,
        insertShortcutKey: "Enter",
        autoTrigger: false,
        providers: {},
      };

      act(() => {
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: "dadumi_settings",
            newValue: JSON.stringify(newSettings),
          })
        );
      });

      expect(screen.getByTestId("provider")).toHaveTextContent("gemini");
      expect(screen.getByTestId("language")).toHaveTextContent("ko");
    });

    it("ignores storage events for other keys", async () => {
      render(
        <SettingsProvider>
          <TestConsumer />
        </SettingsProvider>
      );

      act(() => {
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: "other_key",
            newValue: JSON.stringify({ activeProvider: "gemini" }),
          })
        );
      });

      expect(screen.getByTestId("provider")).toHaveTextContent("bedrock");
    });
  });
});
