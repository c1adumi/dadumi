import { useState, useRef, useEffect } from "react";
import { useSettings } from "../context/SettingsContext";
import { isTauri, openUrl } from "../utils/tauriBridge";
import { PROVIDERS, copilotOAuthFlow, enableCopilotModels, type ProviderID } from "../utils/providers";
import type { Theme } from "../utils/settings";
import type { Language } from "../utils/i18n";
import { DEFAULT_PROMPTS } from "../prompts";
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
    setInsertShortcutKey,
    setAutoTrigger,
    persistConfigField,
    refreshModels,
  } = useSettings();

  const isMac = typeof navigator !== "undefined" && navigator.platform.toUpperCase().includes("MAC");
  const modifierLabel = isMac ? "⌘ Cmd" : "Ctrl";

  const currentTheme = settings.theme ?? "dark";
  const availableModels = dynamicModels.length > 0 ? dynamicModels : activeProviderDef.models;
  const lang = settings.language ?? "en";

  const toDisplayPrompt = (value: string) => {
    const isAnyDefault = (Object.values(DEFAULT_PROMPTS) as string[]).includes(value);
    return !value || isAnyDefault ? "" : value;
  };

  const [copilotStatus, setCopilotStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [copilotUserCode, setCopilotUserCode] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  const handleCopilotLogin = async () => {
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    setCopilotStatus("pending");
    setCopilotUserCode(null);
    try {
      const flow = await copilotOAuthFlow();
      setCopilotUserCode(flow.userCode);
      await openUrl(flow.verificationUri);
      const token = await flow.poll(abort.signal);
      if (!token) {
        if (!abort.signal.aborted) setCopilotStatus("error");
        return;
      }
      setConfigField("githubToken", token);
      await enableCopilotModels(token);
      setCopilotStatus("success");
      setCopilotUserCode(null);
    } catch {
      if (!abort.signal.aborted) setCopilotStatus("error");
    }
  };

  const [draftPrompt, setDraftPrompt] = useState(() =>
    toDisplayPrompt(settings.systemPrompts[lang])
  );

  useEffect(() => {
    setDraftPrompt(toDisplayPrompt(settings.systemPrompts[lang]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  const handleConfirm = async () => {
    setSystemPrompt(draftPrompt, lang);
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
            {(["en", "ko"] as Language[]).map((l) => (
              <button
                key={l}
                className={`provider-tab ${lang === l ? "active" : ""}`}
                onClick={() => setLanguage(l)}
              >
                {l === "en" ? "English" : "한국어"}
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
          <label className="form-label">{tr.settings.insertShortcut}</label>
          <p className="form-hint">{tr.settings.insertShortcutDesc}</p>
          <div className="shortcut-input-row">
            <span className="shortcut-modifier-badge">{modifierLabel}</span>
            <span className="shortcut-plus">+</span>
            <input
              className="form-input shortcut-key-input"
              type="text"
              maxLength={20}
              placeholder={tr.settings.insertShortcutPlaceholder}
              value={settings.insertShortcutKey ?? "Enter"}
              onChange={(e) => setInsertShortcutKey(e.target.value.trim() || "Enter")}
              onKeyDown={(e) => {
                e.preventDefault();
                const key = e.key;
                if (key === "Backspace" || key === "Delete") {
                  setInsertShortcutKey("Enter");
                  return;
                }
                if (key.length === 1 || key === "Enter" || key === "Tab" || key === "Space") {
                  setInsertShortcutKey(key === " " ? "Space" : key);
                }
              }}
            />
          </div>
          <p className="form-hint shortcut-preview">
            {modifierLabel} + {settings.insertShortcutKey ?? "Enter"}
          </p>
        </div>

        <div className="settings-section">
          <label className="form-label">{tr.settings.triggerMode}</label>
          <p className="form-hint">{tr.settings.triggerModeDesc}</p>
          <div className="theme-switcher">
            <button
              className={`theme-option ${!settings.autoTrigger ? "active" : ""}`}
              onClick={() => setAutoTrigger(false)}
            >
              <span>{tr.settings.triggerManual}</span>
            </button>
            <button
              className={`theme-option ${settings.autoTrigger ? "active" : ""}`}
              onClick={() => setAutoTrigger(true)}
            >
              <span>{tr.settings.triggerAuto}</span>
            </button>
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

        {settings.activeProvider === "github-copilot" && (
          <div className="settings-section">
            <label className="form-label">GitHub Authentication</label>
            {copilotStatus === "pending" && copilotUserCode && (
              <p className="form-hint">
                Enter this code in your browser: <strong>{copilotUserCode}</strong>
              </p>
            )}
            {copilotStatus === "error" && (
              <p className="form-hint" style={{ color: "var(--color-error, #f87171)" }}>
                Authentication failed. Please try again.
              </p>
            )}
            {copilotStatus === "success" && (
              <p className="form-hint" style={{ color: "var(--color-success, #4ade80)" }}>
                Authenticated! Loading models...
              </p>
            )}
            <button
              className="btn btn-secondary"
              onClick={handleCopilotLogin}
              disabled={copilotStatus === "pending"}
            >
              {copilotStatus === "pending"
                ? "Waiting for authorization..."
                : activeProviderSettings.config.githubToken
                  ? "Re-authenticate"
                  : "Login with GitHub"}
            </button>
          </div>
        )}

        {activeProviderDef.fields
          .filter((field) => !(settings.activeProvider === "github-copilot" && field.key === "githubToken"))
          .map((field) => (
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
          <label className="form-label">
            <span>{tr.settings.systemPrompt} ({lang === "en" ? "EN" : "KO"})</span>
          </label>
          <textarea
            className="form-input"
            rows={5}
            style={{ resize: "vertical" }}
            placeholder={tr.settings.systemPromptPlaceholder}
            value={draftPrompt}
            onChange={(e) => setDraftPrompt(e.target.value)}
          />
        </div>
      </div>

      <div className="settings-window-footer">
        <span className="settings-window-credit">LGE SW Bootcamp 1기 C반 1팀</span>
        <button className="btn btn-confirm" onClick={handleConfirm}>
          {tr.settings.confirm}
        </button>
      </div>
    </div>
  );
}
