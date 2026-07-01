import { useState, useEffect, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invokeCmd, isTauri } from "../utils/tauriBridge";
import { parseProviderResponse } from "../utils/providers";
import { useSettings } from "../context/SettingsContext";
import { PRESET_INSTRUCTIONS } from "../prompts";

interface FloatingMenuProps {
  selectionText: string;
  onHide: () => void;
  initialPreset: PresetID;
  onPresetChange: (preset: PresetID) => void;
}

const IconGear = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
  </svg>
);

const PRESET_IDS = ["grammar", "improve", "professional", "continue", "translate"] as const;
export type PresetID = typeof PRESET_IDS[number];

const PRESET_ICONS = {
  grammar: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>,
  improve: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275Z"/></svg>,
  professional: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>,
  continue: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>,
  translate: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>,
};

export default function FloatingMenu({ selectionText, onHide, initialPreset, onPresetChange }: FloatingMenuProps) {
  const {
    settings,
    activeProviderSettings,
    activeProviderDef,
    currentSystemPrompt,
    tr,
  } = useSettings();

  const lang = settings.language ?? "en";
  const presetInstructions = PRESET_INSTRUCTIONS[lang];

  const [customPrompt, setCustomPrompt] = useState("");
  const [streamedText, setStreamedText] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [focusedPresetIndex, setFocusedPresetIndex] = useState(0);

  const streamEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleAIQuery = async (instruction: string) => {
    if (isGenerating) return;
    setIsGenerating(true);
    setStreamedText("");
    setErrorMessage(null);

    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();

    try {
      const requiresKey = activeProviderDef.fields.some(
        (f) => f.key === "apiKey" && !f.label.toLowerCase().includes("optional")
      );
      if (requiresKey && !activeProviderSettings.config.apiKey) {
        setErrorMessage(`Please open settings (⚙️) and enter your ${activeProviderDef.label} API Key.`);
        setIsGenerating(false);
        return;
      }

      const userMessage = `Task: ${instruction}\n\nInput Text:\n${selectionText}\n\nFinal Output:`;
      const response = await activeProviderDef.buildRequest(
        activeProviderSettings.config,
        activeProviderSettings.model,
        currentSystemPrompt,
        userMessage,
        abortControllerRef.current.signal,
      );

      if (!response.ok) {
        const errorJson = await response.json().catch(() => ({}));
        throw new Error((errorJson as any)?.message || (errorJson as any)?.error?.message || `HTTP ${response.status}`);
      }

      setStreamedText(await parseProviderResponse(settings.activeProvider, response));
    } catch (err: any) {
      const isAbort = err?.name === "AbortError" || (typeof err === "string" && err.includes("Abort"));
      if (!isAbort) {
        const message = err?.message ?? (typeof err === "string" ? err : String(err));
        setErrorMessage(`Error: ${message}`);
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

  useEffect(() => {
    if (selectionText && settings.autoTrigger) {
      handleAIQuery(presetInstructions[initialPreset]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isGenerating || !selectionText) return;
      
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedPresetIndex((i) => (i + 1) % PRESET_IDS.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedPresetIndex((i) => (i - 1 + PRESET_IDS.length) % PRESET_IDS.length);
      } else if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        const selectedId = PRESET_IDS[focusedPresetIndex];
        onPresetChange(selectedId);
        handleAIQuery(presetInstructions[selectedId]);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isGenerating, selectionText, focusedPresetIndex, presetInstructions, onPresetChange]);

  const handleDragStart = (e: React.MouseEvent) => {
    if (e.button !== 0 || !isTauri()) return;
    e.preventDefault();
    getCurrentWindow().startDragging();
  };

  useEffect(() => {
    if (streamEndRef.current) {
      streamEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [streamedText]);

  const handlePasteBack = async () => {
    const finalResult = streamedText || selectionText;
    if (!finalResult) return;
    try {
      const pasted = await invokeCmd("paste_text", { text: finalResult });
      if (pasted === false) {
        throw new Error("Paste command was not accepted by the target app");
      }
      onHide();
    } catch (err: any) {
      const hint = navigator.userAgent.includes("Windows")
        ? "Ensure Dadumi is not running as Administrator if the target app is not elevated."
        : "Check Accessibility permission in System Settings → Privacy & Security → Accessibility.";
      setErrorMessage(`Paste failed: ${err}. ${hint}`);
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().includes("MAC");
      const shortcutKey = settings.insertShortcutKey ?? "Enter";
      const modifierHeld = isMac ? e.metaKey : e.ctrlKey;
      const keyMatches = shortcutKey === "Space"
        ? e.code === "Space"
        : e.key === shortcutKey;
      if (!modifierHeld || !keyMatches || isGenerating || errorMessage) return;
      e.preventDefault();
      handlePasteBack();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isGenerating, streamedText, selectionText, settings.insertShortcutKey, errorMessage]);

  const handleCopyToClipboard = () => {
    const finalResult = streamedText || selectionText;
    if (!finalResult) return;
    navigator.clipboard.writeText(finalResult).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    });
  };

  const handleOpenSettings = async () => {
    await invokeCmd("open_settings");
  };

  return (
    <div data-tauri-drag-region className={`glass-container ${isGenerating ? "processing" : ""}`} onClick={(e) => e.stopPropagation()}>
      <div data-tauri-drag-region className="drag-handle" onMouseDown={handleDragStart}>
        <span className="drag-indicator" />
      </div>

      <main className="scroll-content">
        <section className="presets-grid">
          {PRESET_IDS.map((id, index) => (
            <button
              key={id}
              className={`preset-card ${index === focusedPresetIndex ? "focused" : ""}`}
              disabled={isGenerating || !selectionText}
              onClick={() => { setFocusedPresetIndex(index); onPresetChange(id); handleAIQuery(presetInstructions[id]); }}
            >
              <span className="preset-icon">{PRESET_ICONS[id]}</span>
              <span className="preset-title">{tr.presets[id]}</span>
            </button>
          ))}
        </section>

        <div className="menu-separator" />

        <section className="custom-prompt-container">
          <input
            className="custom-input"
            type="text"
            placeholder={tr.main.customPlaceholder}
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && customPrompt && selectionText) {
                handleAIQuery(customPrompt);
                setCustomPrompt("");
              }
            }}
            disabled={isGenerating || !selectionText}
          />
          <button
            className="send-btn"
            disabled={isGenerating || !customPrompt || !selectionText}
            onClick={() => { handleAIQuery(customPrompt); setCustomPrompt(""); }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
          </button>
        </section>

        {(streamedText || isGenerating || errorMessage) && (
          <section className={`result-panel ${errorMessage ? "error-state" : ""}`}>
            <div className="section-label">
              {tr.main.aiOutput}
              {isGenerating && <span className="cohere-status-badge" style={{ marginLeft: "auto", fontSize: "0.65rem", padding: "1px 6px" }}>GEN</span>}
            </div>
            <div className="stream-area">
              {errorMessage ? `⚠️ ${errorMessage}` : streamedText}
              {isGenerating && <span className="cursor-caret" />}
              <div ref={streamEndRef} />
            </div>
          </section>
        )}
      </main>

      <footer className="footer-bar">
        <button className="icon-btn" onClick={handleOpenSettings} style={{ marginRight: "auto" }}>
          <IconGear />
        </button>
        {isGenerating ? (
          <button className="btn btn-secondary" onClick={handleStop}>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><rect width="6" height="6" x="9" y="9" rx="1"/></svg>
            {tr.main.stop}
          </button>
        ) : (
          <>
            <button className="btn btn-secondary" onClick={handleCopyToClipboard} disabled={!streamedText || !!errorMessage}>
              {copySuccess ? (
                <><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>{tr.main.copied}</>
              ) : (
                <><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>{tr.main.copy}</>
              )}
            </button>
            <button className="btn btn-primary" onClick={handlePasteBack} disabled={!!errorMessage || (!streamedText && !selectionText)}>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20"/><path d="m17 5-5-3-5 3"/><path d="m7 19 5 3 5-3"/></svg>
              <span className="btn-insert-label">
                {tr.main.insertReplace.split("\n").map((line, i) => (
                  <span key={i}>{line}</span>
                ))}
              </span>
            </button>
          </>
        )}
      </footer>
    </div>
  );
}
