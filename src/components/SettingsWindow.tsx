import { useState } from "react";
import { useSettings } from "../context/SettingsContext";
import { isTauri, invokeCmd } from "../utils/tauriBridge";
import { PROVIDERS, type ProviderID } from "../utils/providers";
import type { Theme } from "../utils/settings";
import type { Language } from "../utils/i18n";
import "../styles/index.css";

const IconSun = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" />
    <line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" />
    <line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
);

const IconMoon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

export default function SettingsWindow() {
  const {
    settings,
    activeProviderSettings,
    activeProviderDef,
    dynamicModels,
    isFetchingModels,
    tr,
    setTheme,
    setActiveProvider,
    setModel,
    setConfigField,
    setSystemPrompt,
    setLanguage,
    persistConfigField,
    refreshModels,
  } = useSettings();

  const currentTheme = settings.theme ?? "dark";
  const availableModels = dynamicModels.length > 0 ? dynamicModels : activeProviderDef.models;
  const [draftSystemPrompt, setDraftSystemPrompt] = useState(settings.systemPrompt);

  const handleConfirm = async () => {
    setSystemPrompt(draftSystemPrompt);
    await invokeCmd("show_main_window");
    if (isTauri()) {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      getCurrentWindow().close();
    }
  };

  return (
    <div className="settings-window">
      <div className="settings-window-header">
        <h1 className="settings-window-title">Settings</h1>
      </div>

      <div className="settings-window-body">
        <div className="settings-section">
          <label className="form-label">{tr.settings.language}</label>
          <div className="provider-tabs">
            {(["en", "ko"] as Language[]).map((lang) => (
              <button
                key={lang}
                className={`provider-tab ${settings.language === lang ? "active" : ""}`}
                onClick={() => setLanguage(lang)}
              >
                {lang === "en" ? "English" : "한국어"}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-section">
          <label className="form-label">Appearance</label>
          <div className="theme-switcher">
            {(["dark", "light"] as Theme[]).map((theme) => (
              <button
                key={theme}
                className={`theme-option ${currentTheme === theme ? "active" : ""}`}
                onClick={() => setTheme(theme)}
              >
                {theme === "dark" ? <IconMoon /> : <IconSun />}
                <span>{theme === "dark" ? "Dark" : "Light"}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="settings-section">
          <label className="form-label">{tr.settings.provider}</label>
          <div className="provider-tabs">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                className={`provider-tab ${settings.activeProvider === p.id ? "active" : ""}`}
                onClick={() => setActiveProvider(p.id as ProviderID)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-section">
          <label className="form-label">
            {tr.settings.model}
            {activeProviderDef.fetchModels && (
              <button
                className="icon-btn"
                style={{ marginLeft: "8px", width: 20, height: 20, display: "inline-flex" }}
                onClick={refreshModels}
                disabled={isFetchingModels}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: isFetchingModels ? "spin 1s linear infinite" : "none" }}><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
              </button>
            )}
          </label>
          <select
            className="form-select"
            value={activeProviderSettings.model}
            onChange={(e) => setModel(e.target.value)}
            disabled={isFetchingModels}
          >
            {isFetchingModels
              ? <option>{tr.settings.loadingModels}</option>
              : availableModels.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))
            }
          </select>
        </div>

        {activeProviderDef.fields.map((field) => (
          <div key={field.key} className="settings-section">
            <label className="form-label">{field.label}</label>
            <input
              type={field.type === "password" ? "password" : "text"}
              className="form-input"
              placeholder={field.placeholder}
              value={activeProviderSettings.config[field.key] ?? field.defaultValue ?? ""}
              onChange={(e) => setConfigField(field.key, e.target.value)}
              onBlur={persistConfigField}
            />
          </div>
        ))}

        <div className="settings-section">
          <label className="form-label">{tr.settings.systemPrompt}</label>
          <textarea
            className="form-input"
            rows={4}
            style={{ resize: "none" }}
            value={draftSystemPrompt}
            onChange={(e) => setDraftSystemPrompt(e.target.value)}
          />
        </div>
      </div>

      <div className="settings-window-footer">
        <button className="btn btn-confirm" onClick={handleConfirm}>
          {tr.settings.confirm}
        </button>
      </div>
    </div>
  );
}
