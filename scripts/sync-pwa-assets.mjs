import { readFile, writeFile } from "node:fs/promises";

const indexPath = new URL("../public/index.html", import.meta.url);
const workerPath = new URL("../public/sw.js", import.meta.url);
let index = await readFile(indexPath, "utf8");
let worker = await readFile(workerPath, "utf8");
const currentVersion = index.match(/\?v=([^"']+)/)?.[1];
const requestedVersion = process.argv[2];
const version =
  !requestedVersion || requestedVersion === "--check"
    ? currentVersion
    : requestedVersion.replace(/[^a-zA-Z0-9._-]/g, "-");
if (!version) throw new Error("No asset version was found.");

if (requestedVersion && requestedVersion !== "--check") {
  index = index.replace(/\?v=[^"']+/g, `?v=${version}`);
  worker = worker
    .replace(
      /const CACHE = "[^"]+";/,
      `const CACHE = "chef-jarvis-${version}";`,
    )
    .replace(/\?v=[^"']+/g, `?v=${version}`);
  await Promise.all([
    writeFile(indexPath, index),
    writeFile(workerPath, worker),
  ]);
}

const assets = [...index.matchAll(/["'](\/[^"']+\?v=[^"']+)["']/g)].map(
  ([, asset]) => asset,
);
if (!worker.includes(`const CACHE = "chef-jarvis-${version}";`))
  throw new Error("Service worker cache version is out of sync.");
const missing = assets.filter((asset) => !worker.includes(`"${asset}"`));
if (missing.length)
  throw new Error(`Service worker CORE is missing: ${missing.join(", ")}`);
console.log(`PWA assets synchronized at ${version} (${assets.length} files).`);
