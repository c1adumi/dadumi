import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import {
  loadSettings,
  saveSettings,
  getActiveProviderSettings,
  updateProviderSettings,
  type AppSettings,
  type ProviderSettings,
} from "../utils/settings";
import { getProvider, type ProviderID, type ProviderDef, type ModelDef } from "../utils/providers";

interface SettingsContextValue {
  settings: AppSettings;
  activeProviderSettings: ProviderSettings;
  activeProviderDef: ProviderDef;
  dynamicModels: ModelDef[];
  isFetchingModels: boolean;
  setActiveProvider: (id: ProviderID) => void;
  setModel: (model: string) => void;
  setConfigField: (key: string, value: string) => void;
  setSystemPrompt: (prompt: string) => void;
  persistConfigField: () => void;
  refreshModels: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [dynamicModels, setDynamicModels] = useState<ModelDef[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);

  const persist = useCallback((next: AppSettings) => {
    setSettings(next);
    saveSettings(next);
  }, []);

  const activeProviderDef = getProvider(settings.activeProvider);
  const activeProviderSettings = getActiveProviderSettings(settings);

  const fetchModels = useCallback(async (providerDef: ProviderDef, config: Record<string, string>) => {
    if (!providerDef.fetchModels || !config.apiKey) return;
    setIsFetchingModels(true);
    try {
      const models = await providerDef.fetchModels(config);
      setDynamicModels(models);
    } catch {
      setDynamicModels([]);
    } finally {
      setIsFetchingModels(false);
    }
  }, []);

  useEffect(() => {
    setDynamicModels([]);
    fetchModels(activeProviderDef, activeProviderSettings.config);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.activeProvider]);

  const setActiveProvider = useCallback((id: ProviderID) => {
    persist({ ...settings, activeProvider: id });
  }, [settings, persist]);

  const setModel = useCallback((model: string) => {
    persist(updateProviderSettings(settings, settings.activeProvider, { model }));
  }, [settings, persist]);

  const setConfigField = useCallback((key: string, value: string) => {
    const current = getActiveProviderSettings(settings);
    const updated = updateProviderSettings(settings, settings.activeProvider, {
      config: { ...current.config, [key]: value },
    });
    setSettings(updated);
    saveSettings(updated);
  }, [settings]);

  const persistConfigField = useCallback(() => {
    saveSettings(settings);
    fetchModels(activeProviderDef, getActiveProviderSettings(settings).config);
  }, [settings, activeProviderDef, fetchModels]);

  const setSystemPrompt = useCallback((prompt: string) => {
    persist({ ...settings, systemPrompt: prompt });
  }, [settings, persist]);

  const refreshModels = useCallback(() => {
    fetchModels(activeProviderDef, activeProviderSettings.config);
  }, [activeProviderDef, activeProviderSettings, fetchModels]);

  const value: SettingsContextValue = {
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
  };

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside SettingsProvider");
  return ctx;
}
