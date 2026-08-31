import { DashboardController } from "./ui/dashboard";
import { registerProgressPanel, unregisterProgressPanel } from "./ui/progressPanel";
import { registerSettingsPane } from "./ui/settingsPane";
import { PipelineOrchestrator } from "./pipeline/orchestrator";
import { logger } from "./utils/logger";
import type { PaperRecord, PipelineProgress } from "./types";

const PLUGIN_ID = "scholar-assistant@zotero-plugin.local";

export class Hooks {
  private readonly orchestrator = new PipelineOrchestrator();
  private dashboard: DashboardController;
  private paneID: string | null = null;
  private observerID: string | null = null;

  constructor(private readonly rootURI: string) {
    this.dashboard = new DashboardController(rootURI, this.orchestrator);
  }

  async startup(): Promise<void> {
    for (const win of Zotero.getMainWindows()) {
      win.MozXULElement?.insertFTLIfNeeded?.("scholar-assistant.ftl");
    }
    this.paneID = registerProgressPanel(this.rootURI, this.orchestrator);
    registerSettingsPane(this.rootURI);
    this.observerID = Zotero.Notifier.registerObserver({
      notify: (_event: string, _type: string, _ids: number[]) => undefined,
    }, ["item"], PLUGIN_ID);
    for (const win of Zotero.getMainWindows()) this.onMainWindowLoad(win);
  }

  onMainWindowLoad(win: Window): void {
    win.MozXULElement?.insertFTLIfNeeded?.("scholar-assistant.ftl");
    if (!win.document.getElementById("scholar-assistant-menu")) {
      const popup = win.document.getElementById("menu_ToolsPopup")
        ?? win.document.getElementById("menu_toolsPopup");
      if (!popup) {
        logger.debug("Tools menu was not found in this window");
      } else {
        const menu = win.document.createXULElement("menu");
        menu.id = "scholar-assistant-menu";
        menu.setAttribute("label", "Scholar Assistant");
        const submenu = win.document.createXULElement("menupopup");
        const importItem = win.document.createXULElement("menuitem");
        importItem.id = "scholar-assistant-import";
        importItem.setAttribute("label", "Import Papers…");
        importItem.addEventListener("command", () => void this.importPapers(win, importItem));
        const selectedItem = win.document.createXULElement("menuitem");
        selectedItem.id = "scholar-assistant-process-selected";
        selectedItem.setAttribute("label", "Process Selected Paper…");
        selectedItem.addEventListener("command", () => void this.processSelectedPaper(win, selectedItem));
        const dashboardItem = win.document.createXULElement("menuitem");
        dashboardItem.setAttribute("label", "Open Dashboard…");
        dashboardItem.addEventListener("command", () => this.dashboard.open(win));
        const testItem = win.document.createXULElement("menuitem");
        testItem.setAttribute("label", "Test AI Connection");
        testItem.addEventListener("command", () => void this.testAI(win));
        const settingsItem = win.document.createXULElement("menuitem");
        settingsItem.setAttribute("label", "Settings…");
        settingsItem.addEventListener("command", () => {
          const openPreferences = (Zotero.Utilities.Internal as any).openPreferences;
          if (typeof openPreferences === "function") openPreferences("zotero-prefpane-scholar-assistant");
          else win.alert("Open Zotero Settings and select Scholar Assistant.");
        });
        submenu.append(importItem, selectedItem, dashboardItem, testItem, settingsItem);
        menu.append(submenu);
        popup.append(menu);
      }
    }

    const itemMenu = win.document.getElementById("zotero-itemmenu");
    if (itemMenu && !win.document.getElementById("scholar-assistant-process-selected-context")) {
      const selectedItem = win.document.createXULElement("menuitem");
      selectedItem.id = "scholar-assistant-process-selected-context";
      selectedItem.setAttribute("label", "Scholar Assistant: Process PDF");
      selectedItem.addEventListener("command", () => void this.processSelectedPaper(win, selectedItem));
      itemMenu.append(selectedItem);
    }
  }

  onMainWindowUnload(win: Window): void {
    win.document.getElementById("scholar-assistant-menu")?.remove();
    win.document.getElementById("scholar-assistant-process-selected-context")?.remove();
  }

