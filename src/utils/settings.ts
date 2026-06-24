import type { ProviderID } from "./providers"
import { PROVIDERS } from "./providers"
import type { Language } from "./i18n"

export interface ProviderSettings {
  providerId: ProviderID
  model: string
  config: Record<string, string>
}

export interface AppSettings {
  activeProvider: ProviderID
  systemPrompt: string
  language: Language
  providers: Partial<Record<ProviderID, ProviderSettings>>
}

const STORAGE_KEY = "dadumi_settings"

const DEFAULT_SYSTEM_PROMPT =
  "You are a helpful writing assistant. Respond ONLY with the requested text edit or completion, without any intro, outro, explanations, markdown code blocks, or conversational filler."

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
  return {
    activeProvider: "bedrock",
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    language: "en",
    providers: { bedrock: defaultProviderSettings("bedrock") },
  }
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
  return {
    ...settings,
    language: settings.language ?? "en",
    providers,
  }
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
