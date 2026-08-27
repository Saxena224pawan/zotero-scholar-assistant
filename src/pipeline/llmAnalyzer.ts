import type { AnalysisResult, CancellationSignal, ExtractedText, HighlightAnnotation, LLMConfig, QuizQuestion, StudyNote } from "../types";
import { createLLMClient } from "../llm/client";
import { highlightListSchema, quizListSchema, studyNoteSchema } from "../llm/analysisSchema";

const categories = new Set(["problem", "contribution", "concept", "methodology", "equation", "results", "limitation", "conclusion"]);
const colorMap: Record<string, string> = {
  problem: "#f19837",
  contribution: "#5fb236",
  concept: "#2ea8e5",
  methodology: "#a28ae5",
  equation: "#e56eee",
  results: "#ffd400",
  limitation: "#ff6666",
  conclusion: "#45c5b0",
};

const systemPrompt = `You are an expert research assistant analyzing scientific papers.
Return only valid JSON with keys highlights, studyNote, and quiz. Select at most 20 critical passages.
Each highlight must contain exact source text of no more than 3 sentences, category, explanation, and color.
Allowed categories: problem, contribution, concept, methodology, equation, results, limitation, conclusion.
studyNote must contain summary, keyContributions, importantConcepts, methodology, importantResults, limitations, keyTakeaways.
quiz must contain 5-10 objects with question, answer, explanation, and difficulty (easy, medium, hard).`;

export type AnalysisStage = "ai-highlights" | "ai-notes" | "ai-quiz";
export type AnalysisProgress = (stage: AnalysisStage, message: string) => void;

export async function analyzePaper(
  extracted: ExtractedText,
  config: LLMConfig,
  signal?: CancellationSignal,
  onProgress?: AnalysisProgress,
): Promise<AnalysisResult> {
  const client = createLLMClient(config);
  if (config.provider === "google") {
    return analyzeGoogleSections(extracted, config, client, signal, onProgress);
  }

  onProgress?.("ai-highlights", `Generating highlights, notes, and quiz with Ollama (${config.model})`);
  if (extracted.text.length <= config.contextChars) {
    const result = parseAnalysis(await client.complete([
      { role: "system", content: systemPrompt },
      { role: "user", content: `Analyze this paper. Write notes and quiz in ${config.outputLanguage}.\n\n${extracted.text}` },
    ], { signal, json: true }));
    validateAnalysis(result);
    onProgress?.("ai-notes", "Study note generated and validated");
    onProgress?.("ai-quiz", "Quiz generated and validated");
    return result;
  }

  const chunks = chunkText(extracted.text, Math.max(8000, Math.floor(config.contextChars * 0.65)));
  const partials: AnalysisResult[] = [];
  for (let index = 0; index < chunks.length; index += 1) {
    if (signal?.aborted) throw cancellationError("Analysis stopped");
    const content = await client.complete([
      { role: "system", content: systemPrompt },
      { role: "user", content: `Analyze paper chunk ${index + 1} of ${chunks.length}. Keep only evidence present in this chunk. Use ${config.outputLanguage}.\n\n${chunks[index]}` },
    ], { signal, json: true, maxTokens: Math.min(config.maxTokens, 2500) });
    partials.push(parseAnalysis(content));
  }

  const compact = JSON.stringify(partials);
  const synthesis = await client.complete([
    { role: "system", content: systemPrompt },
    { role: "user", content: `Merge these chunk analyses into one non-redundant final analysis in ${config.outputLanguage}. Preserve exact highlight text.\n\n${compact}` },
  ], { signal, json: true });
  const result = parseAnalysis(synthesis);
  validateAnalysis(result);
  onProgress?.("ai-notes", "Study note generated and validated");
  onProgress?.("ai-quiz", "Quiz generated and validated");
  return result;
}

async function analyzeGoogleSections(
  extracted: ExtractedText,
  config: LLMConfig,
  client: ReturnType<typeof createLLMClient>,
  signal?: CancellationSignal,
  onProgress?: AnalysisProgress,
): Promise<AnalysisResult> {
  const paper = extracted.text;
  const language = config.outputLanguage;

  onProgress?.("ai-highlights", `Generating source-linked highlights with Google Gemini (${config.model})`);
  const highlightResult = parseAnalysis(await client.complete([
    { role: "system", content: `You are an expert research assistant. Return only valid JSON. Select 8-15 critical passages copied exactly from the paper. Each highlight needs text (maximum 3 sentences), category, and a concise explanation. Allowed categories: problem, contribution, concept, methodology, equation, results, limitation, conclusion.` },
    { role: "user", content: `Generate evidence-based highlights in ${language}. Do not paraphrase the highlight text.\n\n${paper}` },
  ], { signal, json: true, schema: highlightListSchema, maxTokens: Math.max(config.maxTokens, 4096) }));
  if (highlightResult.highlights.length < 6) {
    throw new Error(`Gemini generated only ${highlightResult.highlights.length} usable highlights; at least 6 are required.`);
  }

  onProgress?.("ai-notes", `Writing a clean structured study note with Google Gemini (${config.model})`);
  const noteResult = parseAnalysis(await client.complete([
    { role: "system", content: `You are an expert research assistant. Return only valid JSON containing studyNote. Write clean, self-contained study notes, not JSON-like prose. Include summary, keyContributions, importantConcepts, methodology, importantResults, limitations, and keyTakeaways. Use specific evidence and numerical results from the paper. Every list must contain useful entries. If the authors state no limitations, explicitly say that rather than leaving the list empty.` },
    { role: "user", content: `Write comprehensive study notes in ${language}. Do not merely repeat the abstract. Cover the full paper.\n\n${paper}` },
  ], { signal, json: true, schema: studyNoteSchema, maxTokens: Math.max(config.maxTokens, 4096) }));
  validateStudyNote(noteResult.studyNote);

  onProgress?.("ai-quiz", `Creating and validating quiz questions with Google Gemini (${config.model})`);
  const quizResult = parseAnalysis(await client.complete([
    { role: "system", content: `You are an expert research tutor. Return only valid JSON containing quiz. Create 5-8 substantive questions spanning the paper's problem, methods, results, concepts, and limitations. Each question must include a direct answer, a teaching explanation, and difficulty (easy, medium, or hard). Avoid trivial title or author questions.` },
    { role: "user", content: `Create a study quiz in ${language} based only on this paper.\n\n${paper}` },
  ], { signal, json: true, schema: quizListSchema, maxTokens: Math.max(config.maxTokens, 3072) }));
  if (quizResult.quiz.length < 5) {
    throw new Error(`Gemini generated only ${quizResult.quiz.length} usable quiz questions; at least 5 are required.`);
  }

  return {
    highlights: highlightResult.highlights,
    studyNote: noteResult.studyNote,
    quiz: quizResult.quiz,
  };
}

