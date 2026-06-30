import { describe, it, expect, beforeEach } from "vitest";
import {
  loadSettings,
  saveSettings,
  getActiveProviderSettings,
  updateProviderSettings,
  getSystemPrompt,
  type AppSettings,
} from "../settings";
import { DEFAULT_PROMPTS } from "../../prompts";

describe("settings", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("loadSettings()", () => {
    it("returns default settings when localStorage is empty", () => {
      const settings = loadSettings();
      expect(settings.activeProvider).toBe("bedrock");
      expect(settings.language).toBe("en");
      expect(settings.theme).toBe("dark");
      expect(settings.insertShortcutKey).toBe("Enter");
      expect(settings.autoTrigger).toBe(false);
    });

    it("loads saved settings from localStorage", () => {
      const saved: AppSettings = {
        activeProvider: "openai",
        systemPrompts: { en: "custom en", ko: "custom ko" },
        language: "ko",
        theme: "light",
        insertShortcutKey: "j",
        autoTrigger: true,
        providers: {},
      };
      localStorage.setItem("dadumi_settings", JSON.stringify(saved));

      const loaded = loadSettings();
      expect(loaded.activeProvider).toBe("openai");
      expect(loaded.language).toBe("ko");
      expect(loaded.theme).toBe("light");
      expect(loaded.insertShortcutKey).toBe("j");
      expect(loaded.autoTrigger).toBe(true);
    });

    it("returns defaults when localStorage has corrupt data", () => {
      localStorage.setItem("dadumi_settings", "not-valid-json");
      const settings = loadSettings();
      expect(settings.activeProvider).toBe("bedrock");
    });

    it("migrates old settings missing new fields", () => {
      const oldSettings = {
        activeProvider: "gemini",
        systemPrompt: "old single prompt",
        providers: {},
      };
      localStorage.setItem("dadumi_settings", JSON.stringify(oldSettings));

      const loaded = loadSettings();
      expect(loaded.language).toBe("en");
      expect(loaded.theme).toBe("dark");
      expect(loaded.insertShortcutKey).toBe("Enter");
      expect(loaded.autoTrigger).toBe(false);
      expect(loaded.systemPrompts.en).toBe("old single prompt");
    });

    it("migrates invalid model to first valid model", () => {
      const saved = {
        activeProvider: "openai",
        systemPrompts: { en: "", ko: "" },
        language: "en",
        theme: "dark",
        insertShortcutKey: "Enter",
        autoTrigger: false,
        providers: {
          openai: { providerId: "openai", model: "invalid-model-xyz", config: {} },
        },
      };
      localStorage.setItem("dadumi_settings", JSON.stringify(saved));

      const loaded = loadSettings();
      expect(loaded.providers.openai?.model).toBe("gpt-4o");
    });
  });

  describe("saveSettings()", () => {
    it("persists settings to localStorage", () => {
      const settings = loadSettings();
      settings.language = "ko";
      settings.theme = "light";
      saveSettings(settings);

      const raw = localStorage.getItem("dadumi_settings");
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw!);
      expect(parsed.language).toBe("ko");
      expect(parsed.theme).toBe("light");
    });
  });

  describe("getSystemPrompt()", () => {
    it("returns prompt for current language", () => {
      const settings = loadSettings();
      settings.language = "en";
      settings.systemPrompts = { en: "english prompt", ko: "korean prompt" };

      expect(getSystemPrompt(settings)).toBe("english prompt");

      settings.language = "ko";
      expect(getSystemPrompt(settings)).toBe("korean prompt");
    });

    it("falls back to English if current language prompt missing", () => {
      const settings = loadSettings();
      settings.language = "ko";
      settings.systemPrompts = { en: "fallback english", ko: "" };
      
      const prompt = getSystemPrompt(settings);
      expect(prompt).toBe("");
    });
  });

  describe("getActiveProviderSettings()", () => {
    it("returns stored provider settings if exists", () => {
      const settings = loadSettings();
      settings.activeProvider = "openai";
      settings.providers = {
        openai: { providerId: "openai", model: "gpt-4-turbo", config: { apiKey: "sk-test" } },
      };

      const providerSettings = getActiveProviderSettings(settings);
      expect(providerSettings.model).toBe("gpt-4-turbo");
      expect(providerSettings.config.apiKey).toBe("sk-test");
    });

    it("returns default provider settings if not stored", () => {
      const settings = loadSettings();
      settings.activeProvider = "anthropic";
      settings.providers = {};

      const providerSettings = getActiveProviderSettings(settings);
      expect(providerSettings.providerId).toBe("anthropic");
      expect(providerSettings.model).toBe("claude-opus-4-5");
    });
  });

  describe("updateProviderSettings()", () => {
    it("updates existing provider settings", () => {
      const settings = loadSettings();
      settings.providers = {
        openai: { providerId: "openai", model: "gpt-4o", config: {} },
      };

      const updated = updateProviderSettings(settings, "openai", { model: "gpt-4-turbo" });
      expect(updated.providers.openai?.model).toBe("gpt-4-turbo");
    });

    it("creates provider settings if not exists", () => {
      const settings = loadSettings();
      settings.providers = {};

      const updated = updateProviderSettings(settings, "gemini", {
        config: { apiKey: "AIza-test" },
      });
      expect(updated.providers.gemini?.providerId).toBe("gemini");
      expect(updated.providers.gemini?.config.apiKey).toBe("AIza-test");
    });

    it("preserves other providers when updating one", () => {
      const settings = loadSettings();
      settings.providers = {
        openai: { providerId: "openai", model: "gpt-4o", config: { apiKey: "sk-1" } },
        anthropic: { providerId: "anthropic", model: "claude-opus-4-5", config: { apiKey: "sk-ant-1" } },
      };

      const updated = updateProviderSettings(settings, "openai", { model: "gpt-4-turbo" });
      expect(updated.providers.openai?.model).toBe("gpt-4-turbo");
      expect(updated.providers.anthropic?.model).toBe("claude-opus-4-5");
    });
  });

  describe("default prompts", () => {
    it("uses DEFAULT_PROMPTS for initial settings", () => {
      const settings = loadSettings();
      expect(settings.systemPrompts.en).toBe(DEFAULT_PROMPTS.en);
      expect(settings.systemPrompts.ko).toBe(DEFAULT_PROMPTS.ko);
    });
  });
});
