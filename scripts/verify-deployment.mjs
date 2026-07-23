import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { discoverReleasePublicFiles } from "./release-public-assets.mjs";

const rootUrl = new URL("../", import.meta.url);
const publicUrl = new URL("../public/", import.meta.url);
const productionUrl = (
  process.env.CHEF_PRODUCTION_URL || "https://chef-jarvis.pages.dev"
).replace(/\/+$/, "");
const functionsUrl = (
  process.env.CHEF_FUNCTIONS_URL ||
  "https://mylcykwmwlnjlclodmuo.supabase.co/functions/v1"
).replace(/\/+$/, "");
const publicFiles = await discoverReleasePublicFiles(publicUrl);
const edgeFunctions = [
  "chef-meal-plan",
  "chef-usda-nutrition",
  "chef-delete-account",
];
const versionHeader = "x-chef-jarvis-function-version";
const requiredMealPlanVersion = "2026-07-23.multi-dish-menu.22";

const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");

async function fetchChecked(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response;
}

async function verifyPublicFile(file) {
  const local = await readFile(new URL(file, publicUrl));
  const deployedPath = file.split("/").map(encodeURIComponent).join("/");
  const response = await fetchChecked(
    `${productionUrl}/${deployedPath}?deployment-check=${Date.now()}`,
  );
  const remote = Buffer.from(await response.arrayBuffer());
  const localHash = sha256(local);
  const remoteHash = sha256(remote);
  if (localHash !== remoteHash) {
    throw new Error(
      `${file} differs (local ${localHash.slice(0, 12)}, deployed ${remoteHash.slice(0, 12)})`,
    );
  }
  return `${file} ${localHash.slice(0, 12)}`;
}

async function localFunctionVersion(name) {
  const source = await readFile(
    new URL(`supabase/functions/${name}/index.ts`, rootUrl),
    "utf8",
  );
  const match = source.match(/const FUNCTION_VERSION = "([^"]+)"/);
  if (!match) throw new Error(`${name} has no local FUNCTION_VERSION`);
  return match[1];
}

async function verifyEdgeFunction(name) {
  const expected = await localFunctionVersion(name);
  if (name === "chef-meal-plan" && expected !== requiredMealPlanVersion) {
    throw new Error(
      `${name} must be the multi-dish release ${requiredMealPlanVersion}, not ${expected}`,
    );
  }
  const response = await fetchChecked(`${functionsUrl}/${name}`, {
    method: "OPTIONS",
    headers: { Origin: productionUrl },
  });
  const deployed = response.headers.get(versionHeader);
  if (!deployed) {
    throw new Error(`${name} returned no ${versionHeader} header`);
  }
  if (deployed !== expected) {
    throw new Error(
      `${name} differs (local ${expected}, deployed ${deployed})`,
    );
  }
  return `${name} ${deployed}`;
}

const checks = [
  ...publicFiles.map((file) => ({
    label: `public/${file}`,
    run: () => verifyPublicFile(file),
  })),
  ...edgeFunctions.map((name) => ({
    label: `edge/${name}`,
    run: () => verifyEdgeFunction(name),
  })),
];
const results = await Promise.allSettled(checks.map((check) => check.run()));
let failed = false;
results.forEach((result, index) => {
  if (result.status === "fulfilled") {
    console.log(`✓ ${result.value}`);
    return;
  }
  failed = true;
  console.error(`✗ ${checks[index].label}: ${result.reason.message}`);
});
if (failed) process.exitCode = 1;
