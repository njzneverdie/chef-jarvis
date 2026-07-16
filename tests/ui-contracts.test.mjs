import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
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

test("meal generation exposes progress and has a bounded client wait", async () => {
  const [app, chefMode] = await Promise.all([
    readFile(new URL("app.js", publicUrl), "utf8"),
    readFile(new URL("chef-mode.js", publicUrl), "utf8"),
  ]);
  assert.match(app, /id="generation-status"/);
  assert.match(app, /詳細食譜可能需要約 30 秒/);
  assert.match(chefMode, /const timeout = setTimeout\(\(\) => controller\.abort\(\), 50000\)/);
  assert.match(chefMode, /食譜產生時間過久，請再試一次。/);
});

test("async form and shopping handlers retain their DOM targets before await", async () => {
  const [app, chefMode] = await Promise.all([
    readFile(new URL("app.js", publicUrl), "utf8"),
    readFile(new URL("chef-mode.js", publicUrl), "utf8"),
  ]);
  assert.match(app, /#pantry-form"\)\.onsubmit = async \(event\) => \{[\s\S]*const form = event\.currentTarget;[\s\S]*form\.reset\(\)/);
  assert.match(chefMode, /const checkbox = event\.currentTarget;[\s\S]*checkbox\.dataset\.listItem/);
  assert.match(chefMode, /button\.onclick = async \(\) => \{[\s\S]*button\.dataset\.stockList/);
  assert.match(chefMode, /button\.onclick = async \(\) => \{[\s\S]*button\.dataset\.deleteList/);
});

test("empty saved recipes clear cache and app icons revalidate online", async () => {
  const [chefMode, worker] = await Promise.all([
    readFile(new URL("chef-mode.js", publicUrl), "utf8"),
    readFile(new URL("sw.js", publicUrl), "utf8"),
  ]);
  assert.match(chefMode, /if \(!error && cacheKey\)[\s\S]*JSON\.stringify\(data \|\| \[\]\)/);
  assert.match(worker, /const isAppIcon/);
  assert.match(worker, /if \(isAppIcon\)[\s\S]*fetch\(request\)[\s\S]*cache\.put\(request, copy\)/);
});

test("meal feedback accepts more servings than the recipe made", async () => {
  const chefMode = await readFile(new URL("chef-mode.js", publicUrl), "utf8");
  assert.match(chefMode, /const servingsLimit = 12/);
  assert.doesNotMatch(chefMode, /Math\.min\(recipeServings,/);
});

test("PWA install keeps large icons on demand and self-hosts compact fonts", async () => {
  const [worker, index, styles, icon] = await Promise.all([
    readFile(new URL("sw.js", publicUrl), "utf8"),
    readFile(new URL("index.html", publicUrl), "utf8"),
    readFile(new URL("styles.css", publicUrl), "utf8"),
    stat(new URL("chef-jarvis-icon-1024.png", publicUrl)),
  ]);
  const core = worker.slice(worker.indexOf("const CORE"), worker.indexOf("];", worker.indexOf("const CORE")));
  assert.doesNotMatch(core, /chef-jarvis-icon-(?:512|1024)\.png/);
  assert.doesNotMatch(core, /chef-jarvis-maskable-512\.png/);
  assert.match(worker, /Promise\.allSettled/);
  assert.ok(icon.size < 100 * 1024, `1024px icon is ${icon.size} bytes`);
  assert.doesNotMatch(index, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
  assert.match(styles, /fonts\/manrope-latin-400-800\.woff2/);
  assert.match(worker, /fonts\/dm-serif-display-latin-400\.woff2/);
});

test("signed-in shell lazily renders views beyond the home dashboard", async () => {
  const app = await readFile(new URL("app.js", publicUrl), "utf8");
  const shell = app.slice(app.indexOf("function shell()"), app.indexOf("function show("));
  assert.match(shell, /restoreCookingState\(\);[\s\S]*renderHome\(\);/);
  assert.doesNotMatch(shell, /renderPlan\(|renderPantry\(|renderShoppingLists\(|renderWeeklyPlanner\(|renderCook\(|renderProfile\(/);
  assert.match(app, /async function ensureViewRendered/);
  assert.match(app, /if \(id === "shopping"\) return renderShoppingLists\(\)/);
});

test("meal images overlap model generation and primary failure fails over quickly", async () => {
  const edge = await readFile(
    new URL("../supabase/functions/chef-meal-plan/index.ts", import.meta.url),
    "utf8",
  );
  const imageStart = edge.indexOf("const recipeImagePromise = findRecipeImage(meal)");
  const modelStart = edge.indexOf("const modelAttempts =");
  assert.ok(imageStart >= 0 && imageStart < modelStart);
  assert.match(edge, /gemini-3\.1-flash-lite", timeoutMs: 12000/);
  assert.match(edge, /addRecipeImage\(validatedPlan, recipeImagePromise\)/);
});

test("timer ticker sleeps when idle and updates existing nodes between structural renders", async () => {
  const chefMode = await readFile(new URL("chef-mode.js", publicUrl), "utf8");
  assert.match(chefMode, /function syncTimerTicker\(\)[\s\S]*if \(!hasRunningTimer\(\)\)[\s\S]*stopTimerTicker\(\)/);
  assert.match(chefMode, /timerTickInterval = setInterval\(tickRunningTimers, 250\)/);
  assert.match(chefMode, /function tickRunningTimers\(\)[\s\S]*updateTimerDisplays\(\)/);
  assert.match(chefMode, /now - lastTimerPersistAt >= 5000/);
  assert.doesNotMatch(chefMode, /setInterval\(\(\) => \{\s*const now = Date\.now\(\)/);
});
