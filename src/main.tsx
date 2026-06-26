import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import SettingsWindow from "./components/SettingsWindow";
import { SettingsProvider } from "./context/SettingsContext";
import { invokeCmd, isTauri } from "./utils/tauriBridge";

const isSettingsView = new URLSearchParams(window.location.search).get("view") === "settings";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <SettingsProvider>
      {isSettingsView ? <SettingsWindow /> : <App />}
    </SettingsProvider>
  </React.StrictMode>,
);

if (isSettingsView && isTauri()) {
  requestAnimationFrame(() => {
    setTimeout(() => invokeCmd("notify_dom_ready").catch(() => {}), 50);
  });
}
