import { build } from "esbuild";
import archiver from "archiver";
import { createWriteStream } from "node:fs";
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = path.join(root, "build");
const addonDir = path.join(buildDir, "addon");

if (process.argv.includes("--clean")) {
  await rm(buildDir, { recursive: true, force: true });
  process.exit(0);
}

await rm(buildDir, { recursive: true, force: true });
await mkdir(path.join(addonDir, "content"), { recursive: true });
await cp(path.join(root, "addon"), addonDir, { recursive: true });

await build({
  absWorkingDir: root,
  entryPoints: ["./src/index.ts"],
  outfile: "./build/addon/content/index.js",
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "firefox140",
  sourcemap: false,
  legalComments: "none",
});

const xpiPath = path.join(buildDir, "zotero-scholar-assistant-1.3.0.xpi");
await new Promise((resolve, reject) => {
  const output = createWriteStream(xpiPath);
  const archive = archiver("zip", { zlib: { level: 9 } });
  output.on("close", resolve);
  output.on("error", reject);
  archive.on("error", reject);
  archive.pipe(output);
  archive.directory(addonDir, false);
  archive.finalize();
});

console.log(`Built ${xpiPath}`);
