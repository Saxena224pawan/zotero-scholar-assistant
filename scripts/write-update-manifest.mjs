import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const xpiArgument = getArgument("--xpi");
const tag = getArgument("--tag");
const outputArgument = getOptionalArgument("--output");
const xpiPath = path.resolve(root, xpiArgument);
const outputPath = outputArgument ? path.resolve(root, outputArgument) : path.join(root, "updates.json");
const packageJSON = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const manifest = JSON.parse(await readFile(path.join(root, "addon", "manifest.json"), "utf8"));
const version = String(packageJSON.version);

if (manifest.version !== version) {
  throw new Error(`Version mismatch: package.json is ${version}, manifest.json is ${manifest.version}.`);
}
if (tag !== `v${version}`) {
  throw new Error(`Release tag ${tag} does not match package version v${version}.`);
}

const xpi = await readFile(xpiPath);
const hash = createHash("sha256").update(xpi).digest("hex");
const repositoryURL = String(packageJSON.repository.url).replace(/^git\+/, "").replace(/\.git$/, "");
const zotero = manifest.applications.zotero;
const updateManifest = {
  addons: {
    [zotero.id]: {
      updates: [
        {
          version,
          update_link: `${repositoryURL}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(path.basename(xpiPath))}`,
          update_hash: `sha256:${hash}`,
          applications: {
            zotero: {
              strict_min_version: zotero.strict_min_version,
              strict_max_version: zotero.strict_max_version,
            },
          },
        },
      ],
    },
  },
};

await writeFile(outputPath, `${JSON.stringify(updateManifest, null, 2)}\n`, "utf8");
console.log(`Updated ${outputPath} for ${tag} (${hash}).`);

function getArgument(name) {
  const value = getOptionalArgument(name);
  if (!value) throw new Error(`Missing required argument ${name}.`);
  return value;
}

function getOptionalArgument(name) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : "";
  return value;
}
