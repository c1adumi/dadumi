import { describe, it, expect, vi } from "vitest";
import {
  PROVIDERS,
  getProvider,
  parseProviderResponse,
  openai,
  anthropic,
  gemini,
  bedrock,
  openrouter,
  copilot,
  custom,
  type ProviderID,
} from "../providers";

describe("providers", () => {
  describe("PROVIDERS array", () => {
    it("contains all expected providers", () => {
      const ids = PROVIDERS.map((p) => p.id);
      expect(ids).toContain("openai");
      expect(ids).toContain("anthropic");
      expect(ids).toContain("gemini");
      expect(ids).toContain("bedrock");
      expect(ids).toContain("openrouter");
      expect(ids).toContain("github-copilot");
      expect(ids).toContain("custom");
    });

    it("each provider has required fields", () => {
      for (const provider of PROVIDERS) {
        expect(provider.id).toBeTruthy();
        expect(provider.label).toBeTruthy();
        expect(Array.isArray(provider.fields)).toBe(true);
        expect(Array.isArray(provider.models)).toBe(true);
        expect(provider.models.length).toBeGreaterThan(0);
        expect(typeof provider.buildRequest).toBe("function");
      }
    });

    it("each provider model has id and label", () => {
      for (const provider of PROVIDERS) {
        for (const model of provider.models) {
          expect(model.id, `${provider.id} model missing id`).toBeTruthy();
          expect(model.label, `${provider.id} model missing label`).toBeTruthy();
        }
      }
    });
  });

  describe("getProvider()", () => {
    it("returns correct provider by id", () => {
      expect(getProvider("openai")).toBe(openai);
      expect(getProvider("anthropic")).toBe(anthropic);
      expect(getProvider("gemini")).toBe(gemini);
      expect(getProvider("bedrock")).toBe(bedrock);
      expect(getProvider("openrouter")).toBe(openrouter);
      expect(getProvider("github-copilot")).toBe(copilot);
      expect(getProvider("custom")).toBe(custom);
    });

    it("returns bedrock as fallback for unknown id", () => {
      expect(getProvider("unknown" as ProviderID)).toBe(bedrock);
    });
  });

  describe("parseProviderResponse()", () => {
    it("parses OpenAI response format", async () => {
      const response = new Response(
        JSON.stringify({
          choices: [{ message: { content: "OpenAI response text" } }],
        })
      );
      const result = await parseProviderResponse("openai", response);
      expect(result).toBe("OpenAI response text");
    });

    it("parses Anthropic response format", async () => {
      const response = new Response(
        JSON.stringify({
          content: [{ text: "Anthropic response text" }],
        })
      );
      const result = await parseProviderResponse("anthropic", response);
      expect(result).toBe("Anthropic response text");
    });

    it("parses Gemini response format", async () => {
      const response = new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "Gemini response text" }] } }],
        })
      );
      const result = await parseProviderResponse("gemini", response);
      expect(result).toBe("Gemini response text");
    });

    it("parses Bedrock response format", async () => {
      const response = new Response(
        JSON.stringify({
          output: { message: { content: [{ text: "Bedrock response text" }] } },
        })
      );
      const result = await parseProviderResponse("bedrock", response);
      expect(result).toBe("Bedrock response text");
    });

    it("parses OpenRouter response (OpenAI format)", async () => {
      const response = new Response(
        JSON.stringify({
          choices: [{ message: { content: "OpenRouter response" } }],
        })
      );
      const result = await parseProviderResponse("openrouter", response);
      expect(result).toBe("OpenRouter response");
    });

    it("parses GitHub Copilot response (OpenAI format)", async () => {
      const response = new Response(
        JSON.stringify({
          choices: [{ message: { content: "Copilot response" } }],
        })
      );
      const result = await parseProviderResponse("github-copilot", response);
      expect(result).toBe("Copilot response");
    });

    it("parses Custom provider response (OpenAI format)", async () => {
      const response = new Response(
        JSON.stringify({
          choices: [{ message: { content: "Custom response" } }],
        })
      );
      const result = await parseProviderResponse("custom", response);
      expect(result).toBe("Custom response");
    });

    it("returns empty string for malformed response", async () => {
      const response = new Response(JSON.stringify({}));
      const result = await parseProviderResponse("openai", response);
      expect(result).toBe("");
    });
  });

  describe("provider buildRequest()", () => {
    const mockSignal = new AbortController().signal;

    it("openai builds correct request", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
      
      await openai.buildRequest(
        { apiKey: "sk-test" },
        "gpt-4o",
        "system prompt",
        "user message",
        mockSignal
      );

      expect(fetchSpy).toHaveBeenCalledWith(
        "https://api.openai.com/v1/chat/completions",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer sk-test",
          }),
        })
      );
      fetchSpy.mockRestore();
    });

    it("anthropic builds correct request with version header", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
      
      await anthropic.buildRequest(
        { apiKey: "sk-ant-test" },
        "claude-opus-4-5",
        "system prompt",
        "user message",
        mockSignal
      );

      expect(fetchSpy).toHaveBeenCalledWith(
        "https://api.anthropic.com/v1/messages",
        expect.objectContaining({
          headers: expect.objectContaining({
            "x-api-key": "sk-ant-test",
            "anthropic-version": "2023-06-01",
          }),
        })
      );
      fetchSpy.mockRestore();
    });

    it("gemini builds correct URL with API key", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
      
      await gemini.buildRequest(
        { apiKey: "AIza-test" },
        "gemini-2.0-flash",
        "system prompt",
        "user message",
        mockSignal
      );

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("generativelanguage.googleapis.com"),
        expect.anything()
      );
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("key=AIza-test"),
        expect.anything()
      );
      fetchSpy.mockRestore();
    });

    it("bedrock selects correct region for model prefix", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
      
      await bedrock.buildRequest(
        { apiKey: "ABSK-test" },
        "us.anthropic.claude-sonnet-4-6",
        "system prompt",
        "user message",
        mockSignal
      );

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("bedrock-runtime.us-east-1.amazonaws.com"),
        expect.anything()
      );
      fetchSpy.mockRestore();
    });

    it("custom provider uses configurable baseURL", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
      
      await custom.buildRequest(
        { baseURL: "http://localhost:11434/v1", modelId: "llama3" },
        "custom-model",
        "system prompt",
        "user message",
        mockSignal
      );

      expect(fetchSpy).toHaveBeenCalledWith(
        "http://localhost:11434/v1/chat/completions",
        expect.anything()
      );
      fetchSpy.mockRestore();
    });

    it("custom provider strips trailing slash from baseURL", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
      
      await custom.buildRequest(
        { baseURL: "http://localhost:11434/v1/", modelId: "llama3" },
        "custom-model",
        "system prompt",
        "user message",
        mockSignal
      );

      expect(fetchSpy).toHaveBeenCalledWith(
        "http://localhost:11434/v1/chat/completions",
        expect.anything()
      );
      fetchSpy.mockRestore();
    });
  });

  describe("provider fields", () => {
    it("openai requires apiKey", () => {
      const apiKeyField = openai.fields.find((f) => f.key === "apiKey");
      expect(apiKeyField).toBeTruthy();
      expect(apiKeyField?.type).toBe("password");
    });

    it("custom provider has baseURL, apiKey, and modelId fields", () => {
      const fields = custom.fields.map((f) => f.key);
      expect(fields).toContain("baseURL");
      expect(fields).toContain("apiKey");
      expect(fields).toContain("modelId");
    });

    it("copilot githubToken field indicates OAuth managed", () => {
      const tokenField = copilot.fields.find((f) => f.key === "githubToken");
      expect(tokenField?.placeholder).toContain("OAuth");
    });
  });
});
