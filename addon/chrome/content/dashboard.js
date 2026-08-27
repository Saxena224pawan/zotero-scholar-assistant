var ScholarAssistantDashboard = {
  controller: null,
  papers: [],
  jobs: [],
  paused: false,
  pollTimer: null,
  steps: ["matching", "fetching", "extracting", "ai-highlights", "ai-notes", "ai-quiz", "annotating", "notes", "quiz"],

  init() {
    try {
      this.controller = window.arguments?.[0];
      if (!this.controller) throw new Error("Dashboard controller was not provided.");
      const config = this.controller.getConfig();
      document.getElementById("scholar-assistant-model").value = `${config.provider === "google" ? "Google Gemini" : "Ollama"} · ${config.model}`;
      const progress = this.controller.getProgress();
      if (progress && (progress.running || progress.total)) {
        this.renderProgress(progress);
      } else {
        this.setLabel("No import is running. Select a CSV to begin.");
      }
      this.pollTimer = window.setInterval(() => this.refreshProgress(), 500);
      window.addEventListener("unload", () => {
        if (this.pollTimer) window.clearInterval(this.pollTimer);
      }, { once: true });
    } catch (error) {
      this.showError(error);
    }
  },

  async chooseCSV() {
    try {
      const result = await this.controller.chooseCSV();
      if (!result) return;
      this.papers = result.papers;
      document.getElementById("scholar-assistant-file").value = result.path;
      document.getElementById("scholar-assistant-collection").value = result.collectionName;
      document.getElementById("scholar-assistant-start").disabled = false;
      this.renderPapers();
      this.setLabel(`${this.papers.length} papers ready.`);
    } catch (error) {
      this.showError(error);
    }
  },

  clear() {
    this.papers = [];
    this.jobs = [];
    document.getElementById("scholar-assistant-file").value = "";
    document.getElementById("scholar-assistant-collection").value = "";
    document.getElementById("scholar-assistant-start").disabled = true;
    this.renderPapers();
    this.setLabel("Select a CSV to begin.");
  },

  async start() {
    if (!this.papers.length) return;
    this.setRunning(true);
    try {
      await this.controller.start(this.papers, document.getElementById("scholar-assistant-collection").value);
    } catch (error) {
      this.showError(error);
    } finally {
      this.setRunning(false);
    }
  },

  togglePause() {
    this.paused = !this.paused;
    if (this.paused) this.controller.pause(); else this.controller.resume();
    document.getElementById("scholar-assistant-pause").label = this.paused ? "Resume" : "Pause";
  },

  stop() { this.controller.stop(); },

  async testOllama() {
    this.setLabel("Testing AI connection…");
    try {
      const result = await this.controller.checkProvider();
      this.setLabel(result.message);
    } catch (error) {
      this.showError(error);
    }
  },

  refreshProgress() {
    try {
      const progress = this.controller?.getProgress();
      if (progress && (progress.running || progress.total || this.jobs.length)) this.renderProgress(progress);
    } catch (error) {
      this.showError(error);
    }
  },

  renderProgress(progress) {
    ScholarAssistantDashboard.jobs = progress.jobs;
    ScholarAssistantDashboard.paused = progress.paused;
    ScholarAssistantDashboard.renderPapers();
    const completed = progress.done + progress.failed;
    const active = progress.jobs.find((job) => !["pending", "done", "failed", "stopped"].includes(job.status));
    const bar = document.getElementById("scholar-assistant-progress");
    const totalSteps = Math.max(progress.total * this.steps.length, 1);
    const completedSteps = progress.jobs.reduce((sum, job) => {
      if (job.status === "done") return sum + this.steps.length;
      const currentStep = this.steps.indexOf(job.status === "failed" ? job.failedAt : job.status);
      if (currentStep < 0) return sum;
      return sum + currentStep + (job.status === "failed" ? 1 : 0.5);
    }, 0);
    bar.max = totalSteps;
    bar.value = Math.min(totalSteps, completedSteps);
    const overall = document.getElementById("scholar-assistant-overall-status");
    const stage = document.getElementById("scholar-assistant-current-stage");
    overall.textContent = progress.running
      ? `${completed}/${progress.total} complete`
      : `Finished: ${progress.done} completed, ${progress.failed} failed`;
    stage.textContent = active
      ? `${active.paper.title || active.paper.doi || `Row ${active.paper.row}`}: ${active.message || active.status}`
      : progress.paused ? "Processing is paused." : progress.total ? "No paper is currently active." : "No import is running.";
    ScholarAssistantDashboard.setLabel(`${completed}/${progress.total} complete · ${progress.failed} failed${progress.paused ? " · paused" : ""}`);
    ScholarAssistantDashboard.setRunning(progress.running);
  },

  renderPapers() {
    const body = document.getElementById("scholar-assistant-paper-rows");
    body.replaceChildren();
    const rows = this.jobs.length ? this.jobs : this.papers.map((paper) => ({ paper, status: "pending", message: "Waiting" }));
    rows.forEach((job, index) => {
      const paper = job.paper;
      const tr = document.createElementNS("http://www.w3.org/1999/xhtml", "tr");
      [String(index + 1), paper.title || paper.doi || paper.arxivId || paper.url || "Untitled"].forEach((value) => {
        const td = document.createElementNS("http://www.w3.org/1999/xhtml", "td");
        td.textContent = value;
        tr.append(td);
      });
      this.steps.forEach((step) => {
        const td = document.createElementNS("http://www.w3.org/1999/xhtml", "td");
        const state = this.stepState(job.status, step, job.failedAt);
        td.className = `scholar-assistant-step ${state}`;
        td.textContent = state === "complete" ? "✓" : state === "active" ? "●" : state === "failed" ? "✕" : "—";
        td.title = `${step}: ${state}`;
        tr.append(td);
      });
      const status = document.createElementNS("http://www.w3.org/1999/xhtml", "td");
      status.textContent = job.message || job.status || "Waiting";
      tr.append(status);
      body.append(tr);
    });
  },

  stepState(status, step, failedAt) {
    const order = this.steps.concat("done");
    if (status === "done") return "complete";
    if (status === "pending" || status === "stopped") return "pending";
    const current = order.indexOf(status === "failed" ? failedAt : status);
    const target = order.indexOf(step);
    if (status === "failed") {
      if (target < current) return "complete";
      if (target === current) return "failed";
      return "pending";
    }
    if (target < current) return "complete";
    if (target === current) return "active";
    return "pending";
  },

  setRunning(running) {
    document.getElementById("scholar-assistant-start").disabled = running || !this.papers.length;
    document.getElementById("scholar-assistant-pause").disabled = !running;
    document.getElementById("scholar-assistant-stop").disabled = !running;
  },

  setLabel(value) { document.getElementById("scholar-assistant-progress-label").value = value; },
  showError(error) { this.setLabel(`Error: ${error?.message || error}`); },
};

window.ScholarAssistantDashboard = ScholarAssistantDashboard;
