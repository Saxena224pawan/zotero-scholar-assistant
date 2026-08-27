import type { CompletionOptions, LLMConfig, Message } from "../types";
import { normalizeOllamaEndpoint } from "../utils/prefs";
import { analysisSchema } from "./analysisSchema";
import type { LLMClient } from "./client";

export class OllamaClient implements LLMClient {
  readonly name = "Ollama";

  constructor(private readonly config: LLMConfig) {}

  async complete(messages: Message[], options: CompletionOptions = {}): Promise<string> {
    if (options.signal?.aborted) throw cancellationError("Request aborted");
    const url = `${normalizeOllamaEndpoint(this.config.endpoint)}/api/chat`;
    const response = await Zotero.HTTP.request("POST", url, {
      body: JSON.stringify({
        model: this.config.model,
        messages,
        stream: false,
        keep_alive: "30m",
        format: options.json === false ? undefined : options.schema ?? analysisSchema,
        options: {
          temperature: options.temperature ?? this.config.temperature,
          num_predict: options.maxTokens ?? this.config.maxTokens,
        },
      }),
      headers: { "Content-Type": "application/json" },
      responseType: "json",
      timeout: this.config.timeoutMs,
    });
    if (options.signal?.aborted) throw cancellationError("Request aborted");
    const payload = typeof response.response === "string" ? JSON.parse(response.response) : response.response;
    const content = payload?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new Error("Ollama returned an empty response.");
    }
    return content;
  }

  async *stream(messages: Message[], options: CompletionOptions = {}): AsyncIterable<string> {
    yield await this.complete(messages, options);
  }

  async checkConnection(): Promise<{ ok: boolean; models: string[]; message: string }> {
    try {
      const endpoint = normalizeOllamaEndpoint(this.config.endpoint);
      const url = `${endpoint}/api/tags`;
      const response = await Zotero.HTTP.request("GET", url, {
        responseType: "json",
        timeout: Math.min(this.config.timeoutMs, 10000),
      });
      const payload = typeof response.response === "string" ? JSON.parse(response.response) : response.response;
      const models = Array.isArray(payload?.models)
        ? payload.models.map((entry: { name?: string }) => entry.name).filter(Boolean)
        : [];
      const available = models.some((model: string) => model === this.config.model || model.startsWith(`${this.config.model}:`));
      return {
        ok: available,
        models,
        message: available
          ? `Connected to Ollama. Model ${this.config.model} is available.`
          : `Connected to Ollama, but model ${this.config.model} is not installed.`,
      };
    } catch (error) {
      return {
        ok: false,
        models: [],
        message: `Could not connect to Ollama at ${normalizeOllamaEndpoint(this.config.endpoint)}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}

function cancellationError(message: string): Error {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}
