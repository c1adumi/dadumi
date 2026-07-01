import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import {
  loadSettings,
  saveSettings,
  getActiveProviderSettings,
  updateProviderSettings,
  getSystemPrompt,
  type AppSettings,
  type ProviderSettings,
  type Theme,
} from "../utils/settings";
import { getProvider, type ProviderID, type ProviderDef, type ModelDef } from "../utils/providers";
import { t, type Language, type T } from "../utils/i18n";

interface SettingsContextValue {
  settings: AppSettings;
  activeProviderSettings: ProviderSettings;
  activeProviderDef: ProviderDef;
  dynamicModels: ModelDef[];
  isFetchingModels: boolean;
  tr: T;
  setActiveProvider: (id: ProviderID) => void;
  setModel: (model: string) => void;
  setConfigField: (key: string, value: string) => void;
  setSystemPrompt: (prompt: string, lang?: Language) => void;
  setLanguage: (lang: Language) => void;
  setTheme: (theme: Theme) => void;
  setInsertShortcutKey: (key: string) => void;
  setAutoTrigger: (enabled: boolean) => void;
  persistConfigField: () => void;
  refreshModels: () => void;
  currentSystemPrompt: string;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [dynamicModels, setDynamicModels] = useState<ModelDef[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const prevCopilotTokenRef = useRef<string | undefined>(undefined);

  const persist = useCallback((next: AppSettings) => {
    setSettings(next);
    saveSettings(next);
  }, []);

  const activeProviderDef = getProvider(settings.activeProvider);
  const activeProviderSettings = getActiveProviderSettings(settings);

  const fetchModels = useCallback(async (providerDef: ProviderDef, config: Record<string, string>) => {
    if (!providerDef.fetchModels) return;
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

  useEffect(() => {
    const copilotToken = settings.providers["github-copilot"]?.config.githubToken;
    if (settings.activeProvider === "github-copilot" && copilotToken && copilotToken !== prevCopilotTokenRef.current) {
      prevCopilotTokenRef.current = copilotToken;
      fetchModels(activeProviderDef, activeProviderSettings.config);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.providers["github-copilot"]?.config.githubToken]);

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

  const setSystemPrompt = useCallback((prompt: string, lang?: Language) => {
    const targetLang = lang ?? settings.language
    persist({
      ...settings,
      systemPrompts: { ...settings.systemPrompts, [targetLang]: prompt },
    });
  }, [settings, persist]);

  const setLanguage = useCallback((lang: Language) => {
    persist({ ...settings, language: lang });
  }, [settings, persist]);

  const setTheme = useCallback((theme: Theme) => {
    persist({ ...settings, theme });
  }, [settings, persist]);

  const setInsertShortcutKey = useCallback((key: string) => {
    persist({ ...settings, insertShortcutKey: key });
  }, [settings, persist]);

  const setAutoTrigger = useCallback((enabled: boolean) => {
    persist({ ...settings, autoTrigger: enabled });
  }, [settings, persist]);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme ?? "dark";
  }, [settings.theme]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "dadumi_settings" && e.newValue) {
        try {
          const updated = JSON.parse(e.newValue) as AppSettings;
          setSettings(updated);
        } catch { /* ignore corrupt */ }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const refreshModels = useCallback(() => {
    fetchModels(activeProviderDef, activeProviderSettings.config);
  }, [activeProviderDef, activeProviderSettings, fetchModels]);

  const value: SettingsContextValue = {
    settings,
    activeProviderSettings,
    activeProviderDef,
    dynamicModels,
    isFetchingModels,
    tr: t(settings.language ?? "en"),
    setActiveProvider,
    setModel,
    setConfigField,
    setSystemPrompt,
    setLanguage,
    setTheme,
    setInsertShortcutKey,
    setAutoTrigger,
    persistConfigField,
    refreshModels,
    currentSystemPrompt: getSystemPrompt(settings),
  };

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside SettingsProvider");
  return ctx;
}
