import { readFile, writeFile } from "node:fs/promises";

const indexPath = new URL("../public/index.html", import.meta.url);
const bootPath = new URL("../public/boot.js", import.meta.url);
const workerPath = new URL("../public/sw.js", import.meta.url);
const manifestPath = new URL("../public/manifest.webmanifest", import.meta.url);
let index = await readFile(indexPath, "utf8");
let boot = await readFile(bootPath, "utf8");
let worker = await readFile(workerPath, "utf8");
let manifest = await readFile(manifestPath, "utf8");
const currentVersion = index.match(/\?v=([^"']+)/)?.[1];
const requestedVersion = process.argv[2];
const version =
  !requestedVersion || requestedVersion === "--check"
    ? currentVersion
    : requestedVersion.replace(/[^a-zA-Z0-9._-]/g, "-");
if (!version) throw new Error("No asset version was found.");

if (requestedVersion && requestedVersion !== "--check") {
  index = index.replace(/\?v=[^"']+/g, `?v=${version}`);
  boot = boot.replace(
    /const APP_VERSION = "[^"]+";/,
    `const APP_VERSION = "${version}";`,
  );
  worker = worker
    .replace(
      /const CACHE = "[^"]+";/,
      `const CACHE = "chef-jarvis-${version}";`,
    )
    .replace(/\?v=[^"']+/g, `?v=${version}`);
  manifest = manifest.replace(/\?v=[^"']+/g, `?v=${version}`);
  await Promise.all([
    writeFile(indexPath, index),
    writeFile(bootPath, boot),
    writeFile(workerPath, worker),
    writeFile(manifestPath, manifest),
  ]);
}

const assets = [...index.matchAll(/["'](\/[^"']+\?v=[^"']+)["']/g)].map(
  ([, asset]) => asset,
);
if (!worker.includes(`const CACHE = "chef-jarvis-${version}";`))
  throw new Error("Service worker cache version is out of sync.");
if (!boot.includes(`const APP_VERSION = "${version}";`))
  throw new Error("Boot script version is out of sync.");
const missing = assets.filter((asset) => !worker.includes(`"${asset}"`));
if (missing.length)
  throw new Error(`Service worker CORE is missing: ${missing.join(", ")}`);
const staleManifestIcons = [...manifest.matchAll(/"src":\s*"([^"]+\.png(?:\?v=([^"]+))?)"/g)]
  .filter(([, , iconVersion]) => iconVersion !== version)
  .map(([, source]) => source);
if (staleManifestIcons.length)
  throw new Error(
    `Manifest icons are missing the current version: ${staleManifestIcons.join(", ")}`,
  );
console.log(`PWA assets synchronized at ${version} (${assets.length} files).`);