export function parseAnalysis(raw: string): AnalysisResult {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  if (!cleaned.startsWith("{") || !cleaned.endsWith("}")) {
    throw new Error("The AI response was incomplete or was not valid structured output. No note or quiz was created.");
  }
  let value: any;
  try {
    value = JSON.parse(cleaned);
  } catch {
    try {
      value = JSON.parse(cleaned.replace(/,\s*([}\]])/g, "$1"));
    } catch {
      throw new Error("The AI response contained broken or truncated JSON. No note or quiz was created.");
    }
  }

  for (let depth = 0; depth < 2 && typeof value === "string"; depth += 1) {
    try { value = JSON.parse(value); } catch { break; }
  }
  value = value?.analysis ?? value?.result ?? value?.response ?? value;

  const highlightSource = value?.highlights ?? value?.keyHighlights ?? value?.key_highlights;
  const highlights: HighlightAnnotation[] = Array.isArray(highlightSource)
    ? highlightSource.slice(0, 20).map((item: any) => {
        if (typeof item === "string") item = { text: item, category: "concept", explanation: "" };
        const category = categories.has(item?.category) ? item.category : "concept";
        return {
          text: asString(item?.text),
          category,
          explanation: asString(item?.explanation),
          color: colorMap[category]!,
        };
      }).filter((item: HighlightAnnotation) => item.text)
    : [];

  const note = value?.studyNote ?? value?.study_note ?? value?.notes ?? value ?? {};
  const studyNote: StudyNote = {
    summary: asString(note.summary),
    keyContributions: asStrings(note.keyContributions ?? note.key_contributions ?? note.contributions),
    importantConcepts: asStrings(note.importantConcepts ?? note.important_concepts ?? note.concepts),
    methodology: asString(note.methodology),
    importantResults: asStrings(note.importantResults ?? note.important_results ?? note.results),
    limitations: asStrings(note.limitations),
    keyTakeaways: asStrings(note.keyTakeaways ?? note.key_takeaways ?? note.takeaways),
  };
  const quizSource = Array.isArray(value?.quiz) ? value.quiz : value?.quiz?.questions ?? value?.questions;
  const quiz: QuizQuestion[] = Array.isArray(quizSource)
    ? quizSource.slice(0, 10).map((item: any) => ({
        question: asString(item?.question),
        answer: asString(item?.answer),
        explanation: asString(item?.explanation),
        difficulty: ["easy", "medium", "hard"].includes(item?.difficulty) ? item.difficulty : "medium",
      })).filter((item: QuizQuestion) => item.question && item.answer)
    : [];
  if (!studyNote.summary && !highlights.length && !quiz.length) {
    throw new Error("The AI response did not contain highlights, study notes, or quiz questions.");
  }
  return { highlights, studyNote, quiz };
}

function validateAnalysis(result: AnalysisResult): void {
  if (result.highlights.length < 6) throw new Error(`The AI generated only ${result.highlights.length} usable highlights; at least 6 are required.`);
  validateStudyNote(result.studyNote);
  if (result.quiz.length < 5) throw new Error(`The AI generated only ${result.quiz.length} usable quiz questions; at least 5 are required.`);
}

function validateStudyNote(note: StudyNote): void {
  const missing: string[] = [];
  if (!note.summary) missing.push("summary");
  if (!note.keyContributions.length) missing.push("key contributions");
  if (!note.importantConcepts.length) missing.push("important concepts");
  if (!note.methodology) missing.push("methodology");
  if (!note.importantResults.length) missing.push("important results");
  if (!note.limitations.length) missing.push("limitations");
  if (!note.keyTakeaways.length) missing.push("key takeaways");
  if (missing.length) throw new Error(`The AI study note was incomplete (missing ${missing.join(", ")}). No partial note was created.`);
}

function chunkText(text: string, size: number): string[] {
  const chunks: string[] = [];
  let offset = 0;
  while (offset < text.length) {
    let end = Math.min(offset + size, text.length);
    if (end < text.length) {
      const boundary = Math.max(text.lastIndexOf("\n\n", end), text.lastIndexOf(". ", end));
      if (boundary > offset + size * 0.6) end = boundary + 1;
    }
    chunks.push(text.slice(offset, end));
    offset = end;
  }
  return chunks;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value);
}

function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(asString).filter(Boolean) : value ? [asString(value)] : [];
}

function cancellationError(message: string): Error {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}
