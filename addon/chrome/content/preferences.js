var ScholarAssistantPreferences = {
  init() {
    const key = "extensions.zotero.scholarAssistant.googleModel";
    if (Zotero.Prefs.get(key, true) === "gemini-2.5-flash") {
      Zotero.Prefs.set(key, "gemini-3.5-flash-lite", true);
      const input = document.getElementById("scholar-assistant-google-model");
      if (input) input.value = "gemini-3.5-flash-lite";
    }
    this.updateProvider(false);
  },

  getProvider() {
    return String(document.getElementById("scholar-assistant-provider")?.value
      || Zotero.Prefs.get("extensions.zotero.scholarAssistant.provider", true)
      || "ollama");
  },

  updateProvider(persist) {
    const provider = this.getProvider();
    if (persist) Zotero.Prefs.set("extensions.zotero.scholarAssistant.provider", provider, true);
    const google = provider === "google";
    for (const id of ["scholar-assistant-ollama-endpoint-row", "scholar-assistant-ollama-model-row"]) {
      document.getElementById(id).hidden = google;
    }
    for (const id of ["scholar-assistant-google-model-row", "scholar-assistant-google-key-row", "scholar-assistant-google-thinking-row"]) {
      document.getElementById(id).hidden = !google;
    }
    document.getElementById("scholar-assistant-privacy-note").textContent = google
      ? "Google mode sends extracted paper text to Google's Gemini API. The API key is stored locally in Zotero preferences and is not encrypted."
      : "Ollama mode processes extracted paper text locally and does not require an API key.";
  },

  normalizeEndpoint(value) {
    var endpoint = String(value || "").trim() || "http://127.0.0.1:11434";
    if (!/^https?:\/\//i.test(endpoint)) endpoint = "http://" + endpoint;
    return endpoint.replace(/\/+$/, "");
  },

  async testConnection() {
    const result = document.getElementById("scholar-assistant-test-result");
    const button = document.getElementById("scholar-assistant-test");
    const provider = this.getProvider();
    const endpointInput = document.getElementById("scholar-assistant-endpoint");
    const modelInput = document.getElementById("scholar-assistant-model");
    const googleModelInput = document.getElementById("scholar-assistant-google-model");
    const googleKeyInput = document.getElementById("scholar-assistant-google-key");
    const endpoint = this.normalizeEndpoint(endpointInput?.value || Zotero.Prefs.get("extensions.zotero.scholarAssistant.ollamaEndpoint", true));
    const model = String(modelInput?.value || Zotero.Prefs.get("extensions.zotero.scholarAssistant.ollamaModel", true) || "gemma3:latest");
    const requestedGoogleModel = String(googleModelInput?.value || Zotero.Prefs.get("extensions.zotero.scholarAssistant.googleModel", true) || "gemini-3.5-flash-lite").replace(/^models\//, "");
    const googleModel = requestedGoogleModel === "gemini-2.5-flash" ? "gemini-3.5-flash-lite" : requestedGoogleModel;
    const googleKey = String(googleKeyInput?.value || Zotero.Prefs.get("extensions.zotero.scholarAssistant.googleApiKey", true) || "").trim();
    Zotero.Prefs.set("extensions.zotero.scholarAssistant.provider", provider, true);
    if (endpointInput) endpointInput.value = endpoint;
    Zotero.Prefs.set("extensions.zotero.scholarAssistant.ollamaEndpoint", endpoint, true);
    if (googleModelInput) googleModelInput.value = googleModel;
    Zotero.Prefs.set("extensions.zotero.scholarAssistant.googleModel", googleModel, true);
    if (googleKeyInput?.value) Zotero.Prefs.set("extensions.zotero.scholarAssistant.googleApiKey", googleKey, true);
    result.textContent = "Checking…";
    result.style.color = "inherit";
    button.disabled = true;
    try {
      if (provider === "google") {
        if (!googleKey) throw new Error("Google AI API key is missing.");
        const generationConfig = { maxOutputTokens: 32, temperature: 0 };
        if (/^gemini-3\.(?:1|5|6)-.*flash/i.test(googleModel)) generationConfig.thinkingConfig = { thinkingLevel: "minimal" };
        else if (/^gemini-3\.7-flash(?:$|-)/i.test(googleModel)) generationConfig.thinkingConfig = { thinkingLevel: "low" };
        await Zotero.HTTP.request("POST", "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(googleModel) + ":generateContent", {
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: "Reply with exactly: connected" }] }],
            generationConfig,
          }),
          headers: { "Content-Type": "application/json", "x-goog-api-key": googleKey },
          responseType: "json",
          timeout: 15000,
        });
        result.textContent = "Connected — Google Gemini generated a test response.";
        result.style.color = "#2e7d32";
        return;
      }
      const response = await Zotero.HTTP.request("GET", endpoint + "/api/tags", { responseType: "json", timeout: 10000 });
      const data = typeof response.response === "string" ? JSON.parse(response.response) : response.response;
      const models = Array.isArray(data?.models) ? data.models.map((entry) => entry.name) : [];
      const ready = models.includes(model);
      result.textContent = ready
        ? "Connected — model is ready."
        : "Connected, but this model is not installed. Run: ollama pull " + model;
      result.style.color = ready ? "#2e7d32" : "#b26a00";
    } catch (error) {
      result.textContent = "Connection failed: " + (error?.message || error);
      result.style.color = "#c62828";
    } finally {
      button.disabled = false;
    }
  },
};
