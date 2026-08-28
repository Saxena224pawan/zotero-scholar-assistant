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
