import type { PipelineProgress } from "../types";
import type { PipelineOrchestrator } from "../pipeline/orchestrator";
import { logger } from "../utils/logger";

const PLUGIN_ID = "scholar-assistant@zotero-plugin.local";

export function registerProgressPanel(rootURI: string, orchestrator: PipelineOrchestrator): string {
  let latest = orchestrator.getProgress();
  orchestrator.subscribe((progress) => { latest = progress; });

  const registered = Zotero.ItemPaneManager.registerSection({
    paneID: "scholar-assistant-status",
    pluginID: PLUGIN_ID,
    header: {
      l10nID: "scholar-assistant-item-pane-header",
      icon: `${rootURI}chrome/content/icons/icon.svg`,
    },
    sidenav: {
      l10nID: "scholar-assistant-item-pane-header",
      icon: `${rootURI}chrome/content/icons/icon.svg`,
    },
    bodyXHTML: '<html:div id="scholar-assistant-section-body" style="padding:10px;color:var(--fill-primary,CanvasText);background:transparent">Loading Scholar Assistant status…</html:div>',
    onRender: ({ body, item, setSectionSummary }: {
      body: HTMLElement;
      item: any;
      setSectionSummary: (summary: string) => void;
    }) => {
      try {
        const summary = renderStatus(body, item, latest);
        const completed = latest.done + latest.failed;
        setSectionSummary(latest.running ? `${completed}/${latest.total} processed` : summary);
      } catch (error) {
        logger.error("Could not render item-pane status", error);
        body.textContent = `Scholar Assistant status error: ${error instanceof Error ? error.message : String(error)}`;
        setSectionSummary("Error");
      }
    },
  });

  if (!registered) throw new Error("Zotero rejected the Scholar Assistant item-pane section.");
  return registered;
}

function renderStatus(body: HTMLElement, selectedItem: any, progress: PipelineProgress): string {
  body.replaceChildren();
  const wrapper = body.ownerDocument.createElement("div");
  wrapper.style.padding = "10px";
  wrapper.style.lineHeight = "1.45";
  wrapper.style.color = "var(--fill-primary, CanvasText)";
  wrapper.style.backgroundColor = "transparent";

  const completed = progress.done + progress.failed;
  appendLine(wrapper, progress.running
    ? `Active import: ${completed}/${progress.total} complete, ${progress.failed} failed.`
    : progress.total
      ? `Last import: ${progress.done} complete, ${progress.failed} failed.`
      : "No Scholar Assistant import has started in this Zotero session.", true);

  const activeJob = progress.jobs.find((job) => job.status !== "pending" && !["done", "failed", "stopped"].includes(job.status));
  if (activeJob) {
    const paperName = activeJob.paper.title || activeJob.paper.doi || activeJob.paper.arxivId || `row ${activeJob.paper.row}`;
    appendLine(wrapper, `Current paper: ${paperName} — ${activeJob.message || activeJob.status}`);
  }

  const item = resolveParentItem(selectedItem);
  if (!item?.isRegularItem?.()) {
    appendLine(wrapper, "Select a bibliographic paper to see its generated output.");
    body.append(wrapper);
    return "Select a paper";
  }

  const matchingJob = progress.jobs.find((job) => job.itemID === item.id);
  if (matchingJob) appendLine(wrapper, `Selected paper: ${matchingJob.message || matchingJob.status}`);

  const tags = item.getTags?.().map((entry: { tag: string }) => entry.tag) ?? [];
  const processed = tags.includes("scholar-assistant:processed");
  const notes = (item.getNotes?.() ?? []).map((id: number) => Zotero.Items.get(id));
  const studyNote = notes.find((note: any) => note?.getTags?.().some((entry: { tag: string }) => entry.tag === "scholar-assistant:note"));
  const quiz = notes.find((note: any) => note?.getTags?.().some((entry: { tag: string }) => entry.tag === "scholar-assistant:quiz"));
  const annotationCount = (item.getAttachments?.() ?? [])
    .map((id: number) => Zotero.Items.get(id))
    .reduce((sum: number, attachment: any) => sum + (attachment?.getAnnotations?.()?.length ?? 0), 0);

  const title = body.ownerDocument.createElement("h3");
  title.textContent = item.getDisplayTitle?.() || item.getField?.("title") || "Selected paper";
  title.style.margin = "8px 0";
  wrapper.append(title);

  const output = body.ownerDocument.createElement("div");
  output.style.display = "grid";
  output.style.gridTemplateColumns = "repeat(3, minmax(0, 1fr))";
  output.style.gap = "6px";
  output.style.margin = "8px 0";
  appendBadge(output, "Highlights", String(annotationCount), annotationCount > 0);
  appendBadge(output, "Study note", studyNote ? "Ready" : "Missing", Boolean(studyNote));
  appendBadge(output, "Quiz", quiz ? "Ready" : "Missing", Boolean(quiz));
  wrapper.append(output);

  const actions = body.ownerDocument.createElement("div");
  actions.style.display = "flex";
  actions.style.flexWrap = "wrap";
  actions.style.gap = "6px";
  if (studyNote) appendOpenButton(actions, "Open study note", studyNote.id);
  if (quiz) appendOpenButton(actions, "Open quiz", quiz.id);
  if (actions.childElementCount) wrapper.append(actions);

  appendLine(wrapper, processed
    ? "Processing completed. The generated notes are stored as child notes under this paper."
    : matchingJob?.status === "failed"
      ? `Processing failed at ${matchingJob.failedAt || "an unknown stage"}: ${matchingJob.message || "Unknown error"}`
      : "This paper has not completed Scholar Assistant processing.");
  body.append(wrapper);
  return processed ? `${annotationCount} highlights · notes ready` : "Not processed";
}

function resolveParentItem(item: any): any {
  if (!item) return null;
  if ((item.isAttachment?.() || item.isNote?.()) && item.parentID) return Zotero.Items.get(item.parentID) ?? item;
  return item;
}

function appendBadge(parent: HTMLElement, label: string, value: string, available: boolean): void {
  const badge = parent.ownerDocument.createElement("div");
  badge.style.padding = "7px";
  badge.style.border = "1px solid var(--fill-quinary, GrayText)";
  badge.style.borderRadius = "5px";
  badge.style.background = "var(--material-sidepane, transparent)";
  badge.style.color = "var(--fill-primary, CanvasText)";
  const heading = parent.ownerDocument.createElement("strong");
  heading.textContent = label;
  const status = parent.ownerDocument.createElement("div");
  status.textContent = `${available ? "✓" : "—"} ${value}`;
  status.style.color = available ? "#43a047" : "GrayText";
  badge.append(heading, status);
  parent.append(badge);
}

function appendOpenButton(parent: HTMLElement, label: string, itemID: number): void {
  const button = parent.ownerDocument.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", () => {
    const win = Zotero.getMainWindow();
    void win?.ZoteroPane?.selectItem?.(itemID);
  });
  parent.append(button);
}

function appendLine(parent: HTMLElement, text: string, strong = false): void {
  const line = parent.ownerDocument.createElement("p");
  line.style.margin = "0 0 6px";
  if (strong) line.style.fontWeight = "600";
  line.textContent = text;
  parent.append(line);
}

export function unregisterProgressPanel(id: string | null): void {
  if (id) Zotero.ItemPaneManager.unregisterSection(id);
}
