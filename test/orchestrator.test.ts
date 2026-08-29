import assert from "node:assert/strict";
import test from "node:test";
import { PipelineOrchestrator } from "../src/pipeline/orchestrator";

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
