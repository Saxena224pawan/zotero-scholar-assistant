import type { CompletionOptions, LLMConfig, Message } from "../types";
import { analysisSchema } from "./analysisSchema";
import type { LLMClient } from "./client";
import { getGoogleThinkingConfig, normalizeGoogleModel } from "./googleModels";

const API_ROOT = "https://generativelanguage.googleapis.com/v1beta";

export class GoogleGeminiClient implements LLMClient {
  readonly name = "Google Gemini";

  constructor(private readonly config: LLMConfig) {}

  async complete(messages: Message[], options: CompletionOptions = {}): Promise<string> {
    if (options.signal?.aborted) throw cancellationError("Request aborted");
    const apiKey = this.requireAPIKey();
    const model = normalizeGoogleModel(this.config.model);
    const systemText = messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n");
    const contents = messages.filter((message) => message.role !== "system").map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    }));
    const generationConfig: Record<string, unknown> = {
      temperature: options.temperature ?? this.config.temperature,
      maxOutputTokens: options.maxTokens ?? this.config.maxTokens,
    };
    const thinkingConfig = getGoogleThinkingConfig(model, this.config.thinking);
    if (thinkingConfig) generationConfig.thinkingConfig = thinkingConfig;
    if (options.json !== false) {
      generationConfig.responseMimeType = "application/json";
      generationConfig.responseSchema = options.schema ?? analysisSchema;
    }

    let response: any;
    try {
      response = await Zotero.HTTP.request(
        "POST",
        `${API_ROOT}/models/${encodeURIComponent(model)}:generateContent`,
        {
          body: JSON.stringify({
            ...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}),
            contents,
            generationConfig,
          }),
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          responseType: "json",
          timeout: this.config.timeoutMs,
        },
      );
    } catch (error) {
      throw new Error(describeGoogleError(error, model));
    }
    if (options.signal?.aborted) throw cancellationError("Request aborted");
    const payload = typeof response.response === "string" ? JSON.parse(response.response) : response.response;
    return extractGeminiText(payload);
  }

  async *stream(messages: Message[], options: CompletionOptions = {}): AsyncIterable<string> {
    yield await this.complete(messages, options);
  }

  async checkConnection(): Promise<{ ok: boolean; models: string[]; message: string }> {
    const model = normalizeGoogleModel(this.config.model);
    try {
      const apiKey = this.requireAPIKey();
      const generationConfig: Record<string, unknown> = { maxOutputTokens: 32, temperature: 0 };
      const thinkingConfig = getGoogleThinkingConfig(model, false);
      if (thinkingConfig) generationConfig.thinkingConfig = thinkingConfig;
      await Zotero.HTTP.request("POST", `${API_ROOT}/models/${encodeURIComponent(model)}:generateContent`, {
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "Reply with exactly: connected" }] }],
          generationConfig,
        }),
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        responseType: "json",
        timeout: Math.min(this.config.timeoutMs, 15000),
      });
      return { ok: true, models: [model], message: `Connected to Google Gemini. Model ${model} generated a test response.` };
    } catch (error) {
      return {
        ok: false,
        models: [],
        message: `Could not connect to Google Gemini model ${model}: ${describeGoogleError(error, model)}`,
      };
    }
  }

  private requireAPIKey(): string {
    const apiKey = this.config.apiKey.trim();
    if (!apiKey) throw new Error("Google AI API key is missing. Add it in Scholar Assistant settings.");
    return apiKey;
  }
}

export function describeGoogleError(error: unknown, model: string): string {
  const value = error as any;
  const responseText = value?.xmlhttp?.responseText
    ?? value?.response?.responseText
    ?? value?.responseText
    ?? value?.response?.response;
  let payload: any = null;
  if (typeof responseText === "string" && responseText.trim()) {
    try { payload = JSON.parse(responseText); } catch { /* use the original error below */ }
  } else if (responseText && typeof responseText === "object") {
    payload = responseText;
  }
  const status = Number(value?.status ?? value?.xmlhttp?.status ?? value?.response?.status ?? payload?.error?.code ?? 0);
  const detail = String(payload?.error?.message ?? value?.message ?? error);
  if (status === 429 || /quota|resource_exhausted|too many requests/i.test(detail)) {
    const alternative = model === "gemini-3.5-flash-lite"
      ? "Wait for the quota to reset or enable billing in Google AI Studio."
      : "Switch the Gemini model to gemini-3.5-flash-lite, wait for the quota to reset, or enable billing in Google AI Studio.";
    return `Google Gemini quota is exhausted for ${model}. ${alternative}`;
  }
  return detail || `Google Gemini request failed${status ? ` with HTTP ${status}` : ""}.`;
}

export function extractGeminiText(payload: any): string {
  const finishReason = payload?.candidates?.[0]?.finishReason;
  if (finishReason === "MAX_TOKENS") {
    throw new Error("Google Gemini reached the output limit before finishing. The plugin will retry this work as smaller sections.");
  }
  const content = payload?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: unknown }) => typeof part?.text === "string" ? part.text : "")
    .filter(Boolean)
    .join("\n")
    .trim();
  if (content) return content;
  const reason = payload?.promptFeedback?.blockReason ?? finishReason;
  throw new Error(reason ? `Google Gemini returned no text (${reason}).` : "Google Gemini returned an empty response.");
}

function cancellationError(message: string): Error {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}
