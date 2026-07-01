import { invokeCmd, isTauri } from "./tauriBridge"

interface CopilotSessionCache {
  token: string
  expiresAt: number
}

let copilotSessionCache: CopilotSessionCache | null = null
let exchangeInProgress: Promise<string> | null = null

async function getCopilotSessionToken(githubToken: string): Promise<string> {
  if (exchangeInProgress) return exchangeInProgress

  if (copilotSessionCache && copilotSessionCache.expiresAt - Date.now() > 10 * 60 * 1000) {
    return copilotSessionCache.token
  }

  const exchange = (async () => {
    try {
      const data = await invokeCmd("copilot_exchange_token", { githubToken }) as {
        token: string
        expires_at: number
      }
      copilotSessionCache = {
        token: data.token,
        expiresAt: data.expires_at * 1000,
      }
      return data.token
    } catch (err: any) {
      copilotSessionCache = null
      throw new Error(
        err?.message?.includes("re-authenticate")
          ? "Copilot authentication expired. Please re-authenticate."
          : `Copilot token exchange failed: ${err?.message ?? err}`
      )
    } finally {
      exchangeInProgress = null
    }
  })()

  exchangeInProgress = exchange
  return exchange
}

function invalidateCopilotSessionCache(): void {
  copilotSessionCache = null
}

export type ProviderID =
  | "openai"
  | "anthropic"
  | "gemini"
  | "bedrock"
  | "openrouter"
  | "github-copilot"
  | "custom"

export interface ModelDef {
  id: string
  label: string
}

export interface ProviderField {
  key: string
  label: string
  type: "password" | "text" | "select"
  placeholder?: string
  options?: { value: string; label: string }[]
  defaultValue?: string
}

export interface ProviderDef {
  readonly id: ProviderID
  readonly label: string
  readonly fields: ProviderField[]
  readonly models: ModelDef[]
  fetchModels?: (config: Record<string, string>) => Promise<ModelDef[]>
  buildRequest: (
    config: Record<string, string>,
    model: string,
    systemPrompt: string,
    userMessage: string,
    signal: AbortSignal,
  ) => Promise<Response>
}

const openaiModels: ModelDef[] = [
  { id: "gpt-4o", label: "GPT-4o" },
  { id: "gpt-4o-mini", label: "GPT-4o Mini (Fast)" },
  { id: "gpt-4-turbo", label: "GPT-4 Turbo" },
  { id: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
]

export const openai: ProviderDef = {
  id: "openai",
  label: "OpenAI",
  fields: [
    { key: "apiKey", label: "API Key", type: "password", placeholder: "sk-..." },
  ],
  models: openaiModels,
  buildRequest(config, model, systemPrompt, userMessage, signal) {
    return fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      }),
      signal,
    })
  },
}

const anthropicModels: ModelDef[] = [
  { id: "claude-opus-4-5", label: "Claude Opus 4.5" },
  { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 (Fast)" },
  { id: "claude-3-7-sonnet-latest", label: "Claude 3.7 Sonnet" },
  { id: "claude-3-5-haiku-latest", label: "Claude 3.5 Haiku (Fast)" },
]

export const anthropic: ProviderDef = {
  id: "anthropic",
  label: "Anthropic",
  fields: [
    {
      key: "apiKey",
      label: "API Key",
      type: "password",
      placeholder: "sk-ant-...",
    },
  ],
  models: anthropicModels,
  buildRequest(config, model, systemPrompt, userMessage, signal) {
    return fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
      signal,
    })
  },
}

const geminiModels: ModelDef[] = [
  { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash (Fast)" },
  { id: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite" },
  { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
  { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
]

export const gemini: ProviderDef = {
  id: "gemini",
  label: "Google Gemini",
  fields: [
    {
      key: "apiKey",
      label: "API Key",
      type: "password",
      placeholder: "AIza...",
    },
  ],
  models: geminiModels,
  buildRequest(config, model, systemPrompt, userMessage, signal) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userMessage }] }],
      }),
      signal,
    })
  },
}

