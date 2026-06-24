import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import {
  loadSettings,
  saveSettings,
  getActiveProviderSettings,
  updateProviderSettings,
  type AppSettings,
  type ProviderSettings,
} from "../utils/settings";
import { getProvider, type ProviderID, type ProviderDef } from "../utils/providers";

interface SettingsContextValue {
  settings: AppSettings;
  activeProviderSettings: ProviderSettings;
  activeProviderDef: ProviderDef;
  setActiveProvider: (id: ProviderID) => void;
  setModel: (model: string) => void;
  setConfigField: (key: string, value: string) => void;
  setSystemPrompt: (prompt: string) => void;
  persistConfigField: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());

  const persist = useCallback((next: AppSettings) => {
    setSettings(next);
    saveSettings(next);
  }, []);

  const setActiveProvider = useCallback((id: ProviderID) => {
    persist({ ...settings, activeProvider: id });
  }, [settings, persist]);

  const setModel = useCallback((model: string) => {
    persist(updateProviderSettings(settings, settings.activeProvider, { model }));
  }, [settings, persist]);

  const setConfigField = useCallback((key: string, value: string) => {
    const current = getActiveProviderSettings(settings);
    setSettings(updateProviderSettings(settings, settings.activeProvider, {
      config: { ...current.config, [key]: value },
    }));
  }, [settings]);

  const persistConfigField = useCallback(() => {
    saveSettings(settings);
  }, [settings]);

  const setSystemPrompt = useCallback((prompt: string) => {
    persist({ ...settings, systemPrompt: prompt });
  }, [settings, persist]);

  const value: SettingsContextValue = {
    settings,
    activeProviderSettings: getActiveProviderSettings(settings),
    activeProviderDef: getProvider(settings.activeProvider),
    setActiveProvider,
    setModel,
    setConfigField,
    setSystemPrompt,
    persistConfigField,
  };

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside SettingsProvider");
  return ctx;
}
