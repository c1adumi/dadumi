import { useState, useEffect, useRef } from "react";
import { invokeCmd, isTauri } from "../utils/tauriBridge";
import { PROVIDERS, parseProviderResponse, type ProviderID } from "../utils/providers";
import { useSettings } from "../context/SettingsContext";

interface FloatingMenuProps {
  selectionText: string;
  onHide: () => void;
}

const IconGear = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
  </svg>
);

const presets = [
  {
    id: "grammar",
    title: "Fix Grammar",
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>,
    instruction: "Correct any spelling, grammatical, or punctuation errors in this text while keeping the exact meaning and tone unchanged.",
  },
  {
    id: "improve",
    title: "Improve Writing",
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275Z"/></svg>,
    instruction: "Improve the clarity, vocabulary, flow, and overall quality of this text. Ensure it sounds polished and natural.",
  },
  {
    id: "professional",
    title: "Professional Tone",
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>,
    instruction: "Rewrite this text in a professional, polite, and clear business tone, suitable for emails, Slack, and reports.",
  },
  {
    id: "continue",
    title: "Continue Writing",
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>,
    instruction: "Using the text below as the start, write the next 1-2 logical sentences, matching the style and flow.",
  },
];

export default function FloatingMenu({ selectionText, onHide }: FloatingMenuProps) {
  const {
    settings,
    activeProviderSettings,
    activeProviderDef,
    dynamicModels,
    isFetchingModels,
    setActiveProvider,
    setModel,
    setConfigField,
    setSystemPrompt,
    persistConfigField,
    refreshModels,
  } = useSettings();

  const availableModels = dynamicModels.length > 0 ? dynamicModels : activeProviderDef.models;

  const [customPrompt, setCustomPrompt] = useState("");
  const [streamedText, setStreamedText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [draftSystemPrompt, setDraftSystemPrompt] = useState(settings.systemPrompt);

  useEffect(() => {
    setDraftSystemPrompt(settings.systemPrompt);
  }, [settings.systemPrompt]);

  const streamEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleDragStart = async (e: React.MouseEvent) => {
    if (e.button !== 0 || !isTauri()) return;
    e.preventDefault();
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    getCurrentWindow().startDragging();
  };

  useEffect(() => {
    if (streamEndRef.current) {
      streamEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [streamedText]);

  const handleAIQuery = async (instruction: string) => {
    if (isGenerating) return;

    if (!selectionText) {
      setStreamedText("⚠️ No text selected. Highlight text in any app, then press Alt+Space.");
      return;
    }

    setIsGenerating(true);
    setStreamedText("");

    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();

    try {
      const requiresKey = activeProviderDef.fields.some(
        (f) => f.key === "apiKey" && !f.label.toLowerCase().includes("optional")
      );
      if (requiresKey && !activeProviderSettings.config.apiKey) {
        setStreamedText(`⚠️ Please open settings (⚙️) and enter your ${activeProviderDef.label} API Key.`);
        setIsGenerating(false);
        return;
      }

      const userMessage = `Task: ${instruction}\n\nInput Text:\n"""\n${selectionText}\n"""\n\nFinal Output:`;
      const response = await activeProviderDef.buildRequest(
        activeProviderSettings.config,
        activeProviderSettings.model,
        settings.systemPrompt,
        userMessage,
        abortControllerRef.current.signal,
      );

      if (!response.ok) {
        const errorJson = await response.json().catch(() => ({}));
        throw new Error((errorJson as any)?.message || (errorJson as any)?.error?.message || `HTTP ${response.status}`);
      }

      setStreamedText(await parseProviderResponse(settings.activeProvider, response));
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setStreamedText((prev) => prev + `\n\n⚠️ Error: ${err.message}`);
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    abortControllerRef.current?.abort();
    setIsGenerating(false);
  };

  const handlePasteBack = async () => {
    const finalResult = streamedText || selectionText;
    if (!finalResult) return;
    try {
      await invokeCmd("paste_text", { text: finalResult });
      onHide();
    } catch (err: any) {
      setStreamedText((prev) => prev + `\n\n⚠️ Paste failed: ${err}. Check Accessibility permission in System Settings → Privacy & Security → Accessibility.`);
    }
  };

  const handleCopyToClipboard = () => {
    const finalResult = streamedText || selectionText;
    if (!finalResult) return;
    navigator.clipboard.writeText(finalResult).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    });
  };

  const handleCloseSettings = () => {
    setSystemPrompt(draftSystemPrompt);
    setShowSettings(false);
  };

  return (
    <div data-tauri-drag-region className={`glass-container ${isGenerating ? "processing" : ""}`}>
      <div data-tauri-drag-region className="drag-handle" onMouseDown={handleDragStart}>
        <span className="drag-indicator" />
      </div>

      <main className="scroll-content">
        <section className="presets-grid">
          {presets.map((preset) => (
            <button
              key={preset.id}
              className="preset-card"
              disabled={isGenerating}
              onClick={() => handleAIQuery(preset.instruction)}
            >
              <span className="preset-icon">{preset.icon}</span>
              <span className="preset-title">{preset.title}</span>
            </button>
          ))}

          <button className="preset-card" disabled={isGenerating} onClick={() => setShowSettings(true)}>
            <span className="preset-icon"><IconGear /></span>
            <span className="preset-title" style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
              Configure Settings
              <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontWeight: 400 }}>
                {activeProviderDef.label}
              </span>
            </span>
          </button>
        </section>

        <div className="menu-separator" />

        <section className="custom-prompt-container">
          <input
            className="custom-input"
            type="text"
            placeholder="Custom instruction..."
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && customPrompt) {
                handleAIQuery(customPrompt);
                setCustomPrompt("");
              }
            }}
            disabled={isGenerating}
          />
          <button
            className="send-btn"
            disabled={isGenerating || !customPrompt}
            onClick={() => { handleAIQuery(customPrompt); setCustomPrompt(""); }}
            title="Send instructions"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
          </button>
        </section>

        {(streamedText || isGenerating) && (
          <section className={`result-panel ${streamedText.includes("⚠️") ? "error-state" : ""}`}>
            <div className="section-label">
              AI Output
              {isGenerating && <span className="cohere-status-badge" style={{ marginLeft: "auto", fontSize: "0.65rem", padding: "1px 6px" }}>GEN</span>}
            </div>
            <div className="stream-area">
              {streamedText}
              {isGenerating && <span className="cursor-caret" />}
              <div ref={streamEndRef} />
            </div>
          </section>
        )}
      </main>

      <footer className="footer-bar">
        {isGenerating ? (
          <button className="btn btn-secondary" onClick={handleStop}>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><rect width="6" height="6" x="9" y="9" rx="1"/></svg>
            Stop
          </button>
        ) : (
          <>
            <button className="btn btn-secondary" onClick={handleCopyToClipboard} disabled={!streamedText}>
              {copySuccess ? (
                <><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>Copied!</>
              ) : (
                <><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>Copy</>
              )}
            </button>
            <button className="btn btn-primary" onClick={handlePasteBack} disabled={!streamedText && !selectionText}>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20"/><path d="m17 5-5-3-5 3"/><path d="m7 19 5 3 5-3"/></svg>
              Insert / Replace
            </button>
          </>
        )}
      </footer>

      <section className={`settings-panel ${showSettings ? "open" : ""}`}>
        <div className="settings-header">
          <div className="settings-title">
            <IconGear />
            Configuration
          </div>
          <button className="icon-btn" onClick={handleCloseSettings} aria-label="Back">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>
          </button>
        </div>

        <div className="settings-body">
          <div className="form-group">
            <label className="form-label">AI Provider</label>
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

          <div className="form-group">
            <label className="form-label" htmlFor="modelSelect">
              Model
              {activeProviderDef.fetchModels && (
                <button
                  className="icon-btn"
                  style={{ marginLeft: "auto", width: 20, height: 20 }}
                  onClick={refreshModels}
                  disabled={isFetchingModels}
                  title="Refresh model list"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: isFetchingModels ? "spin 1s linear infinite" : "none" }}><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
                </button>
              )}
            </label>
            <select
              id="modelSelect"
              className="form-select"
              value={activeProviderSettings.model}
              onChange={(e) => setModel(e.target.value)}
              disabled={isFetchingModels}
            >
              {isFetchingModels
                ? <option>Loading models...</option>
                : availableModels.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))
              }
            </select>
          </div>

          {activeProviderDef.fields.map((field) => (
            <div key={field.key} className="form-group">
              <label className="form-label" htmlFor={`field-${field.key}`}>{field.label}</label>
              <input
                id={`field-${field.key}`}
                type={field.type === "password" ? "password" : "text"}
                className="form-input"
                placeholder={field.placeholder}
                value={activeProviderSettings.config[field.key] ?? field.defaultValue ?? ""}
                onChange={(e) => setConfigField(field.key, e.target.value)}
                onBlur={persistConfigField}
              />
            </div>
          ))}

          <div className="form-group">
            <label className="form-label" htmlFor="systemPromptInput">System Instructions</label>
            <textarea
              id="systemPromptInput"
              className="form-input"
              rows={4}
              style={{ resize: "none" }}
              value={draftSystemPrompt}
              onChange={(e) => setDraftSystemPrompt(e.target.value)}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
