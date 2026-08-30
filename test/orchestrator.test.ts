import assert from "node:assert/strict";
import test from "node:test";
import { PipelineOrchestrator } from "../src/pipeline/orchestrator";
import { PDFLookupTimeoutError } from "../src/pipeline/pdfFetcher";

test("a failing progress listener cannot interrupt the pipeline", () => {
  const errors: unknown[] = [];
  (globalThis as any).Zotero = {
    logError(error: unknown) { errors.push(error); },
  };

  const orchestrator = new PipelineOrchestrator();
  let calls = 0;
  orchestrator.subscribe(() => {
    calls += 1;
    if (calls > 1) throw new Error("dashboard render failed");
  });

  assert.doesNotThrow(() => orchestrator.stop());
  assert.equal(calls, 2);
  assert.equal(errors.length, 1);
});

test("an import creates the requested Zotero collection", async () => {
  let savedName = "";
  (globalThis as any).Zotero = {
    Libraries: { userLibraryID: 1 },
    Collection: class {
      libraryID = 0;
      name = "";
      async saveTx() {
        savedName = this.name;
        return 42;
      }
    },
  };

  const orchestrator = new PipelineOrchestrator();
  await orchestrator.run([], "abc", {} as any);

  assert.equal(savedName, "abc");
  assert.equal(orchestrator.getProgress().running, false);
});

test("paper rows are published before Zotero saves the collection", async () => {
  let visibleBeforeSave = false;
  const orchestrator = new PipelineOrchestrator();
  orchestrator.subscribe((progress) => {
    if (progress.running && progress.total === 1 && progress.jobs[0]?.paper.title === "Visible paper") {
      visibleBeforeSave = true;
    }
  });
  (globalThis as any).Zotero = {
    Libraries: { userLibraryID: 1 },
    Collection: class {
      libraryID = 0;
      name = "";
      async saveTx() {
        assert.equal(visibleBeforeSave, true);
        throw new Error("deliberate stop after checking initial progress");
      }
    },
  };

  await assert.rejects(
    orchestrator.run([{ row: 2, title: "Visible paper" }], "abc", {} as any),
    /deliberate stop/,
  );
});

test("a PDF timeout moves to the next paper and retries after the first pass", async () => {
  (globalThis as any).Zotero = {
    Libraries: { userLibraryID: 1 },
    Collection: class {
      libraryID = 0;
      name = "";
      async saveTx() { return 42; }
    },
  };
  const orchestrator = new PipelineOrchestrator();
  const order: string[] = [];
  let sawDeferred = false;
  orchestrator.subscribe((progress) => {
    if (progress.jobs[0]?.status === "deferred") sawDeferred = true;
  });
  (orchestrator as any).processJob = async (job: any, _libraryID: number, _collectionID: number, _config: any, retry = false) => {
    order.push(`${job.paper.row}:${retry ? "retry" : "first"}`);
    if (job.paper.row === 2 && !retry) {
      job.status = "fetching";
      throw new PDFLookupTimeoutError(10 * 60 * 1000);
    }
    job.status = "done";
    job.message = "Complete";
  };

  await orchestrator.run([
    { row: 2, title: "Slow PDF" },
    { row: 3, title: "Fast PDF" },
  ], "abc", {} as any);

  assert.deepEqual(order, ["2:first", "3:first", "2:retry"]);
  assert.equal(sawDeferred, true);
  assert.equal(orchestrator.getProgress().done, 2);
  assert.equal(orchestrator.getProgress().failed, 0);
});

test("a second PDF timeout becomes a visible PDF-stage failure", async () => {
  (globalThis as any).Zotero = {
    Libraries: { userLibraryID: 1 },
    logError() {},
    Collection: class {
      libraryID = 0;
      name = "";
      async saveTx() { return 42; }
    },
  };
  const orchestrator = new PipelineOrchestrator();
  let attempts = 0;
  (orchestrator as any).processJob = async (job: any) => {
    attempts += 1;
    job.status = "fetching";
    throw new PDFLookupTimeoutError(10 * 60 * 1000);
  };

  await orchestrator.run([{ row: 2, title: "Always slow" }], "abc", {} as any);

  const job = orchestrator.getProgress().jobs[0]!;
  assert.equal(attempts, 2);
  assert.equal(job.status, "failed");
  assert.equal(job.failedAt, "fetching");
  assert.match(job.message ?? "", /timed out after 10 minutes/i);
});
