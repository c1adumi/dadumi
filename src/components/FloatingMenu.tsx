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
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("dadumi_gemini_api_key") || "");
  const [model, setModel] = useState(() => localStorage.getItem("dadumi_gemini_model") || "gemini-2.5-flash");
  const [systemPrompt, setSystemPrompt] = useState(
    () => localStorage.getItem("dadumi_system_prompt") || "You are a helpful writing assistant. Respond ONLY with the requested text edit or completion, without any intro, outro, explanations, markdown code blocks, or conversational filler."
  );

  const streamEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Auto scroll streaming response
  useEffect(() => {
    if (streamEndRef.current) {
      streamEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [streamedText]);

  // Persist settings
  const saveSettings = (newKey: string, newModel: string, newSys: string) => {
    setApiKey(newKey);
    setModel(newModel);
    setSystemPrompt(newSys);
    localStorage.setItem("dadumi_gemini_api_key", newKey);
    localStorage.setItem("dadumi_gemini_model", newModel);
    localStorage.setItem("dadumi_system_prompt", newSys);
  };

  // Preset prompts definition
  const presets = [
    {
      id: "grammar",
      title: "Fix Grammar",
      desc: "Fix spelling & punctuation",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
      ),
      instruction: "Correct any spelling, grammatical, or punctuation errors in this text while keeping the exact meaning and tone unchanged.",
    },
    {
      id: "improve",
      title: "Improve Writing",
      desc: "Enhance flow and clarity",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275Z"/></svg>
      ),
      instruction: "Improve the clarity, vocabulary, flow, and overall quality of this text. Ensure it sounds polished and natural.",
    },
    {
      id: "professional",
      title: "Professional Tone",
      desc: "Rewrite for formal business",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
      ),
      instruction: "Rewrite this text in a professional, polite, and clear business tone, suitable for emails, Slack, and reports.",
    },
    {
      id: "continue",
      title: "Continue Writing",
      desc: "Autocompletes next lines",
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
      // 1. If in Tauri, query the Tauri LLM system
      if (isTauri()) {
        try {
          // Send request through Tauri IPC.
          // Note: Tauri backend will invoke llm stream. We hook into it by listening to 'llm-chunk' event.
          // Or wait, we can also query the API directly via HTTP from the Webview (which is simpler for front-end prototyping, 
          // but we provide Tauri IPC command invoke as the primary method if implemented).
          // Let's implement client-side fetch as a super reliable demo fallback that works everywhere if API key is provided!
          if (!apiKey) {
            // If in Tauri and no API key, let's call Tauri command "stream_completion"
            await invokeCmd("stream_completion", { instruction, text: selectionText });
            return;
          }
        } catch (tauriError) {
          console.warn("Tauri IPC failed, falling back to direct HTTP stream:", tauriError);
        }
      }

      // 2. Direct HTTP Gemini Stream Fallback
      if (!apiKey) {
        setStreamedText("⚠️ Error: Please open settings (⚙️) and enter your Gemini API Key first.");
        setIsGenerating(false);
        return;
      }

      const promptPayload = `${systemPrompt}\n\nTask: ${instruction}\n\nInput Text:\n"""\n${selectionText}\n"""\n\nFinal Output:`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: promptPayload }],
              },
            ],
          }),
          signal: abortControllerRef.current.signal,
        }
      );

      if (!response.ok) {
        const errorJson = await response.json().catch(() => ({}));
        throw new Error(errorJson?.error?.message || `HTTP error ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("ReadableStream not supported by browser/webview.");

      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        // Keep the last partial line in the buffer
        buffer = lines.pop() || "";

        for (const line of lines) {
          const cleanLine = line.trim();
          if (!cleanLine) continue;

          // SSE data starts with 'data: '
          if (cleanLine.startsWith("data:")) {
            const jsonStr = cleanLine.substring(5).trim();
            if (jsonStr === "[DONE]") continue;

            try {
              const data = JSON.parse(jsonStr);
              const textChunk = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
              setStreamedText((prev) => prev + textChunk);
            } catch (e) {
              // Ignore partial or parsing errors in stream
            }
          }
        }
      }

      // Read remaining buffer
      if (buffer && buffer.startsWith("data:")) {
        try {
          const jsonStr = buffer.substring(5).trim();
          const data = JSON.parse(jsonStr);
          const textChunk = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
          setStreamedText((prev) => prev + textChunk);
        } catch (e) {}
      }

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
    <div className={`glass-container ${isGenerating ? "processing" : ""}`}>
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
            onClick={() => setShowSettings(false)}
            aria-label="Back"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>
          </button>
        </div>

        <div className="settings-body">
          <div className="form-group">
            <label className="form-label" htmlFor="apiKeyInput">Gemini API Key</label>
            <input
              id="apiKeyInput"
              type="password"
              className="form-input"
              placeholder="AIzaSy..."
              value={apiKey}
              onChange={(e) => saveSettings(e.target.value, model, systemPrompt)}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="modelSelect">Gemini Model</label>
            <div className="select-wrapper">
              <select
                id="modelSelect"
                className="form-select"
                value={model}
                onChange={(e) => saveSettings(apiKey, e.target.value, systemPrompt)}
              >
                <option value="gemini-2.5-flash">Gemini 2.5 Flash (Fastest)</option>
                <option value="gemini-2.5-pro">Gemini 2.5 Pro (Analytical)</option>
                <option value="gemini-1.5-flash">Gemini 1.5 Flash (Older Fast)</option>
                <option value="gemini-1.5-pro">Gemini 1.5 Pro (Older Quality)</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="systemPromptInput">System Instructions</label>
            <textarea
              id="systemPromptInput"
              className="form-input"
              rows={4}
              style={{ resize: "none" }}
              value={systemPrompt}
              onChange={(e) => saveSettings(apiKey, model, e.target.value)}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
