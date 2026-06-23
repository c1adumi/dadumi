import { useState, useEffect, useRef } from "react";
import { invokeCmd, isTauri } from "../utils/tauriBridge";

interface FloatingMenuProps {
  selectionText: string;
  onHide: () => void;
}

export default function FloatingMenu({
  selectionText,
  onHide,
}: FloatingMenuProps) {
  // UI states
  const [customPrompt, setCustomPrompt] = useState("");
  const [streamedText, setStreamedText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  // Settings states (loaded from local storage)
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("dadumi_bedrock_api_key") || "");
  const [region, setRegion] = useState(() => localStorage.getItem("dadumi_bedrock_region") || "ap-southeast-2");
  const [model, setModel] = useState(() => localStorage.getItem("dadumi_bedrock_model") || "au.anthropic.claude-sonnet-4-6");
  const [systemPrompt, setSystemPrompt] = useState(
    () => localStorage.getItem("dadumi_system_prompt") || "You are a helpful writing assistant. Respond ONLY with the requested text edit or completion, without any intro, outro, explanations, markdown code blocks, or conversational filler."
  );

  const streamEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleDragStart = async (e: React.MouseEvent) => {
    if (e.button !== 0 || !isTauri()) return;
    e.preventDefault();
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    getCurrentWindow().startDragging();
  };

  // Auto scroll streaming response
  useEffect(() => {
    if (streamEndRef.current) {
      streamEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [streamedText]);

  // Persist all settings to localStorage (called on blur, not on every keystroke)
  const persistSettings = () => {
    localStorage.setItem("dadumi_bedrock_api_key", apiKey);
    localStorage.setItem("dadumi_bedrock_region", region);
    localStorage.setItem("dadumi_bedrock_model", model);
    localStorage.setItem("dadumi_system_prompt", systemPrompt);
  };

  // Preset prompts definition
  const presets = [
    {
      id: "grammar",
      title: "Fix Grammar",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
      ),
      instruction: "Correct any spelling, grammatical, or punctuation errors in this text while keeping the exact meaning and tone unchanged.",
    },
    {
      id: "improve",
      title: "Improve Writing",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275Z"/></svg>
      ),
      instruction: "Improve the clarity, vocabulary, flow, and overall quality of this text. Ensure it sounds polished and natural.",
    },
    {
      id: "professional",
      title: "Professional Tone",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
      ),
      instruction: "Rewrite this text in a professional, polite, and clear business tone, suitable for emails, Slack, and reports.",
    },
    {
      id: "continue",
      title: "Continue Writing",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
      ),
      instruction: "Using the text below as the start, write the next 1-2 logical sentences, matching the style and flow.",
    },
  ];

  // Core LLM Streaming Handler
  const handleAIQuery = async (instruction: string) => {
    if (isGenerating) return;

    setIsGenerating(true);
    setStreamedText("");

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      if (!apiKey) {
        setStreamedText("⚠️ Error: Please open settings (⚙️) and enter your Bedrock API Key first.");
        setIsGenerating(false);
        return;
      }

      const userMessage = `${systemPrompt}\n\nTask: ${instruction}\n\nInput Text:\n"""\n${selectionText}\n"""\n\nFinal Output:`;

      const response = await fetch(
        `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(model)}/converse`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            messages: [
              {
                role: "user",
                content: [{ text: userMessage }],
              },
            ],
          }),
          signal: abortControllerRef.current.signal,
        }
      );

      if (!response.ok) {
        const errorJson = await response.json().catch(() => ({}));
        throw new Error((errorJson as any)?.message || `HTTP ${response.status}`);
      }

      const data = await response.json();
      const text = (data as any)?.output?.message?.content?.[0]?.text ?? "";
      setStreamedText(text);

    } catch (err: any) {
      if (err.name === "AbortError") {
        console.log("Generation aborted by user.");
      } else {
        console.error("AI Generation Error:", err);
        setStreamedText((prev) => prev + `\n\n⚠️ Error during generation: ${err.message}`);
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsGenerating(false);
  };

  const handlePasteBack = async () => {
    const finalResult = streamedText || selectionText;
    if (!finalResult) return;

    // Paste back to target app using Tauri OS hook
    await invokeCmd("paste_text", { text: finalResult });
    onHide();
  };

  const handleCopyToClipboard = () => {
    const finalResult = streamedText || selectionText;
    if (!finalResult) return;

    navigator.clipboard.writeText(finalResult).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    });
  };

  return (
    <div data-tauri-drag-region className={`glass-container ${isGenerating ? "processing" : ""}`}>
      <div data-tauri-drag-region className="drag-handle" onMouseDown={handleDragStart}>
        <span className="drag-indicator" />
      </div>

      {/* Main Content Area */}
      <main className="scroll-content">
        {/* AI Action Presets */}
        <section className="presets-grid">
          {presets.map((preset) => (
            <button
              key={preset.id}
              className="preset-card"
              disabled={isGenerating || !selectionText}
              onClick={() => handleAIQuery(preset.instruction)}
            >
              <span className="preset-icon">{preset.icon}</span>
              <span className="preset-title">{preset.title}</span>
            </button>
          ))}

          <button
            className="preset-card"
            disabled={isGenerating}
            onClick={() => setShowSettings(true)}
          >
            <span className="preset-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/></svg>
            </span>
            <span className="preset-title">Configure Settings...</span>
          </button>
        </section>

        <div className="menu-separator" />

        {/* Custom prompt entry */}
        <section className="custom-prompt-container">
          <input
            className="custom-input"
            type="text"
            placeholder="Custom instruction..."
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
            onClick={() => {
              handleAIQuery(customPrompt);
              setCustomPrompt("");
            }}
            title="Send instructions"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
          </button>
        </section>

        {/* AI Streaming Response */}
        {(streamedText || isGenerating) && (
          <section className={`result-panel ${streamedText.includes("⚠️") || streamedText.includes("Error") ? "error-state" : ""}`}>
            <div className="section-label">
              AI Output
              {isGenerating && <span className="cohere-status-badge" style={{ marginLeft: "auto", fontSize: "0.65rem", padding: "1px 6px" }}>STREAM</span>}
            </div>
            <div className="stream-area">
              {streamedText}
              {isGenerating && <span className="cursor-caret" />}
              <div ref={streamEndRef} />
            </div>
          </section>
        )}
      </main>

      {/* Footer Controls */}
      <footer className="footer-bar">
        {isGenerating ? (
          <button className="btn btn-secondary" onClick={handleStop}>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><rect width="6" height="6" x="9" y="9" rx="1"/></svg>
            Stop Generation
          </button>
        ) : (
          <>
            <button
              className="btn btn-secondary"
              onClick={handleCopyToClipboard}
              disabled={!streamedText}
            >
              {copySuccess ? (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                  Copy to Clipboard
                </>
              )}
            </button>
            <button
              className="btn btn-primary"
              onClick={handlePasteBack}
              disabled={!streamedText && !selectionText}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20"/><path d="m17 5-5-3-5 3"/><path d="m7 19 5 3 5-3"/></svg>
              Insert / Replace
            </button>
          </>
        )}
      </footer>

      {/* Settings Overlay Slide-in Panel */}
      <section className={`settings-panel ${showSettings ? "open" : ""}`}>
        <div className="settings-header">
          <div className="settings-title">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
            Configuration Settings
          </div>
          <button
            className="icon-btn"
            onClick={() => { persistSettings(); setShowSettings(false); }}
            aria-label="Back"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>
          </button>
        </div>

        <div className="settings-body">
          <div className="form-group">
            <label className="form-label" htmlFor="apiKeyInput">Bedrock API Key</label>
            <input
              id="apiKeyInput"
              type="password"
              className="form-input"
              placeholder="ABSK..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onBlur={persistSettings}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="regionInput">AWS Region</label>
            <input
              id="regionInput"
              type="text"
              className="form-input"
              placeholder="ap-southeast-2"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              onBlur={persistSettings}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="modelSelect">Bedrock Model</label>
            <select
              id="modelSelect"
              className="form-select"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              onBlur={persistSettings}
            >
              <option value="au.anthropic.claude-sonnet-4-6">Claude Sonnet 4.6 (Default)</option>
              <option value="au.anthropic.claude-haiku-4-5-20251001-v1:0">Claude Haiku 4.5 (Fastest)</option>
              <option value="au.anthropic.claude-sonnet-4-5-20250929-v1:0">Claude Sonnet 4.5</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="systemPromptInput">System Instructions</label>
            <textarea
              id="systemPromptInput"
              className="form-input"
              rows={4}
              style={{ resize: "none" }}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              onBlur={persistSettings}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
