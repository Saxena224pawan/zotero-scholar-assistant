import type { PaperRecord, PipelineProgress } from "../types";
import { createLLMClient } from "../llm/client";
import { parseCSV } from "../pipeline/csvParser";
import { PipelineOrchestrator } from "../pipeline/orchestrator";
import { getLLMConfig } from "../utils/prefs";

export class DashboardController {
  private dialog: Window | null = null;

  constructor(private readonly rootURI: string, private readonly orchestrator: PipelineOrchestrator) {
    orchestrator.subscribe((progress) => this.notify(progress));
  }

  open(parent: Window): void {
    if (this.dialog && !this.dialog.closed) {
      this.dialog.focus();
      return;
    }
    this.dialog = parent.openDialog(
      "chrome://scholar-assistant/content/dashboard.xhtml",
      "scholar-assistant-dashboard",
      "chrome,centerscreen,resizable,width=980,height=680",
      this,
    );
  }

  async chooseCSV(parent?: Window): Promise<{ path: string; papers: PaperRecord[]; collectionName: string } | null> {
    const { FilePicker } = ChromeUtils.importESModule("chrome://zotero/content/modules/filePicker.mjs");
    const picker = new FilePicker();
    picker.init(parent ?? this.dialog, "Select a paper CSV", picker.modeOpen);
    picker.appendFilter("CSV and tabular files", "*.csv;*.tsv;*.txt");
    const result = await picker.show();
    if (result !== picker.returnOK) return null;
    const path = String(picker.file);
    const input = await Zotero.File.getContentsAsync(path);
    const papers = parseCSV(input);
    const fileName = (path.split(/[\\/]/).pop() ?? "").replace(/\.[^.]+$/, "");
    return { path, papers, collectionName: fileName || `Imported Papers - ${new Date().toISOString().slice(0, 10)}` };
  }

  async start(papers: PaperRecord[], collectionName: string): Promise<void> {
    const config = getLLMConfig();
    const connection = await createLLMClient(config).checkConnection();
    if (!connection.ok) throw new Error(connection.message);
    await this.orchestrator.run(papers, collectionName, config);
  }

  pause(): void { this.orchestrator.pause(); }
  resume(): void { this.orchestrator.resume(); }
  stop(): void { this.orchestrator.stop(); }

  getConfig(): ReturnType<typeof getLLMConfig> {
    return getLLMConfig();
  }

  getProgress(): PipelineProgress {
    return this.orchestrator.getProgress();
  }

  async checkProvider(): Promise<{ ok: boolean; models: string[]; message: string }> {
    return createLLMClient(getLLMConfig()).checkConnection();
  }

  private notify(progress: PipelineProgress): void {
    const callback = (this.dialog as any)?.ScholarAssistantDashboard?.renderProgress;
    if (typeof callback === "function") callback(progress);
  }
}
