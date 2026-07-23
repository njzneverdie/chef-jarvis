import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { discoverReleasePublicFiles } from "../scripts/release-public-assets.mjs";

const rootUrl = new URL("../", import.meta.url);

async function listPublicFiles(directoryUrl, prefix = "") {
  const entries = await readdir(directoryUrl, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === "_headers") continue;
    const relative = `${prefix}${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...await listPublicFiles(new URL(`${entry.name}/`, directoryUrl), `${relative}/`));
    } else if (entry.isFile()) {
      files.push(relative);
    }
  }
  return files.sort();
}

test("release asset discovery covers every deployed public file and critical shell asset", async () => {
  const publicUrl = new URL("public/", rootUrl);
  const expected = await listPublicFiles(publicUrl);
  const discovered = await discoverReleasePublicFiles(publicUrl);

  assert.deepEqual(discovered, expected);
  for (const file of [
    "index.html",
    "manifest.webmanifest",
    "sw.js",
    "i18n.js",
    "boot.js",
    "domain.js",
    "app.js",
    "chef-mode.js",
    "styles.css",
    "guided-cooking.css",
    "chef-mode.css",
    "shopping-list.css",
    "product-features.css",
    "chef-jarvis-app-icon-v2-192.png",
    "chef-jarvis-app-icon-v2-512.png",
    "chef-jarvis-app-icon-v2-1024.png",
    "chef-jarvis-app-icon-v2-maskable-512.png",
    "chef-jarvis-app-icon-v2-apple-180.png",
  ]) {
    assert.ok(discovered.includes(file), `${file} must be release verified`);
  }
});

test("deployment verifier compares public hashes and Edge versions", async () => {
  const [mealPlan, usda, deletion, verifier, packageJson] = await Promise.all([
    readFile(
      new URL("supabase/functions/chef-meal-plan/index.ts", rootUrl),
      "utf8",
    ),
    readFile(
      new URL("supabase/functions/chef-usda-nutrition/index.ts", rootUrl),
      "utf8",
    ),
    readFile(
      new URL("supabase/functions/chef-delete-account/index.ts", rootUrl),
      "utf8",
    ),
    readFile(new URL("scripts/verify-deployment.mjs", rootUrl), "utf8"),
    readFile(new URL("package.json", rootUrl), "utf8"),
  ]);

  for (const source of [mealPlan, usda, deletion]) {
    assert.match(source, /const FUNCTION_VERSION = "[^"]+"/);
    assert.match(source, /"X-Chef-Jarvis-Function-Version": FUNCTION_VERSION/);
    assert.match(source, /method === "OPTIONS"/);
  }
  assert.match(verifier, /discoverReleasePublicFiles\(publicUrl\)/);
  assert.doesNotMatch(verifier, /const publicFiles = \[[^\]]/);
  assert.match(verifier, /createHash\("sha256"\)/);
  assert.match(verifier, /method:\s*"OPTIONS"/);
  assert.match(verifier, /x-chef-jarvis-function-version/i);
  assert.match(
    verifier,
    /const requiredMealPlanVersion = "2026-07-23\.named-recipe\.23"/,
  );
  assert.match(
    verifier,
    /name === "chef-meal-plan" && expected !== requiredMealPlanVersion/,
  );
  assert.match(
    mealPlan,
    /const FUNCTION_VERSION = "2026-07-23\.named-recipe\.23"/,
  );
  assert.equal(
    JSON.parse(packageJson).scripts["verify:deployment"],
    "node scripts/verify-deployment.mjs",
  );
  assert.equal(
    JSON.parse(packageJson).scripts["test:e2e"],
    "node ./node_modules/@playwright/test/cli.js test",
  );
});
