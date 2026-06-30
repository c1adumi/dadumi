import { describe, it, expect } from "vitest";
import { t, translations, type Language } from "../i18n";

describe("i18n", () => {
  describe("t()", () => {
    it("returns English translations for 'en'", () => {
      const tr = t("en");
      expect(tr).toBe(translations.en);
    });

    it("returns Korean translations for 'ko'", () => {
      const tr = t("ko");
      expect(tr).toBe(translations.ko);
    });
  });

  describe("translations structure", () => {
    const languages: Language[] = ["en", "ko"];

    it("has matching keys in both languages", () => {
      const enKeys = Object.keys(translations.en);
      const koKeys = Object.keys(translations.ko);
      expect(enKeys).toEqual(koKeys);
    });

    it.each(languages)("%s has all preset keys", (lang) => {
      const tr = translations[lang];
      expect(tr.presets).toHaveProperty("grammar");
      expect(tr.presets).toHaveProperty("improve");
      expect(tr.presets).toHaveProperty("professional");
      expect(tr.presets).toHaveProperty("continue");
      expect(tr.presets).toHaveProperty("translate");
    });

    it.each(languages)("%s has all settings keys", (lang) => {
      const tr = translations[lang];
      expect(tr.settings).toHaveProperty("title");
      expect(tr.settings).toHaveProperty("provider");
      expect(tr.settings).toHaveProperty("model");
      expect(tr.settings).toHaveProperty("systemPrompt");
      expect(tr.settings).toHaveProperty("language");
      expect(tr.settings).toHaveProperty("confirm");
      expect(tr.settings).toHaveProperty("insertShortcut");
      expect(tr.settings).toHaveProperty("triggerMode");
    });

    it.each(languages)("%s has all main UI keys", (lang) => {
      const tr = translations[lang];
      expect(tr.main).toHaveProperty("customPlaceholder");
      expect(tr.main).toHaveProperty("aiOutput");
      expect(tr.main).toHaveProperty("stop");
      expect(tr.main).toHaveProperty("copy");
      expect(tr.main).toHaveProperty("copied");
      expect(tr.main).toHaveProperty("insertReplace");
    });

    it("all translation values are non-empty strings", () => {
      for (const lang of languages) {
        const tr = translations[lang];
        for (const [section, values] of Object.entries(tr)) {
          for (const [key, value] of Object.entries(values as Record<string, string>)) {
            expect(value, `${lang}.${section}.${key}`).toBeTruthy();
            expect(typeof value, `${lang}.${section}.${key}`).toBe("string");
          }
        }
      }
    });
  });
});