const BEDROCK_PREFIX_REGION: Record<string, string> = {
  "us.": "us-east-1",
  "eu.": "eu-west-1",
  "ap.": "ap-northeast-1",
  "apac.": "ap-northeast-2",
  "au.": "ap-southeast-2",
  "jp.": "ap-northeast-1",
}

function bedrockRegionFor(modelId: string): string {
  for (const [prefix, region] of Object.entries(BEDROCK_PREFIX_REGION)) {
    if (modelId.startsWith(prefix)) return region
  }
  return "ap-northeast-2"
}

export const bedrock: ProviderDef = {
  id: "bedrock",
  label: "AWS Bedrock",
  fields: [
    { key: "apiKey", label: "API Key", type: "password", placeholder: "ABSK..." },
  ],
  models: [
    { id: "us.anthropic.claude-sonnet-4-6", label: "Claude Sonnet 4.6 (Latest)" },
    { id: "us.anthropic.claude-sonnet-4-5-20250929-v1:0", label: "Claude Sonnet 4.5" },
    { id: "us.anthropic.claude-haiku-4-5-20251001-v1:0", label: "Claude Haiku 4.5 (Fast)" },
    { id: "us.amazon.nova-pro-v1:0", label: "Amazon Nova Pro" },
    { id: "us.amazon.nova-lite-v1:0", label: "Amazon Nova Lite (Fast)" },
  ],
  async fetchModels(config) {
    const res = await fetch(
      "https://bedrock.us-east-1.amazonaws.com/inference-profiles?maxResults=100",
      { headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` } },
    )
    if (!res.ok) return bedrock.models
    const data = await res.json() as { inferenceProfileSummaries?: { inferenceProfileId: string; inferenceProfileName: string }[] }
    const profiles = data.inferenceProfileSummaries ?? []
    const TEXT_PATTERN = /claude|nova-(micro|lite|pro|premier)|fable|opus|sonnet|haiku/i
    const mapped = profiles
      .filter((p) => TEXT_PATTERN.test(p.inferenceProfileId))
      .map((p) => ({ id: p.inferenceProfileId, label: p.inferenceProfileName }))
    return mapped.length > 0 ? mapped : bedrock.models
  },
  buildRequest(config, model, systemPrompt, userMessage, signal) {
    const region = bedrockRegionFor(model)
    return fetch(
      `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(model)}/converse`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({
          messages: [{ role: "user", content: [{ text: `${systemPrompt}\n\n${userMessage}` }] }],
        }),
        signal,
      },
    )
  },
}

const openrouterModels: ModelDef[] = [
  { id: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet" },
  { id: "openai/gpt-4o", label: "GPT-4o" },
  { id: "google/gemini-2.0-flash-001", label: "Gemini 2.0 Flash" },
  { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B" },
  { id: "mistralai/mistral-large", label: "Mistral Large" },
  { id: "deepseek/deepseek-r1", label: "DeepSeek R1" },
]

export const openrouter: ProviderDef = {
  id: "openrouter",
  label: "OpenRouter",
  fields: [
    {
      key: "apiKey",
      label: "API Key",
      type: "password",
      placeholder: "sk-or-...",
    },
  ],
  models: openrouterModels,
  buildRequest(config, model, systemPrompt, userMessage, signal) {
    return fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        "HTTP-Referer": "https://dadumi.app",
        "X-Title": "Dadumi",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      }),
      signal,
    })
  },
}

const COPILOT_BASE_URL = "https://api.githubcopilot.com"
const COPILOT_API_VERSION = "2026-06-01"
const COPILOT_POLL_SAFETY_MARGIN_MS = 3000

interface CopilotModelEntry {
  id: string
  name: string
  capabilities?: { type?: string }
  policy?: { state?: string }
  model_picker_enabled?: boolean
  supported_endpoints?: string[]
}

function isUsableCopilotChatModel(m: CopilotModelEntry): boolean {
  if (m.capabilities?.type !== "chat") return false
  if (m.policy?.state === "disabled") return false
  if (m.supported_endpoints && m.supported_endpoints.length > 0) {
    if (!m.supported_endpoints.includes("/chat/completions")) return false
  }
  if (m.model_picker_enabled === false && m.supported_endpoints !== undefined) return false
  return true
}

export async function copilotOAuthFlow(): Promise<{
  userCode: string
  verificationUri: string
  poll: (signal: AbortSignal) => Promise<string | null>
}> {
  if (!isTauri()) {
    throw new Error("GitHub Copilot login requires the desktop app")
  }

  const data = await invokeCmd("copilot_device_code") as {
    device_code: string
    user_code: string
    verification_uri: string
    interval: number
  }

  return {
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    async poll(signal: AbortSignal): Promise<string | null> {
      let interval = data.interval ?? 5

      while (!signal.aborted) {
        await new Promise((resolve) => setTimeout(resolve, interval * 1000 + COPILOT_POLL_SAFETY_MARGIN_MS))
        if (signal.aborted) return null

        const tokenData = await invokeCmd("copilot_poll_token", { deviceCode: data.device_code }) as {
          access_token?: string
          error?: string
          interval?: number
        }

        console.log("[Copilot] poll:", tokenData.error ?? "access_token received")

        if (tokenData.access_token) return tokenData.access_token

        if (tokenData.error === "slow_down") {
          interval = tokenData.interval ?? interval + 5
          continue
        }

        if (tokenData.error === "authorization_pending") continue

        console.error("[Copilot] unexpected error:", tokenData.error)
        return null
      }

      return null
    },
  }
}

async function fetchCopilotModels(githubToken: string): Promise<ModelDef[]> {
  try {
    const sessionToken = await getCopilotSessionToken(githubToken)
    let json: string
    if (isTauri()) {
      json = await invokeCmd("copilot_models", { sessionToken }) as string
    } else {
      const res = await fetch(`${COPILOT_BASE_URL}/models`, {
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          "X-GitHub-Api-Version": COPILOT_API_VERSION,
          "Editor-Version": "vscode/1.85.0",
          "Copilot-Integration-Id": "vscode-chat",
        },
        signal: AbortSignal.timeout(5000),
      })
      if (!res.ok) return []
      json = await res.text()
    }
    const data = JSON.parse(json) as { data?: CopilotModelEntry[] }
    const usable = (data.data ?? []).filter(isUsableCopilotChatModel)
    const byLabel = new Map<string, CopilotModelEntry>()
    for (const m of usable) {
      const existing = byLabel.get(m.name)
      if (!existing || m.id.length < existing.id.length) byLabel.set(m.name, m)
    }
    const seen = new Set<string>()
    const deduped: ModelDef[] = []
    for (const m of usable) {
      if (seen.has(m.name)) continue
      seen.add(m.name)
      const chosen = byLabel.get(m.name)!
      deduped.push({ id: chosen.id, label: chosen.name })
    }
    return deduped
  } catch {
    return []
  }
}

export async function enableCopilotModels(githubToken: string): Promise<void> {
  if (!isTauri()) return
  try {
    const sessionToken = await getCopilotSessionToken(githubToken)
    const json = await invokeCmd("copilot_models", { sessionToken }) as string
    const data = JSON.parse(json) as { data?: CopilotModelEntry[] }
    const disabled = (data.data ?? []).filter(
      (m) => m.capabilities?.type === "chat" && m.policy?.state === "disabled",
    )
    await Promise.all(
      disabled.map((m) =>
        invokeCmd("copilot_enable_model", { sessionToken, modelId: m.id }).catch(() => false),
      ),
    )
  } catch {
    return
  }
}

export const copilot: ProviderDef = {
  id: "github-copilot",
  label: "GitHub Copilot",
  fields: [
    {
      key: "githubToken",
      label: "GitHub OAuth Token",
      type: "password",
      placeholder: "Managed by OAuth login",
    },
  ],
  models: [
    { id: "gpt-4o", label: "GPT-4o" },
    { id: "claude-3.5-sonnet", label: "Claude 3.5 Sonnet" },
  ],
  async fetchModels(config) {
    if (!config.githubToken) return copilot.models
    const models = await fetchCopilotModels(config.githubToken)
    return models.length > 0 ? models : copilot.models
  },
  async buildRequest(config, model, systemPrompt, userMessage, signal) {
    const githubToken = config.githubToken
    if (!githubToken) {
      return new Response(
        JSON.stringify({ error: { message: "GitHub token not found. Please re-authenticate." } }),
        { status: 401 }
      )
    }

    const sessionToken = await getCopilotSessionToken(githubToken)

    if (isTauri()) {
      const attempt = async (token: string) => {
        const body = await invokeCmd("copilot_chat", {
          sessionToken: token,
          model,
          systemPrompt,
          userMessage,
        }) as string
        return new Response(body, { status: 200, headers: { "Content-Type": "application/json" } })
      }

      try {
        return await attempt(sessionToken)
      } catch (err: any) {
        const msg: string = err?.message ?? String(err)
        const isExpired = msg.includes("401") || msg.includes("403") || msg.includes("re-authenticate")
        if (isExpired) {
          invalidateCopilotSessionCache()
          try {
            const fresh = await getCopilotSessionToken(githubToken)
            return await attempt(fresh)
          } catch (retryErr: any) {
            const retryMsg = retryErr?.message ?? String(retryErr)
            return new Response(JSON.stringify({ error: { message: retryMsg } }), { status: 502 })
          }
        }
        return new Response(JSON.stringify({ error: { message: msg } }), { status: 502 })
      }
    }

    return fetch(`${COPILOT_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
        "Editor-Version": "vscode/1.85.0",
        "Copilot-Integration-Id": "vscode-chat",
        "X-GitHub-Api-Version": COPILOT_API_VERSION,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      }),
      signal,
    })
  },
}

