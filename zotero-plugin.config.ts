export default {
  addonName: "Zotero Scholar Assistant",
  addonID: "scholar-assistant@zotero-plugin.local",
  addonRef: "scholar-assistant",
  prefsPrefix: "extensions.zotero.scholarAssistant",
  build: {
    entry: "src/index.ts",
    output: "content/index.js",
    xpi: "build/zotero-scholar-assistant-1.3.8.xpi",
  },
};
