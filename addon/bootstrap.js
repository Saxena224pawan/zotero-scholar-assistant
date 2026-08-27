var ScholarAssistant;
var chromeHandle;

async function startup({ id, version, rootURI }, reason) {
  try {
    await Zotero.initializationPromise;
    var addonManagerStartup = Cc["@mozilla.org/addons/addon-manager-startup;1"].getService(Ci.amIAddonManagerStartup);
    var manifestURI = Services.io.newURI(rootURI + "manifest.json");
    chromeHandle = addonManagerStartup.registerChrome(manifestURI, [
      ["content", "scholar-assistant", "chrome/content/"],
    ]);
    Services.scriptloader.loadSubScript(rootURI + "content/index.js", globalThis);
    ScholarAssistant = globalThis.ZoteroScholarAssistant;
    if (!ScholarAssistant) throw new Error("Scholar Assistant bundle did not initialize");
    await ScholarAssistant.startup({ id, version, rootURI, reason });
  } catch (error) {
    Zotero.logError(error);
    if (chromeHandle) chromeHandle.destruct();
    chromeHandle = null;
    ScholarAssistant = null;
    delete globalThis.ZoteroScholarAssistant;
    throw error;
  }
}

async function shutdown({ id, version, rootURI }, reason) {
  if (ScholarAssistant) await ScholarAssistant.shutdown({ id, version, rootURI, reason });
  ScholarAssistant = null;
  delete globalThis.ZoteroScholarAssistant;
  if (chromeHandle) chromeHandle.destruct();
  chromeHandle = null;
}

function install() {}
function uninstall() {}

function onMainWindowLoad(args) {
  ScholarAssistant?.onMainWindowLoad(args);
}

function onMainWindowUnload(args) {
  ScholarAssistant?.onMainWindowUnload(args);
}
