import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const publicUrl = new URL("../public/", import.meta.url);

test("manual quick log intercepts submit before saved recipes finish loading", async () => {
  const source = await readFile(new URL("chef-mode.js", publicUrl), "utf8");
  const manualHandler = source.indexOf("manualForm.onsubmit = async");
  const savedRecipeQuery = source.indexOf("const { data: rows, error } = await sb");
  assert.ok(manualHandler >= 0);
  assert.ok(savedRecipeQuery >= 0);
  assert.ok(manualHandler < savedRecipeQuery);
});

test("starting another recipe uses the active-cooking confirmation guard", async () => {
  const source = await readFile(new URL("chef-mode.js", publicUrl), "utf8");
  assert.match(source, /async function beginGuidedCooking/);
  assert.match(source, /hasCookingProgress\(\)/);
  assert.match(source, /Replace the current cooking session\?/);
  assert.match(
    source,
    /beginGuidedCooking\(recipe, ingredients, activeRecipeId\)/,
  );
});

test("the install experience includes translated servings and native PNG icons", async () => {
  const [translations, index, manifestText] = await Promise.all([
    readFile(new URL("i18n.js", publicUrl), "utf8"),
    readFile(new URL("index.html", publicUrl), "utf8"),
    readFile(new URL("manifest.webmanifest", publicUrl), "utf8"),
  ]);
  assert.match(translations, /"Servings eaten": "實際食用份數"/);
  assert.match(index, /rel="apple-touch-icon"[^>]+apple-touch-icon\.png/);
  const manifest = JSON.parse(manifestText);
  assert.ok(
    manifest.icons.some(
      (icon) =>
        icon.type === "image/png" &&
        icon.sizes === "512x512" &&
        icon.purpose === "maskable",
    ),
  );
});
