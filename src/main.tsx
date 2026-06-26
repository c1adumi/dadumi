import React from "react";
import ReactDOM from "react-dom/client";
import { useEffect, useState } from "react";
import App from "./App";
import SettingsWindow from "./components/SettingsWindow";
import { SettingsProvider } from "./context/SettingsContext";
import { invokeCmd, isTauri } from "./utils/tauriBridge";

function detectSettingsFromUrl(): boolean {
  const byInjectedView = (window as any).__DADUMI_VIEW === "settings";
  const byQuery = new URLSearchParams(window.location.search).get("view") === "settings";
  const hash = window.location.hash;
  const byHash = hash === "#/settings" || hash.startsWith("#/settings?") || hash.includes("view=settings");
  return byInjectedView || byQuery || byHash;
}

function shouldNotifyDomReady(): boolean {
  return (window as any).__DADUMI_VIEW === "settings";
}

function Root() {
  const [isSettingsView, setIsSettingsView] = useState<boolean>(() => detectSettingsFromUrl());

  useEffect(() => {
    if (isSettingsView || !isTauri()) return;

    let active = true;
    (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const current = getCurrentWindow() as any;
        if (active && current?.label === "settings") {
          setIsSettingsView(true);
        }
      } catch {
        // Ignore: fallback detection is best-effort only.
      }
    })();

    return () => {
      active = false;
    };
  }, [isSettingsView]);

  useEffect(() => {
    if (!isSettingsView || !isTauri() || !shouldNotifyDomReady()) return;
    requestAnimationFrame(() => {
      setTimeout(() => invokeCmd("notify_dom_ready").catch(() => {}), 50);
    });
  }, [isSettingsView]);

  return (
    <SettingsProvider>
      {isSettingsView ? <SettingsWindow /> : <App />}
    </SettingsProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
