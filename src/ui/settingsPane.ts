const PLUGIN_ID = "scholar-assistant@zotero-plugin.local";

export function registerSettingsPane(rootURI: string): string {
  return Zotero.PreferencePanes.register({
    pluginID: PLUGIN_ID,
    label: "Scholar Assistant",
    image: `${rootURI}chrome/content/icons/icon.svg`,
    src: `${rootURI}chrome/content/preferences.xhtml`,
    scripts: [`${rootURI}chrome/content/preferences.js`],
  });
}
