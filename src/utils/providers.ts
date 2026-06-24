export type ProviderID =
  | "openai"
  | "anthropic"
  | "gemini"
  | "bedrock"
  | "openrouter"
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
    { id: "apac.anthropic.claude-sonnet-4-5-20250929-v1:0", label: "Claude Sonnet 4.5" },
    { id: "apac.anthropic.claude-haiku-4-5-20251001-v1:0", label: "Claude Haiku 4.5 (Fast)" },
    { id: "us.amazon.nova-pro-v1:0", label: "Amazon Nova Pro" },
    { id: "us.amazon.nova-lite-v1:0", label: "Amazon Nova Lite (Fast)" },
  ],
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

export const PROVIDERS: ProviderDef[] = [openai, anthropic, gemini, bedrock, openrouter, custom]

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
