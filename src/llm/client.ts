import type { CompletionOptions, LLMConfig, Message } from "../types";
import { GoogleGeminiClient } from "./googleGemini";
import { OllamaClient } from "./ollama";

export interface LLMClient {
  readonly name: string;
  complete(messages: Message[], options?: CompletionOptions): Promise<string>;
  stream(messages: Message[], options?: CompletionOptions): AsyncIterable<string>;
  checkConnection(): Promise<{ ok: boolean; models: string[]; message: string }>;
}

export function createLLMClient(config: LLMConfig): LLMClient {
  if (config.provider === "google") return new GoogleGeminiClient(config);
  return new OllamaClient(config);
}
