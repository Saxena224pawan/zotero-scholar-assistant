import { DashboardController } from "./ui/dashboard";
import { registerProgressPanel, unregisterProgressPanel } from "./ui/progressPanel";
import { registerSettingsPane } from "./ui/settingsPane";
import { PipelineOrchestrator } from "./pipeline/orchestrator";
import { logger } from "./utils/logger";
import type { PipelineProgress } from "./types";

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
    if (win.document.getElementById("scholar-assistant-menu")) return;
    win.MozXULElement?.insertFTLIfNeeded?.("scholar-assistant.ftl");
    const popup = win.document.getElementById("menu_ToolsPopup")
      ?? win.document.getElementById("menu_toolsPopup");
    if (!popup) {
      logger.debug("Tools menu was not found in this window");
      return;
    }
    const menu = win.document.createXULElement("menu");
    menu.id = "scholar-assistant-menu";
    menu.setAttribute("label", "Scholar Assistant");
    const submenu = win.document.createXULElement("menupopup");
    const importItem = win.document.createXULElement("menuitem");
    importItem.id = "scholar-assistant-import";
    importItem.setAttribute("label", "Import Papers…");
    importItem.addEventListener("command", () => void this.importPapers(win, importItem));
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
    submenu.append(importItem, dashboardItem, testItem, settingsItem);
    menu.append(submenu);
    popup.append(menu);
  }

  onMainWindowUnload(win: Window): void {
    win.document.getElementById("scholar-assistant-menu")?.remove();
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
