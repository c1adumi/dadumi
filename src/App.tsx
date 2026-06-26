import { useState, useEffect } from "react";
import "./styles/index.css";
import FloatingMenu from "./components/FloatingMenu";
import { listenEvent, triggerMockEvent, isTauri, invokeCmd } from "./utils/tauriBridge";

function App() {
  const [selectionText, setSelectionText] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  // Simulation state (for testing inside browser)
  const [mockActiveApp, setMockActiveApp] = useState("Google Chrome");
  const [mockSelectionInput, setMockSelectionInput] = useState(
    "Inline AI is a desktop writing assistant that runs natively in the background. It allows users to trigger AI directly within any typing environment without copy-pasting."
  );

  // Hook into Tauri Events & Global Key Listener
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    // Listen to real Tauri event sent by Rust backend
    const setupTauriListener = async () => {
      unsubscribe = await listenEvent("selection-captured", (payload: any) => {
        if (payload) {
          const text = payload.text || "";
          const source = payload.source || "hotkey";

          // Hotkey opens only when there is an actual text selection.
          if (source === "hotkey" && text.trim().length === 0) {
            setIsOpen(false);
            return;
          }

          setSelectionText(text);
          setIsOpen(true);
        }
      });
    };
    setupTauriListener();

    // Listen to browser-level Alt+Space / Option+Space for simulator mode
    const handleBrowserKeyDown = (e: KeyboardEvent) => {
      // Check for Alt/Option + Space
      if (e.altKey && e.code === "Space") {
        e.preventDefault();
        
        if (isTauri()) {
          // If we are inside Tauri, the Rust backend handles global hotkeys
          return;
        }

        // Inside Browser: Trigger mock trigger
        triggerMockEvent("selection-captured", {
          text: mockSelectionInput,
          app_name: mockActiveApp,
        });
      }

      // Close on Escape key
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleBrowserKeyDown);

    return () => {
      if (unsubscribe) unsubscribe();
      window.removeEventListener("keydown", handleBrowserKeyDown);
    };
  }, [mockSelectionInput, mockActiveApp]);

  const handleHide = () => {
    setIsOpen(false);
    // If in Tauri, we will also hide the actual window via Rust IPC
    invokeCmd("hide_window");
  };

  const handleSimulateTrigger = () => {
    triggerMockEvent("selection-captured", {
      text: mockSelectionInput,
      app_name: mockActiveApp,
    });
  };

  return (
    <div 
      className={`app-root ${isTauri() ? "in-tauri" : "browser-env"}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleHide();
        }
      }}
    >
      {/* Floating Overlay Menu */}
      {isOpen && (
        <FloatingMenu
          selectionText={selectionText}
          onHide={handleHide}
        />
      )}

      {/* Browser Simulator Overlay (Only visible in Browser Mode) */}
      {!isTauri() && (
        <div className="dev-simulator-bar">
          <div className="sim-info">
            💻 <strong>Browser Simulator Mode</strong>
          </div>
          
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Simulate App:</span>
            <select
              value={mockActiveApp}
              onChange={(e) => setMockActiveApp(e.target.value)}
              className="form-select"
              style={{ padding: "2px 6px", fontSize: "0.8rem", height: "24px" }}
            >
              <option value="Google Chrome">Google Chrome</option>
              <option value="Slack">Slack</option>
              <option value="Notion">Notion</option>
              <option value="Microsoft Word">MS Word</option>
              <option value="Terminal">Terminal</option>
            </select>
          </div>

          <div style={{ display: "flex", gap: "8px", alignItems: "center", flex: 1 }}>
            <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Mock Selection:</span>
            <input
              type="text"
              value={mockSelectionInput}
              onChange={(e) => setMockSelectionInput(e.target.value)}
              className="form-input"
              style={{ padding: "2px 6px", fontSize: "0.8rem", height: "24px", flex: 1 }}
              placeholder="Type highlighted text here..."
            />
          </div>

          <button className="sim-btn" onClick={handleSimulateTrigger}>
            Trigger Hotkey
          </button>
          
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginLeft: "4px" }}>
            (or press <strong>Alt + Space</strong>)
          </div>
        </div>
      )}
      
      {/* Visual background instructions when overlay is closed in simulator */}
      {!isOpen && !isTauri() && (
        <div style={{
          textAlign: "center",
          maxWidth: "400px",
          color: "rgba(255,255,255,0.4)",
          padding: "24px",
          background: "rgba(255,255,255,0.02)",
          border: "1px dashed rgba(255,255,255,0.1)",
          borderRadius: "16px",
          backdropFilter: "blur(10px)"
        }}>
          <h2 style={{ fontFamily: "var(--font-display)", letterSpacing: "-0.6px", color: "var(--text-primary)", marginBottom: "8px" }}>In-Line AI Assistant</h2>
          <p style={{ fontSize: "0.9rem", marginBottom: "16px", lineHeight: "1.4" }}>
            Press <strong style={{ color: "var(--cohere-coral)" }}>Alt + Space</strong> or click the <strong>Trigger Hotkey</strong> button on the simulator bar below to open the writing assistant.
          </p>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            Tip: Go to settings (⚙️) inside the overlay to set your Gemini API Key and test live generation.
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