  async shutdown(): Promise<void> {
    this.orchestrator.stop();
    if (this.observerID) Zotero.Notifier.unregisterObserver(this.observerID);
    unregisterProgressPanel(this.paneID);
    for (const win of Zotero.getMainWindows()) this.onMainWindowUnload(win);
    this.observerID = null;
    this.paneID = null;
  }

  private async importPapers(win: Window, menuItem: Element): Promise<void> {
    let latest: PipelineProgress | null = null;
    let unsubscribe: (() => void) | null = null;
    try {
      const selection = await this.dashboard.chooseCSV(win);
      if (!selection) return;
      const config = this.dashboard.getConfig();
      const providerName = config.provider === "google" ? "Google Gemini" : "Ollama";
      const confirmed = win.confirm(
        `Selected ${selection.papers.length} paper${selection.papers.length === 1 ? "" : "s"} from:\n${selection.path}\n\nAI provider: ${providerName}\nModel: ${config.model}\n\nCreate collection “${selection.collectionName}” and begin processing?`,
      );
      if (!confirmed) return;

      menuItem.setAttribute("disabled", "true");
      unsubscribe = this.orchestrator.subscribe((progress) => {
        latest = progress;
        const completed = progress.done + progress.failed;
        menuItem.setAttribute("label", `Processing Papers… ${completed}/${progress.total}`);
      });
      win.alert("Scholar Assistant processing has started. Papers are processed sequentially; Zotero will notify you when it finishes.");
      const run = this.dashboard.start(selection.papers, selection.collectionName);
      this.dashboard.open(win, selection);
      await run;
      const result = latest as PipelineProgress | null;
      const failures = result?.jobs
        .filter((job) => job.status === "failed")
        .slice(0, 5)
        .map((job) => `Row ${job.paper.row} — failed at ${formatStage(job.failedAt)}:\n${job.message || "Unknown error"}`)
        .join("\n");
      win.alert(
        result
          ? `Scholar Assistant finished.\n\nCompleted: ${result.done}\nFailed: ${result.failed}\nTotal: ${result.total}${failures ? `\n\nFailure details:\n${failures}` : ""}`
          : "Scholar Assistant finished.",
      );
    } catch (error) {
      logger.error("Import failed", error);
      this.dashboard.reportError(error);
      win.alert(`Scholar Assistant import failed:\n\n${error instanceof Error ? error.message : String(error)}`);
    } finally {
      unsubscribe?.();
      menuItem.removeAttribute("disabled");
      menuItem.setAttribute("label", "Import Papers…");
    }
  }

  private async processSelectedPaper(win: Window, menuItem: Element): Promise<void> {
    let latest: PipelineProgress | null = null;
    let unsubscribe: (() => void) | null = null;
    const originalLabel = menuItem.getAttribute("label") || "Process Selected Paper…";
    try {
      const selectedItems = (win as any).ZoteroPane?.getSelectedItems?.() ?? [];
      const { item, attachment } = resolveSelectedPDF(selectedItems);
      const paper = paperRecordFromItem(item);
      const config = this.dashboard.getConfig();
      const providerName = config.provider === "google" ? "Google Gemini" : "Ollama";
      const confirmed = win.confirm(
        `Process “${paper.title}” using its existing PDF attachment?\n\nAI provider: ${providerName}\nModel: ${config.model}\n\nScholar Assistant will add AI highlights, a study-note summary, and a quiz to this Zotero item. Existing output will not be removed.`,
      );
      if (!confirmed) return;

      menuItem.setAttribute("disabled", "true");
      unsubscribe = this.orchestrator.subscribe((progress) => {
        latest = progress;
        const completed = progress.done + progress.failed;
        menuItem.setAttribute("label", `Processing Selected Paper… ${completed}/${progress.total}`);
      });
      const selection = {
        path: attachmentDisplayName(attachment),
        papers: [paper],
        collectionName: "Existing Zotero item (no new collection)",
        autoStarted: true,
      };
      const run = this.dashboard.startSelectedItem(paper, item, attachment);
      this.dashboard.open(win, selection);
      await run;

      const result = latest as PipelineProgress | null;
      const failedJob = result?.jobs.find((job) => job.status === "failed");
      win.alert(
        failedJob
          ? `Scholar Assistant could not process the selected paper.\n\nFailed at ${formatStage(failedJob.failedAt)}:\n${failedJob.message || "Unknown error"}`
          : "Scholar Assistant finished processing the selected paper.\n\nThe highlights were added to its PDF, and the study note and quiz were added under the Zotero item.",
      );
    } catch (error) {
      logger.error("Selected-paper processing failed", error);
      this.dashboard.reportError(error);
      win.alert(`Scholar Assistant could not process the selected paper:\n\n${error instanceof Error ? error.message : String(error)}`);
    } finally {
      unsubscribe?.();
      menuItem.removeAttribute("disabled");
      menuItem.setAttribute("label", originalLabel);
    }
  }

