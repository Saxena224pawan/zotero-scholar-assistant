import type { CancellationSignal, LLMConfig, PaperJob, PaperRecord, PipelineProgress } from "../types";
import { getLLMConfig } from "../utils/prefs";
import { logger } from "../utils/logger";
import { resolveMetadata } from "./metadataResolver";
import { fetchPDF } from "./pdfFetcher";
import { extractPDFText } from "./pdfTextExtractor";
import { analyzePaper } from "./llmAnalyzer";
import { writeAnnotations } from "./annotationWriter";
import { writeStudyNote } from "./noteWriter";
import { writeQuiz } from "./quizWriter";

type Listener = (progress: PipelineProgress) => void;

export class PipelineOrchestrator {
  private jobs: PaperJob[] = [];
  private listeners = new Set<Listener>();
  private running = false;
  private paused = false;
  private stopped = false;
  private cancellationSignal: CancellationSignal | null = null;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  getProgress(): PipelineProgress {
    return this.snapshot();
  }

  pause(): void {
    if (!this.running) return;
    this.paused = true;
    this.emit();
  }

  resume(): void {
    this.paused = false;
    this.emit();
  }

  stop(): void {
    this.stopped = true;
    this.paused = false;
    if (this.cancellationSignal) this.cancellationSignal.aborted = true;
    for (const job of this.jobs) {
      if (job.status === "pending") job.status = "stopped";
    }
    this.emit();
  }

  async run(papers: PaperRecord[], collectionName: string, llmConfig: LLMConfig = getLLMConfig()): Promise<void> {
    if (this.running) throw new Error("A Scholar Assistant import is already running.");
    this.running = true;
    this.paused = false;
    this.stopped = false;
    this.cancellationSignal = { aborted: false };
    this.jobs = papers.map((paper, index) => ({ id: `${Date.now()}-${index}`, paper, status: "pending" }));
    this.emit();

    try {
      const libraryID = Zotero.Libraries.userLibraryID;
      const collection = new Zotero.Collection();
      collection.libraryID = libraryID;
      collection.name = collectionName || `Imported Papers - ${new Date().toISOString().slice(0, 10)}`;
      const collectionID = await collection.saveTx();

      for (const job of this.jobs) {
        if (this.stopped) break;
        await this.waitWhilePaused();
        try {
          await this.processJob(job, libraryID, collectionID, llmConfig);
        } catch (error) {
          const failedAt = job.status;
          if (this.stopped || (error instanceof Error && error.name === "AbortError")) {
            job.status = "stopped";
            job.message = "Stopped by user";
          } else {
            job.status = "failed";
            job.failedAt = failedAt;
            job.message = error instanceof Error ? error.message : String(error);
            logger.error(`Row ${job.paper.row} failed`, error);
          }
          this.emit();
        }
      }
    } finally {
      this.running = false;
      this.paused = false;
      this.cancellationSignal = null;
      this.emit();
    }
  }

  private async processJob(job: PaperJob, libraryID: number, collectionID: number, llmConfig: LLMConfig): Promise<void> {
    this.setStatus(job, "matching", "Resolving metadata");
    const item = await resolveMetadata(job.paper, libraryID, collectionID);
    job.itemID = item.id;

    this.setStatus(job, "fetching", "Finding an open PDF");
    const attachment = await fetchPDF(item, job.paper);
    if (!attachment) throw new Error("No accessible PDF was found. Add a PDF to the item and retry.");
    job.attachmentID = attachment.id;

    this.setStatus(job, "extracting", "Extracting indexed PDF text");
    const extracted = await extractPDFText(attachment);

    this.setStatus(job, "ai-highlights", `Starting AI analysis with ${llmConfig.model}`);
    const analysis = await analyzePaper(
      extracted,
      llmConfig,
      this.cancellationSignal ?? undefined,
      (stage, message) => this.setStatus(job, stage, message),
    );

    this.setStatus(job, "annotating", "Creating PDF annotations");
    const annotationCount = await writeAnnotations(attachment, extracted, analysis);

    this.setStatus(job, "notes", "Creating study note");
    await writeStudyNote(item, analysis.studyNote);

    this.setStatus(job, "quiz", "Creating quiz");
    await writeQuiz(item, analysis.quiz);

    item.addTag("scholar-assistant:processed");
    await item.saveTx();
    this.setStatus(job, "done", `Complete — ${annotationCount} highlights, study note, ${analysis.quiz.length} quiz questions`);
  }

  private async waitWhilePaused(): Promise<void> {
    while (this.paused && !this.stopped) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  private setStatus(job: PaperJob, status: PaperJob["status"], message: string): void {
    job.status = status;
    job.message = message;
    this.emit();
  }

  private snapshot(): PipelineProgress {
    const done = this.jobs.filter((job) => job.status === "done").length;
    const failed = this.jobs.filter((job) => job.status === "failed").length;
    const current = this.jobs.findIndex((job) => !["done", "failed", "stopped", "pending"].includes(job.status));
    return {
      jobs: this.jobs.map((job) => ({ ...job, paper: { ...job.paper } })),
      current: current < 0 ? done + failed : current,
      total: this.jobs.length,
      done,
      failed,
      running: this.running,
      paused: this.paused,
    };
  }

  private emit(): void {
    const progress = this.snapshot();
    for (const listener of this.listeners) listener(progress);
  }
}
