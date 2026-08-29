import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

class FakeElement {
  children: FakeElement[] = [];
  replaceCount = 0;
  textContent = "";
  className = "";
  title = "";
  hidden = false;
  value: any = "";
  max = 0;
  disabled = false;
  label = "";

  append(...children: FakeElement[]): void { this.children.push(...children); }
  replaceChildren(...children: FakeElement[]): void {
    this.replaceCount += 1;
    this.children = children;
  }
  get childElementCount(): number { return this.children.length; }
}

function loadDashboard() {
  const ids = new Map<string, FakeElement>();
  [
    "scholar-assistant-paper-rows", "scholar-assistant-failures", "scholar-assistant-failure-list",
    "scholar-assistant-progress", "scholar-assistant-overall-status", "scholar-assistant-current-stage",
    "scholar-assistant-progress-label", "scholar-assistant-start", "scholar-assistant-pause", "scholar-assistant-stop",
  ].forEach((id) => ids.set(id, new FakeElement()));
  const document = {
    getElementById(id: string) { return ids.get(id); },
    createElementNS() { return new FakeElement(); },
  };
  const window: any = {};
  vm.runInNewContext(
    readFileSync(new URL("../addon/chrome/content/dashboard.js", import.meta.url), "utf8"),
    { window, document, console },
  );
  return { dashboard: window.ScholarAssistantDashboard, ids };
}

test("147-paper progress updates reuse dashboard rows", () => {
  const { dashboard, ids } = loadDashboard();
  const papers = Array.from({ length: 147 }, (_, index) => ({ row: index + 2, title: `Paper ${index + 1}` }));
  dashboard.papers = papers;
  dashboard.renderPapers();

  const body = ids.get("scholar-assistant-paper-rows")!;
  assert.equal(body.children.length, 147);
  assert.equal(body.replaceCount, 1);

  dashboard.jobs = papers.map((paper, index) => ({ id: `job-${index}`, paper, status: "pending", message: "Waiting" }));
  dashboard.renderPapers();
  assert.equal(body.children.length, 147);
  assert.equal(body.replaceCount, 2);
  const firstRow = body.children[0];

  dashboard.jobs[0] = { ...dashboard.jobs[0], status: "fetching", message: "Finding an open PDF" };
  dashboard.renderPapers();
  dashboard.renderPapers();
  assert.equal(body.replaceCount, 2);
  assert.equal(body.children[0], firstRow);
  assert.equal(dashboard.rowElements[0].status.textContent, "Finding an open PDF");
  assert.equal(dashboard.rowElements[0].stepCells.fetching.textContent, "●");
});
