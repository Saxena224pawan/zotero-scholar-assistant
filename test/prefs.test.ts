import assert from "node:assert/strict";
import test from "node:test";
import { normalizeOllamaEndpoint } from "../src/utils/prefs";

test("adds http:// to a bare Ollama host and port", () => {
  assert.equal(normalizeOllamaEndpoint("127.0.0.1:11434"), "http://127.0.0.1:11434");
});

test("trims whitespace and trailing slashes", () => {
  assert.equal(normalizeOllamaEndpoint("  http://localhost:11434///  "), "http://localhost:11434");
});

test("preserves an https endpoint", () => {
  assert.equal(normalizeOllamaEndpoint("https://ollama.example.test"), "https://ollama.example.test");
});
