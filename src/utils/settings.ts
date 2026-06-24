import type { ProviderID } from "./providers"
import { PROVIDERS } from "./providers"

export interface ProviderSettings {
  providerId: ProviderID
  model: string
  config: Record<string, string>
}

export interface AppSettings {
  activeProvider: ProviderID
  systemPrompt: string
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
    if (raw) return JSON.parse(raw) as AppSettings
  } catch {
    // corrupt storage — fall through to defaults
  }
  return {
    activeProvider: "bedrock",
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    providers: { bedrock: defaultProviderSettings("bedrock") },
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