const customModels: ModelDef[] = [
  { id: "custom-model", label: "Custom Model" },
]

export const custom: ProviderDef = {
  id: "custom",
  label: "Custom (OpenAI-compatible)",
  fields: [
    {
      key: "baseURL",
      label: "Base URL",
      type: "text",
      placeholder: "http://localhost:11434/v1",
    },
    {
      key: "apiKey",
      label: "API Key (optional)",
      type: "password",
      placeholder: "Leave blank if not required",
    },
    {
      key: "modelId",
      label: "Model ID",
      type: "text",
      placeholder: "llama3.2, mistral, etc.",
    },
  ],
  models: customModels,
  buildRequest(config, _model, systemPrompt, userMessage, signal) {
    const baseURL = config.baseURL?.replace(/\/$/, "") || "http://localhost:11434/v1"
    const modelId = config.modelId || "custom-model"
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`
    return fetch(`${baseURL}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      }),
      signal,
    })
  },
}

export const PROVIDERS: ProviderDef[] = [openai, anthropic, gemini, bedrock, openrouter, copilot, custom]

export const getProvider = (id: ProviderID): ProviderDef =>
  PROVIDERS.find((p) => p.id === id) ?? bedrock

export async function parseProviderResponse(
  providerId: ProviderID,
  response: Response,
): Promise<string> {
  const data = await response.json()

  if (providerId === "gemini") {
    return (data as any)?.candidates?.[0]?.content?.parts?.[0]?.text ?? ""
  }

  if (providerId === "bedrock") {
    return (data as any)?.output?.message?.content?.[0]?.text ?? ""
  }

  if (providerId === "anthropic") {
    return (data as any)?.content?.[0]?.text ?? ""
  }

  return (data as any)?.choices?.[0]?.message?.content ?? ""
}
