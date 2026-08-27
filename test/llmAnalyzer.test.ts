import assert from "node:assert/strict";
import test from "node:test";
import { parseAnalysis } from "../src/pipeline/llmAnalyzer";

test("parses fenced Ollama JSON and normalizes highlight colors", () => {
  const result = parseAnalysis(`\`\`\`json
  {"highlights":[{"text":"Important result.","category":"results","explanation":"Core finding","color":"wrong"}],
  "studyNote":{"summary":"Summary","keyContributions":[],"importantConcepts":[],"methodology":"Method","importantResults":[],"limitations":[],"keyTakeaways":[]},
  "quiz":[{"question":"Q?","answer":"A","explanation":"E","difficulty":"easy"}]}
  \`\`\``);
  assert.equal(result.highlights[0]?.color, "#ffd400");
  assert.equal(result.quiz[0]?.difficulty, "easy");
});

test("rejects unstructured output instead of saving it as a study note", () => {
  assert.throws(
    () => parseAnalysis("A useful unstructured summary"),
    /incomplete|structured output/i,
  );
});

test("rejects truncated JSON instead of displaying it in a note", () => {
  assert.throws(
    () => parseAnalysis('"highlights": [{"text":"Partial result"}], "studyNote": {"summary":"cut off'),
    /incomplete|structured output/i,
  );
});

test("accepts wrapped snake-case Ollama JSON", () => {
  const result = parseAnalysis(JSON.stringify({
    analysis: {
      highlights: ["Exact source passage"],
      study_note: {
        summary: "Summary",
        key_contributions: ["Contribution"],
        important_concepts: ["Concept"],
        methodology: "Method",
        important_results: ["Result"],
        limitations: ["Limitation"],
        key_takeaways: ["Takeaway"],
      },
      quiz: { questions: [{ question: "Q?", answer: "A", explanation: "E", difficulty: "hard" }] },
    },
  }));
  assert.equal(result.highlights[0]?.text, "Exact source passage");
  assert.equal(result.studyNote.keyContributions[0], "Contribution");
  assert.equal(result.quiz[0]?.difficulty, "hard");
});
