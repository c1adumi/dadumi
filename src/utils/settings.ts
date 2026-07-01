import type { ProviderID } from "./providers"
import { PROVIDERS } from "./providers"
import type { Language } from "./i18n"
import { DEFAULT_PROMPTS } from "../prompts"

export interface ProviderSettings {
  providerId: ProviderID
  model: string
  config: Record<string, string>
}

export type Theme = "dark" | "light"

export interface AppSettings {
  activeProvider: ProviderID
  systemPrompts: Record<Language, string>
  language: Language
  theme: Theme
  insertShortcutKey: string
  autoTrigger: boolean
  copilotThinking: boolean
  providers: Partial<Record<ProviderID, ProviderSettings>>
}

const STORAGE_KEY = "dadumi_settings"

function defaultSettings(): AppSettings {
  return {
    activeProvider: "bedrock",
    systemPrompts: { en: DEFAULT_PROMPTS.en, ko: DEFAULT_PROMPTS.ko },
    language: "en",
    theme: "dark",
    insertShortcutKey: "Enter",
    autoTrigger: false,
    copilotThinking: false,
    providers: { bedrock: defaultProviderSettings("bedrock") },
  }
}

function defaultProviderSettings(providerId: ProviderID): ProviderSettings {
  const def = PROVIDERS.find((p) => p.id === providerId)!
  const config: Record<string, string> = {}
  for (const field of def.fields) {
    if (field.defaultValue) config[field.key] = field.defaultValue
  }
  return { providerId, model: def.models[0]?.id ?? "", config }
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as AppSettings
      return migrateSettings(parsed)
    }
  } catch {
    // corrupt storage — fall through to defaults
  }
  return defaultSettings()
}

function migrateSettings(settings: AppSettings): AppSettings {
  const providers = { ...settings.providers }
  for (const [id, providerSettings] of Object.entries(providers)) {
    if (!providerSettings) continue
    const def = PROVIDERS.find((p) => p.id === id)
    if (!def) continue
    const validModel = def.models.some((m) => m.id === providerSettings.model)
    if (!validModel) {
      providers[id as ProviderID] = { ...providerSettings, model: def.models[0]?.id ?? "" }
    }
  }
  const defaults = defaultSettings()
  const systemPrompts: Record<Language, string> = {
    en: (settings as any).systemPrompts?.en ?? (settings as any).systemPrompt ?? defaults.systemPrompts.en,
    ko: (settings as any).systemPrompts?.ko ?? defaults.systemPrompts.ko,
  }
  return {
    ...settings,
    systemPrompts,
    language: settings.language ?? "en",
    theme: settings.theme ?? "dark",
    insertShortcutKey: settings.insertShortcutKey ?? "Enter",
    autoTrigger: settings.autoTrigger ?? false,
    copilotThinking: settings.copilotThinking ?? false,
    providers,
  }
}

export function getSystemPrompt(settings: AppSettings): string {
  return settings.systemPrompts[settings.language] ?? settings.systemPrompts.en
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

export function getActiveProviderSettings(settings: AppSettings): ProviderSettings {
  return settings.providers[settings.activeProvider] ?? defaultProviderSettings(settings.activeProvider)
}

export function updateProviderSettings(
  settings: AppSettings,
  providerId: ProviderID,
  patch: Partial<ProviderSettings>,
): AppSettings {
  const existing = settings.providers[providerId] ?? defaultProviderSettings(providerId)
  return {
    ...settings,
    providers: {
      ...settings.providers,
      [providerId]: { ...existing, ...patch },
    },
  }
}
