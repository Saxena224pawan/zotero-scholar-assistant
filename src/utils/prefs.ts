import type { LLMConfig } from "../types";
import { DEFAULT_GOOGLE_MODEL, normalizeGoogleModel } from "../llm/googleModels";

const PREFIX = "extensions.zotero.scholarAssistant";

export const prefKeys = {
  provider: `${PREFIX}.provider`,
  endpoint: `${PREFIX}.ollamaEndpoint`,
  model: `${PREFIX}.ollamaModel`,
  googleModel: `${PREFIX}.googleModel`,
  googleApiKey: `${PREFIX}.googleApiKey`,
  googleThinking: `${PREFIX}.googleThinking`,
  maxTokens: `${PREFIX}.maxTokens`,
  contextChars: `${PREFIX}.contextChars`,
  temperature: `${PREFIX}.temperature`,
  outputLanguage: `${PREFIX}.outputLanguage`,
  timeoutMs: `${PREFIX}.timeoutMs`,
  timeoutMinutes: `${PREFIX}.timeoutMinutes`,
  unpaywallEmail: `${PREFIX}.unpaywallEmail`,
  enableArxiv: `${PREFIX}.enableArxiv`,
  enableUnpaywall: `${PREFIX}.enableUnpaywall`,
  enableSemanticScholar: `${PREFIX}.enableSemanticScholar`,
  enableDirectURL: `${PREFIX}.enableDirectURL`,
} as const;

export function getPref<T>(key: string, fallback: T): T {
  const value = Zotero.Prefs.get(key, true);
  return value === undefined || value === null || value === "" ? fallback : (value as T);
}

export function setPref(key: string, value: string | number | boolean): void {
  Zotero.Prefs.set(key, value, true);
}

export function normalizeOllamaEndpoint(value: unknown): string {
  let endpoint = String(value ?? "").trim();
  if (!endpoint) endpoint = "http://127.0.0.1:11434";
  if (!/^https?:\/\//i.test(endpoint)) endpoint = `http://${endpoint}`;
  return endpoint.replace(/\/+$/, "");
}

export function getLLMConfig(): LLMConfig {
  const timeoutMinutes = Math.min(120, Math.max(5, Number(getPref(prefKeys.timeoutMinutes, 30))));
  const provider = getPref<string>(prefKeys.provider, "ollama") === "google" ? "google" : "ollama";
  const configuredContextChars = Number(getPref(prefKeys.contextChars, 48000));
  const savedGoogleModel = getPref(prefKeys.googleModel, DEFAULT_GOOGLE_MODEL);
  const googleModel = normalizeGoogleModel(savedGoogleModel);
  if (savedGoogleModel !== googleModel) setPref(prefKeys.googleModel, googleModel);
  return {
    provider,
    endpoint: normalizeOllamaEndpoint(getPref(prefKeys.endpoint, "http://127.0.0.1:11434")),
    model: provider === "google"
      ? googleModel
      : getPref(prefKeys.model, "gemma3:latest"),
    apiKey: provider === "google" ? getPref(prefKeys.googleApiKey, "") : "",
    thinking: provider === "google" && Boolean(getPref(prefKeys.googleThinking, false)),
    maxTokens: Number(getPref(prefKeys.maxTokens, 2048)),
    contextChars: provider === "google" ? Math.max(configuredContextChars, 500_000) : configuredContextChars,
    temperature: Number(getPref(prefKeys.temperature, 0.2)),
    outputLanguage: getPref(prefKeys.outputLanguage, "English"),
    timeoutMs: timeoutMinutes * 60_000,
  };
}