  private async testAI(win: Window): Promise<void> {
    try {
      const config = this.dashboard.getConfig();
      const result = await this.dashboard.checkProvider();
      const models = result.models.length ? `\n\nAvailable models:\n${result.models.join("\n")}` : "";
      win.alert(`Scholar Assistant — ${config.provider === "google" ? "Google Gemini" : "Ollama"} test\n\n${result.ok ? "SUCCESS" : "FAILED"}\n${result.message}${models}`);
    } catch (error) {
      logger.error("AI connection test failed", error);
      win.alert(`Scholar Assistant — AI connection test\n\nFAILED\n${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export function resolveSelectedPDF(
  selectedItems: any[],
  getItem: (id: number) => any = (id) => Zotero.Items.get(id),
): { item: any; attachment: any } {
  if (selectedItems.length !== 1) {
    throw new Error("Select exactly one Zotero paper item or one of its PDF attachments.");
  }

  const selected = selectedItems[0];
  if (selected?.isAttachment?.()) {
    if (!isPDFAttachment(selected)) throw new Error("The selected attachment is not a PDF.");
    const item = selected.parentID ? getItem(selected.parentID) : null;
    if (!item?.isRegularItem?.()) {
      throw new Error("The selected PDF must be attached to a bibliographic Zotero item.");
    }
    return { item, attachment: selected };
  }

  if (!selected?.isRegularItem?.()) {
    throw new Error("Select a bibliographic Zotero item that has a PDF attachment.");
  }
  const attachment = (selected.getAttachments?.() ?? [])
    .map((id: number) => getItem(id))
    .find((candidate: any) => isPDFAttachment(candidate));
  if (!attachment) throw new Error("The selected Zotero item has no PDF attachment.");
  return { item: selected, attachment };
}

export function paperRecordFromItem(item: any): PaperRecord {
  const title = String(item.getField?.("title") || item.getDisplayTitle?.() || "Selected Zotero paper").trim();
  const doi = String(item.getField?.("DOI") || "").trim();
  const url = String(item.getField?.("url") || "").trim();
  const date = String(item.getField?.("date") || "").trim();
  const year = date.match(/\b(?:19|20)\d{2}\b/)?.[0];
  return {
    row: 1,
    title,
    doi: doi || undefined,
    url: url || undefined,
    year,
  };
}

function isPDFAttachment(item: any): boolean {
  if (!item?.isAttachment?.()) return false;
  const contentType = String(item.attachmentContentType || "").toLowerCase();
  const fileName = String(item.getFilename?.() || "");
  return contentType === "application/pdf" || /\.pdf$/i.test(fileName);
}

function attachmentDisplayName(attachment: any): string {
  return String(attachment.getFilename?.() || attachment.getField?.("title") || "Selected Zotero PDF");
}

function formatStage(stage: string | undefined): string {
  const labels: Record<string, string> = {
    matching: "metadata resolution",
    fetching: "PDF retrieval",
    extracting: "PDF text extraction",
    "ai-highlights": "AI highlight generation",
    "ai-notes": "AI study-note generation",
    "ai-quiz": "AI quiz generation",
    annotating: "saving PDF highlights",
    notes: "saving the study note",
    quiz: "saving the quiz",
  };
  return stage ? labels[stage] ?? stage : "unknown stage";
}
