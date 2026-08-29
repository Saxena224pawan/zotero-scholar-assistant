import assert from "node:assert/strict";
import test from "node:test";
import { describeGoogleError, extractGeminiText } from "../src/llm/googleGemini";
import { getGoogleThinkingConfig, normalizeGoogleModel } from "../src/llm/googleModels";

test("extracts and joins Gemini response text parts", () => {
  const result = extractGeminiText({
    candidates: [{ content: { parts: [{ text: '{"highlights":[],' }, { text: '"studyNote":{},"quiz":[]}' }] } }],
  });
  assert.equal(result, '{"highlights":[],\n"studyNote":{},"quiz":[]}');
});

test("reports a Gemini safety block instead of returning empty text", () => {
  assert.throws(() => extractGeminiText({ promptFeedback: { blockReason: "SAFETY" } }), /SAFETY/);
});

test("reports output truncation even when Gemini returned partial text", () => {
  assert.throws(
    () => extractGeminiText({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: '{"partial":true}' }] } }] }),
    /output limit/i,
  );
});

test("migrates the retired Gemini 2.5 Flash model", () => {
  assert.equal(normalizeGoogleModel("gemini-2.5-flash"), "gemini-3.5-flash-lite");
});

test("uses minimal thinking for fast Gemini 3.6 Flash requests", () => {
  assert.deepEqual(getGoogleThinkingConfig("gemini-3.6-flash", false), { thinkingLevel: "minimal" });
  assert.deepEqual(getGoogleThinkingConfig("gemini-3.6-flash", true), { thinkingLevel: "medium" });
});

test("turns a Google quota response into an actionable message", () => {
  const message = describeGoogleError({
    xmlhttp: {
      status: 429,
      responseText: JSON.stringify({ error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "Quota exceeded" } }),
    },
  }, "gemini-3.6-flash");

  assert.match(message, /quota is exhausted/i);
  assert.match(message, /gemini-3\.5-flash-lite/);
  assert.doesNotMatch(message, /api key/i);
});
