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
  assert.match(worker, /if \(failed\.length\)[\s\S]*caches\.delete\(CACHE\)[\s\S]*throw new Error/);
  assert.match(worker, /await self\.skipWaiting\(\)/);
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

test("meal images use the validated exact dish query and primary failure fails over quickly", async () => {
  const edge = await readFile(
    new URL("../supabase/functions/chef-meal-plan/index.ts", import.meta.url),
    "utf8",
  );
  assert.match(edge, /gemini-3\.1-flash-lite", timeoutMs: 12000/);
  assert.match(edge, /const exactQuery = plan\.image_query \|\| plan\.title/);
  assert.match(edge, /Promise\.all\(queries\.map\(findRecipeImage\)\)/);
  assert.match(edge, /PROMPT_VERSION/);
  assert.match(edge, /chef_meal_plan_completed/);
  assert.match(edge, /addRecipeImage\(validatedPlan\)/);
  assert.doesNotMatch(edge, /findRecipeImage\(meal\)/);
});

test("cooking progress syncs to the user's cloud session with a local fallback", async () => {
  const [chefMode, app, migration] = await Promise.all([
    readFile(new URL("chef-mode.js", publicUrl), "utf8"),
    readFile(new URL("app.js", publicUrl), "utf8"),
    readFile(
      new URL(
        "../supabase/migrations/20260717005304_optimize_active_cooking_sessions.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  assert.match(chefMode, /function queueCookingCloudSync/);
  assert.match(chefMode, /\.from\("cooking_sessions"\)/);
  assert.match(chefMode, /async function restoreCookingStateFromCloud/);
  assert.match(chefMode, /clearCookingState\("completed"\)/);
  assert.match(app, /void restoreCookingStateFromCloud\(\)/);
  assert.match(migration, /cooking_sessions_user_status_updated_idx/);
});

test("profile offers an authenticated JSON data export", async () => {
  const app = await readFile(new URL("app.js", publicUrl), "utf8");
  assert.match(app, /async function exportMyData/);
  assert.match(app, /id="export-my-data"/);
  assert.match(app, /chef-jarvis-data-\$\{localDateKey\(\)\}\.json/);
  assert.match(app, /shopping_list_items\(\*\)/);
  assert.match(app, /meal_plan_items\(\*\)/);
});

test("growing user collections have bounded initial queries", async () => {
  const [app, chefMode] = await Promise.all([
    readFile(new URL("app.js", publicUrl), "utf8"),
    readFile(new URL("chef-mode.js", publicUrl), "utf8"),
  ]);
  assert.match(app, /\.from\("pantry_items"\)[\s\S]*?\.limit\(250\)/);
  assert.match(
    chefMode,
    /async function renderShoppingLists\(\)[\s\S]*?\.limit\(30\)/,
  );
});

test("profile load failures do not open onboarding or overwrite saved data", async () => {
  const app = await readFile(new URL("app.js", publicUrl), "utf8");
  const boot = app.slice(app.indexOf("async function boot()"), app.indexOf("async function startApp()"));
  assert.match(boot, /if \(result\.error\)[\s\S]*return false/);
  assert.match(boot, /if \(!profile\?\.onboarding_completed\) onboarding\(\)/);
  assert.ok(boot.indexOf("return false") < boot.indexOf("onboarding()"));
});

test("dynamic form fields receive programmatic label associations", async () => {
  const app = await readFile(new URL("app.js", publicUrl), "utf8");
  assert.match(app, /function associateFieldLabels/);
  assert.match(app, /label\.htmlFor = control\.id/);
  assert.match(app, /MutationObserver/);
});

test("recipe swaps require and apply replacement-safe step updates", async () => {
  const [chefMode, edge] = await Promise.all([
    readFile(new URL("chef-mode.js", publicUrl), "utf8"),
    readFile(new URL("../supabase/functions/chef-meal-plan/index.ts", import.meta.url), "utf8"),
  ]);
  assert.match(edge, /step_updates/);
  assert.match(edge, /must include updated cooking instructions/);
  assert.match(edge, /must update every step that names the original ingredient/);
  assert.match(edge, /must not retain the original ingredient name/);
  assert.match(edge, /Dropping unsafe ingredient substitution/);
  assert.match(edge, /filter\(\(swap\): swap is Substitution/);
  assert.match(chefMode, /affectedStepIndexes\.some/);
  assert.match(chefMode, /currentPlan\.steps = recipe\.steps/);
  assert.match(chefMode, /cooking steps, and recipe timers were updated together/);
  assert.match(chefMode, /No fully verified swap is available for this plan/);
});

test("saved USDA totals are reused until ingredients change", async () => {
  const chefMode = await readFile(new URL("chef-mode.js", publicUrl), "utf8");
  assert.match(chefMode, /if \(recipe\.usda_nutrition && !force\)/);
  assert.match(chefMode, /renderUsdaReference\(recipe, \{ force: true \}\)/);
});

test("static hosting includes a restrictive security-header policy", async () => {
  const [headers, index, boot, worker] = await Promise.all([
    readFile(new URL("_headers", publicUrl), "utf8"),
    readFile(new URL("index.html", publicUrl), "utf8"),
    readFile(new URL("boot.js", publicUrl), "utf8"),
    readFile(new URL("sw.js", publicUrl), "utf8"),
  ]);
  assert.match(headers, /Content-Security-Policy:/);
  assert.match(headers, /frame-ancestors 'none'/);
  assert.match(headers, /X-Frame-Options: DENY/);
  assert.doesNotMatch(index, /supabase\.min\.js/);
  assert.match(index, /boot\.js/);
  assert.match(boot, /SUPABASE_BUNDLE/);
  assert.match(boot, /vendor\/supabase-2\.110\.5\.min\.js/);
  assert.doesNotMatch(boot, /cdn\.jsdelivr\.net|unpkg\.com/);
  assert.match(boot, /if \(!window\.supabase\?\.createClient\)/);
  assert.match(boot, /showStartupError/);
  assert.doesNotMatch(worker, /SUPABASE_CDN/);
  assert.match(worker, /vendor\/supabase-2\.110\.5\.min\.js/);
});

test("timer ticker sleeps when idle and updates existing nodes between structural renders", async () => {
  const chefMode = await readFile(new URL("chef-mode.js", publicUrl), "utf8");
  assert.match(chefMode, /function syncTimerTicker\(\)[\s\S]*if \(!hasRunningTimer\(\)\)[\s\S]*stopTimerTicker\(\)/);
  assert.match(chefMode, /timerTickInterval = setInterval\(tickRunningTimers, 250\)/);
  assert.match(chefMode, /function tickRunningTimers\(\)[\s\S]*updateTimerDisplays\(\)/);
  assert.match(chefMode, /now - lastTimerPersistAt >= 5000/);
  assert.doesNotMatch(chefMode, /setInterval\(\(\) => \{\s*const now = Date\.now\(\)/);
});
