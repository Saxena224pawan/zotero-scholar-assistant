var ScholarAssistantDashboard = {
  controller: null,
  papers: [],
  jobs: [],
  paused: false,
  pollTimer: null,
  steps: ["matching", "fetching", "extracting", "ai-highlights", "ai-notes", "ai-quiz", "annotating", "notes", "quiz"],
  rowKeys: [],
  rowElements: [],
  rowSignatures: [],
  failureSignature: "",

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
      this.pollTimer = window.setInterval(() => this.refreshProgress(), 1500);
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
    this.resetRows();
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
    ScholarAssistantDashboard.renderFailures(progress.jobs);
    const completed = progress.done + progress.failed;
    const active = progress.jobs.find((job) => !["pending", "done", "failed", "stopped"].includes(job.status));
    const activeIndex = active ? progress.jobs.indexOf(active) : -1;
    const bar = document.getElementById("scholar-assistant-progress");
    const steps = ScholarAssistantDashboard.steps;
    const totalSteps = Math.max(progress.total * steps.length, 1);
    const completedSteps = progress.jobs.reduce((sum, job) => {
      if (job.status === "done") return sum + steps.length;
      const currentStep = steps.indexOf(job.status === "failed" ? job.failedAt : job.status);
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
      ? `Paper ${activeIndex + 1} of ${progress.total} · ${active.paper.title || active.paper.doi || `Row ${active.paper.row}`}: ${active.message || active.status}`
      : progress.paused ? "Processing is paused." : progress.total ? "No paper is currently active." : "No import is running.";
    ScholarAssistantDashboard.setLabel(`${completed}/${progress.total} complete · ${progress.failed} failed${progress.paused ? " · paused" : ""}`);
    ScholarAssistantDashboard.setRunning(progress.running);
  },

  renderPapers() {
    const body = document.getElementById("scholar-assistant-paper-rows");
    const rows = this.jobs.length ? this.jobs : this.papers.map((paper) => ({ paper, status: "pending", message: "Waiting" }));
    const keys = rows.map((job, index) => job.id || `paper-${job.paper.row}-${index}`);
    const structureChanged = keys.length !== this.rowKeys.length || keys.some((key, index) => key !== this.rowKeys[index]);
    if (structureChanged) {
      body.replaceChildren();
      this.rowKeys = keys;
      this.rowElements = [];
      this.rowSignatures = [];
      rows.forEach((job, index) => {
        const row = this.createPaperRow(job, index);
        this.rowElements.push(row);
        body.append(row.tr);
      });
    }
    rows.forEach((job, index) => {
      const signature = `${job.status}|${job.failedAt || ""}|${job.message || ""}`;
      if (this.rowSignatures[index] === signature) return;
      this.rowSignatures[index] = signature;
      this.updatePaperRow(this.rowElements[index], job);
    });
  },

  createPaperRow(job, index) {
    const paper = job.paper;
    const tr = document.createElementNS("http://www.w3.org/1999/xhtml", "tr");
    [String(index + 1), paper.title || paper.doi || paper.arxivId || paper.url || "Untitled"].forEach((value) => {
      const td = document.createElementNS("http://www.w3.org/1999/xhtml", "td");
      td.textContent = value;
      tr.append(td);
    });
    const stepCells = {};
    ScholarAssistantDashboard.steps.forEach((step) => {
      const td = document.createElementNS("http://www.w3.org/1999/xhtml", "td");
      stepCells[step] = td;
      tr.append(td);
    });
    const status = document.createElementNS("http://www.w3.org/1999/xhtml", "td");
    tr.append(status);
    return { tr, stepCells, status };
  },

  updatePaperRow(row, job) {
    if (!row) return;
    ScholarAssistantDashboard.steps.forEach((step) => {
      const state = ScholarAssistantDashboard.stepState(job.status, step, job.failedAt);
      const cell = row.stepCells[step];
      cell.className = `scholar-assistant-step ${state}`;
      cell.textContent = state === "complete" ? "✓" : state === "active" ? "●" : state === "failed" ? "✕" : "—";
      cell.title = `${ScholarAssistantDashboard.stageLabel(step)}: ${state}`;
    });
    row.status.textContent = job.message || job.status || "Waiting";
  },

  resetRows() {
    this.rowKeys = [];
    this.rowElements = [];
    this.rowSignatures = [];
    this.failureSignature = "";
    document.getElementById("scholar-assistant-paper-rows")?.replaceChildren();
  },

  stepState(status, step, failedAt) {
    const order = ScholarAssistantDashboard.steps.concat("done");
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

  renderFailures(jobs) {
    const panel = document.getElementById("scholar-assistant-failures");
    const list = document.getElementById("scholar-assistant-failure-list");
    const failures = jobs.filter((job) => job.status === "failed");
    panel.hidden = failures.length === 0;
    const signature = failures.map((job) => `${job.id}|${job.failedAt}|${job.message}`).join("\n");
    if (signature === this.failureSignature) return;
    this.failureSignature = signature;
    list.replaceChildren();
    failures.forEach((job) => {
      const entry = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
      entry.className = "scholar-assistant-failure-entry";
      const heading = document.createElementNS("http://www.w3.org/1999/xhtml", "strong");
      const paper = job.paper.title || job.paper.doi || job.paper.arxivId || `Row ${job.paper.row}`;
      heading.textContent = `Row ${job.paper.row} · ${paper} · Failed at ${ScholarAssistantDashboard.stageLabel(job.failedAt)}`;
      const message = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
      message.textContent = job.message || "Unknown error";
      entry.append(heading, message);
      list.append(entry);
    });
  },

  stageLabel(stage) {
    return ({
      matching: "metadata",
      fetching: "PDF retrieval",
      extracting: "PDF text extraction",
      "ai-highlights": "AI highlight generation",
      "ai-notes": "AI study-note generation",
      "ai-quiz": "AI quiz generation",
      annotating: "saving PDF highlights",
      notes: "saving the study note",
      quiz: "saving the quiz",
    })[stage] || stage || "unknown stage";
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
