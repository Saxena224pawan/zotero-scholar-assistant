export const DEFAULT_GOOGLE_MODEL = "gemini-3.5-flash-lite";

export function normalizeGoogleModel(value: unknown): string {
  const model = String(value || DEFAULT_GOOGLE_MODEL).trim().replace(/^models\//, "");
  return model === "gemini-2.5-flash" ? DEFAULT_GOOGLE_MODEL : model;
}

export function getGoogleThinkingConfig(model: string, thinking: boolean): Record<string, unknown> | undefined {
  if (/^gemini-2\.5-flash(?:-lite)?(?:$|-)/.test(model)) {
    return { thinkingBudget: thinking ? -1 : 0 };
  }
  if (/^gemini-3\.(?:1|5|6)-.*flash/i.test(model)) {
    return { thinkingLevel: thinking ? "medium" : "minimal" };
  }
  if (/^gemini-3\.7-flash(?:$|-)/i.test(model)) {
    return { thinkingLevel: thinking ? "medium" : "low" };
  }
  return undefined;
}
