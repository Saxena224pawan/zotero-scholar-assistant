import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const manifest = JSON.parse(readFileSync(new URL("../addon/manifest.json", import.meta.url), "utf8"));
const packageJSON = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const updates = JSON.parse(readFileSync(new URL("../updates.json", import.meta.url), "utf8"));

test("Zotero manifest has matching version and required install metadata", () => {
  const zotero = manifest.applications?.zotero;
  assert.equal(manifest.version, packageJSON.version);
  assert.equal(zotero?.strict_min_version, "10.0");
  assert.equal(zotero?.strict_max_version, "10.0.*");
  assert.match(manifest.homepage_url, /^https:\/\//);
  assert.match(zotero?.update_url, /^https:\/\//);
});

test("update manifest contains the add-on ID", () => {
  const id = manifest.applications.zotero.id;
  assert.ok(updates.addons?.[id]);
  assert.ok(Array.isArray(updates.addons[id].updates));
});

test("release automation builds and publishes a versioned XPI", () => {
  const workflow = readFileSync(new URL("../.github/workflows/release.yml", import.meta.url), "utf8");
  const buildScript = readFileSync(new URL("../scripts/build.mjs", import.meta.url), "utf8");
  assert.match(workflow, /tags:\s*\n\s*- ["']v\*["']/);
  assert.match(workflow, /gh release (?:create|upload)/);
  assert.match(workflow, /write-update-manifest\.mjs/);
  assert.match(buildScript, /packageJSON\.version/);
  assert.doesNotMatch(buildScript, /zotero-scholar-assistant-\d+\.\d+\.\d+\.xpi/);
});
