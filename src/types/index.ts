export type HighlightCategory =
  | "problem"
  | "contribution"
  | "concept"
  | "methodology"
  | "equation"
  | "results"
  | "limitation"
  | "conclusion";

export interface PaperRecord {
  row: number;
  title?: string;
  doi?: string;
  arxivId?: string;
  authors?: string;
  year?: string;
  url?: string;
  notes?: string;
}

export interface HighlightAnnotation {
  text: string;
  category: HighlightCategory;
  explanation: string;
  color: string;
}

export interface StudyNote {
  summary: string;
  keyContributions: string[];
  importantConcepts: string[];
  methodology: string;
  importantResults: string[];
  limitations: string[];
  keyTakeaways: string[];
}

export interface QuizQuestion {
  question: string;
  answer: string;
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
}

export interface AnalysisResult {
  highlights: HighlightAnnotation[];
  studyNote: StudyNote;
  quiz: QuizQuestion[];
}

export type JobStatus =
  | "pending"
  | "matching"
  | "fetching"
  | "extracting"
  | "ai-highlights"
  | "ai-notes"
  | "ai-quiz"
  | "annotating"
  | "notes"
  | "quiz"
  | "deferred"
  | "done"
  | "failed"
  | "stopped";

export interface PaperJob {
  id: string;
  paper: PaperRecord;
  status: JobStatus;
  failedAt?: JobStatus;
  message?: string;
  itemID?: number;
  attachmentID?: number;
  pdfAttempts?: number;
}

export interface PageText {
  pageIndex: number;
  text: string;
}

export interface ExtractedText {
  text: string;
  pages: PageText[];
}

export interface LLMConfig {
  provider: "ollama" | "google";
  endpoint: string;
  model: string;
  apiKey: string;
  thinking: boolean;
  maxTokens: number;
  contextChars: number;
  temperature: number;
  outputLanguage: string;
  timeoutMs: number;
}

export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompletionOptions {
  maxTokens?: number;
  temperature?: number;
  signal?: CancellationSignal;
  json?: boolean;
  schema?: Record<string, unknown>;
}

export interface CancellationSignal {
  aborted: boolean;
}

export interface PipelineProgress {
  jobs: PaperJob[];
  current: number;
  total: number;
  done: number;
  failed: number;
  running: boolean;
  paused: boolean;
}
