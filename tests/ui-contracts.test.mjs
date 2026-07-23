import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const publicUrl = new URL("../public/", import.meta.url);

function functionSource(source, declaration) {
  const start = source.indexOf(declaration);
  assert.ok(start >= 0, `Missing ${declaration}`);
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not parse ${declaration}`);
}

test("named recipe clarification does not render or persist a plan", async () => {
  const [app, chefMode] = await Promise.all([
    readFile(new URL("app.js", publicUrl), "utf8"),
    readFile(new URL("chef-mode.js", publicUrl), "utf8"),
  ]);
  assert.match(chefMode, /kind: "clarification"/);
  assert.match(app, /function renderDishClarification/);
  assert.match(app, /data-dish-candidate/);
  assert.match(app, /requestSubmit\(\)/);

  const clarification = chefMode.indexOf("data.clarification_required");
  const persistence = chefMode.indexOf("async function persistGeneratedPlan");
  assert.ok(clarification >= 0, "clarification must be recognized");
  assert.ok(persistence >= 0, "plans must have a dedicated persistence path");
  assert.ok(
    clarification < persistence,
    "clarifications must return before the plan persistence path is reached",
  );
});

test("multi-dish responses render independent recipe cards, including partial failures", async () => {
  const [app, chefMode] = await Promise.all([
    readFile(new URL("app.js", publicUrl), "utf8"),
    readFile(new URL("chef-mode.js", publicUrl), "utf8"),
  ]);
  const generate = functionSource(chefMode, "async function generatePlan");
  const renderMenu = functionSource(
    chefMode,
    "function renderMenuPlanCards",
  );
  assert.match(generate, /data\.request_type === "menu"/);
  assert.ok(
    generate.indexOf('data.request_type === "menu"') <
      generate.indexOf("if (!response.ok)"),
    "a 503 all-unavailable menu still needs its per-dish cards",
  );
  assert.match(generate, /kind: "menu"/);
  assert.match(renderMenu, /item\.status === "ready"/);
  assert.match(renderMenu, /item\.status === "clarification_required"/);
  assert.match(renderMenu, /data-menu-open/);
  assert.match(renderMenu, /data-menu-cook/);
  assert.match(renderMenu, /data-menu-shopping/);
  assert.match(renderMenu, /data-menu-retry/);
  assert.match(app, /result\.kind === "menu"/);
  assert.match(app, /renderMenuPlanCards\(result\)/);
});

test("external recipes show provenance and obey persistence policy", async () => {
  const chefMode = await readFile(new URL("chef-mode.js", publicUrl), "utf8");
  assert.match(chefMode, /recipe-source-note/);
  assert.match(chefMode, /source_type === "adapted"/);
  assert.match(chefMode, /source_url/);
  assert.match(chefMode, /source_persistence === "session_only"/);
  assert.match(chefMode, /rel="noopener noreferrer"/);

  const persistence = chefMode.slice(
    chefMode.indexOf("async function persistGeneratedPlan"),
    chefMode.indexOf("function recipeNutritionPerServing"),
  );
  assert.ok(
    persistence.indexOf('plan.source_persistence === "session_only"') <
      persistence.indexOf('.insert('),
    "session-only recipes must exit before any recipes insert call",
  );
});

test("session-only persistence makes no recipes insert call", async () => {
  const chefMode = await readFile(new URL("chef-mode.js", publicUrl), "utf8");
  const persist = new Function(
    "sb",
    "user",
    "finiteNumber",
    "toast",
    "window",
    "assertGenerationContext",
    `return ${functionSource(chefMode, "async function persistGeneratedPlan")};`,
  )(
    {
      from() {
        throw new Error("session-only plans must not reach Supabase");
      },
    },
    { id: "user-1" },
    Number,
    () => {},
    { I18n: { translate: (value) => value } },
    () => {},
  );
  const plan = { source_persistence: "session_only", title: "Example" };
  const result = await persist(plan, "Example", "user-1", 1);
  assert.equal(result, plan);
  assert.equal(result.is_saved, false);
  assert.equal(result.saved_recipe_id, null);
  assert.equal(
    result.persistence_notice,
    "This sourced recipe is available in this session and was not stored.",
  );
});

test("ephemeral Chef Mode progress stays in memory while saved recipes retain guarded sync", async () => {
  const [chefMode, i18n] = await Promise.all([
    readFile(new URL("chef-mode.js", publicUrl), "utf8"),
    readFile(new URL("i18n.js", publicUrl), "utf8"),
  ]);

  assert.match(chefMode, /function isEphemeralRecipe\(recipe\)/);
  assert.match(
    chefMode,
    /source_persistence === "session_only"[\s\S]*saved_recipe_id[\s\S]*recipe\.id/,
  );
  assert.match(chefMode, /if \(isEphemeralRecipe\(activeRecipe\)\) \{/);
  assert.match(chefMode, /isEphemeralRecipe\(saved\.activeRecipe\)/);
  assert.match(chefMode, /isEphemeralRecipe\(remote\.activeRecipe\)/);
  assert.match(chefMode, /let cookingSessionOwnerId/);
  assert.match(chefMode, /const pendingCookingControllers = new Set\(\)/);
  assert.match(chefMode, /pendingCookingControllers\.forEach\(\(controller\) => controller\.abort\(\)\)/);
  assert.match(chefMode, /function assertCookingContext\(ownerUserId, expectedEpoch\)/);
  assert.match(chefMode, /const syncEpoch = chefStateEpoch/);
  assert.match(chefMode, /cookingSessionOwnerId === ownerId/);
  assert.match(chefMode, /\.abortSignal\(controller\.signal\)/);
  assert.match(
    chefMode,
    /Only real cooking and waiting times become recipe countdowns\. Your progress survives a refresh\./,
  );
  assert.match(
    chefMode,
    /This Chef Mode progress is available only in this tab and is lost on refresh\./,
  );
  assert.match(
    i18n,
    /Until you select Cook later, this plan stays only in this browser session and is lost on refresh\./,
  );
  assert.match(
    i18n,
    /This Chef Mode progress is available only in this tab and is lost on refresh\./,
  );
});

test("named recipe unavailability preserves the server message for retry", async () => {
  const [app, chefMode, i18n] = await Promise.all([
    readFile(new URL("app.js", publicUrl), "utf8"),
    readFile(new URL("chef-mode.js", publicUrl), "utf8"),
    readFile(new URL("i18n.js", publicUrl), "utf8"),
  ]);
  assert.match(chefMode, /error\.code = data\.code/);
  assert.match(app, /toast\(error\.message/);
  assert.match(i18n, /目前無法取得「\{dish\}」的完整食譜，請稍後再試。/);
});

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
    /beginGuidedCooking\(\s*recipe,\s*ingredients,\s*currentPlanRecipeId/,
  );
});

test("the install experience uses the cache-refreshed app icon family", async () => {
  const [translations, index, manifestText, worker] = await Promise.all([
    readFile(new URL("i18n.js", publicUrl), "utf8"),
    readFile(new URL("index.html", publicUrl), "utf8"),
    readFile(new URL("manifest.webmanifest", publicUrl), "utf8"),
    readFile(new URL("sw.js", publicUrl), "utf8"),
  ]);
  const version = "20260723-multi-dish-menu-1";
  const expected = [
    ["chef-jarvis-app-icon-v2-192.png", 192, "any"],
    ["chef-jarvis-app-icon-v2-1024.png", 1024, "any"],
    ["chef-jarvis-app-icon-v2-512.png", 512, "any"],
    ["chef-jarvis-app-icon-v2-maskable-512.png", 512, "maskable"],
  ];

  assert.match(translations, /"Servings eaten": "實際食用份數"/);
  assert.match(
    index,
    new RegExp(
      `rel="icon"[^>]+chef-jarvis-app-icon-v2-192\\.png\\?v=${version}`,
    ),
  );
  assert.match(
    index,
    new RegExp(
      `rel="apple-touch-icon"[^>]+chef-jarvis-app-icon-v2-apple-180\\.png\\?v=${version}`,
    ),
  );

  const manifest = JSON.parse(manifestText);
  assert.deepEqual(
    manifest.icons.map((icon) => [
      icon.src,
      icon.sizes,
      icon.type,
      icon.purpose,
    ]),
    expected.map(([name, size, purpose]) => [
      `/${name}?v=${version}`,
      `${size}x${size}`,
      "image/png",
      purpose,
    ]),
  );

  for (const [name, size] of [
    ...expected.map(([name, size]) => [name, size]),
    ["chef-jarvis-app-icon-v2-apple-180.png", 180],
  ]) {
    const png = await readFile(new URL(name, publicUrl));
    assert.equal(png.toString("ascii", 1, 4), "PNG");
    assert.equal(png.readUInt32BE(16), size, `${name} width`);
    assert.equal(png.readUInt32BE(20), size, `${name} height`);
  }

  const references = `${index}\n${manifestText}\n${worker}`;
  assert.doesNotMatch(
    references,
    /(?:chef-jarvis-icon-(?:192|512|1024)|chef-jarvis-maskable-512|apple-touch-icon)\.png/,
  );

  for (const legacy of [
    "chef-jarvis-icon-192.png",
    "chef-jarvis-icon-512.png",
    "chef-jarvis-icon-1024.png",
    "chef-jarvis-maskable-512.png",
    "apple-touch-icon.png",
  ]) {
    assert.ok((await stat(new URL(legacy, publicUrl))).isFile());
  }
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

test("named recipe failures retain only safe server diagnostics for support", async () => {
  const [app, chefMode] = await Promise.all([
    readFile(new URL("app.js", publicUrl), "utf8"),
    readFile(new URL("chef-mode.js", publicUrl), "utf8"),
  ]);
  assert.match(chefMode, /error\.meta = \{[\s\S]*request_id:[\s\S]*outcome:[\s\S]*duration_ms:[\s\S]*failure_stage:[\s\S]*failure_reason:/);
  assert.match(app, /panel\.dataset\.requestId = String\(error\.meta\.request_id/);
  assert.match(app, /panel\.dataset\.outcome = String\(error\.meta\.outcome/);
  assert.match(app, /panel\.dataset\.durationMs = String\(error\.meta\.duration_ms/);
  assert.match(app, /panel\.dataset\.failureStage = String\(error\.meta\.failure_stage/);
  assert.match(app, /panel\.dataset\.failureReason = String\(error\.meta\.failure_reason/);
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
    stat(new URL("chef-jarvis-app-icon-v2-1024.png", publicUrl)),
  ]);
  const core = worker.slice(worker.indexOf("const CORE"), worker.indexOf("];", worker.indexOf("const CORE")));
  assert.doesNotMatch(
    core,
    /chef-jarvis-app-icon-v2-(?:512|1024|maskable-512)\.png/,
  );
  assert.match(worker, /Promise\.allSettled/);
  assert.match(worker, /if \(failed\.length\)[\s\S]*caches\.delete\(CACHE\)[\s\S]*throw new Error/);
  assert.match(worker, /await self\.skipWaiting\(\)/);
  assert.ok(icon.size < 100 * 1024, `1024px icon is ${icon.size} bytes`);
  assert.doesNotMatch(index, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
  assert.match(styles, /fonts\/manrope-latin-400-800\.woff2/);
  assert.match(worker, /fonts\/dm-serif-display-latin-400\.woff2/);
});

test("PWA version sync also updates the dynamic boot loader", async () => {
  const [index, boot, worker, syncScript] = await Promise.all([
    readFile(new URL("index.html", publicUrl), "utf8"),
    readFile(new URL("boot.js", publicUrl), "utf8"),
    readFile(new URL("sw.js", publicUrl), "utf8"),
    readFile(
      new URL("../scripts/sync-pwa-assets.mjs", import.meta.url),
      "utf8",
    ),
  ]);
  const version = index.match(/\?v=([^"']+)/)?.[1];
  assert.ok(version);
  assert.match(boot, new RegExp(`const APP_VERSION = "${version}"`));
  assert.match(worker, new RegExp(`chef-jarvis-${version}`));
  assert.match(syncScript, /const bootPath/);
  assert.match(syncScript, /Boot script version is out of sync/);
});

test("generated meals use a selectable ingredient gallery and scannable step cards", async () => {
  const [chefMode, ingredientCss, guidedCss] = await Promise.all([
    readFile(new URL("chef-mode.js", publicUrl), "utf8"),
    readFile(new URL("shopping-list.css", publicUrl), "utf8"),
    readFile(new URL("guided-cooking.css", publicUrl), "utf8"),
  ]);
  assert.match(chefMode, /function ingredientVisual/);
  assert.match(chefMode, /ingredient-card-grid/);
  assert.match(chefMode, /data-ingredient-index/);
  assert.match(chefMode, /function renderRecipeStepCards/);
  assert.match(chefMode, /Review ingredients ↓/);
  assert.match(ingredientCss, /grid-template-columns: repeat\(5/);
  assert.match(ingredientCss, /label:not\(\.selected\)/);
  assert.match(guidedCss, /recipe-showcase/);
  assert.match(guidedCss, /grid-auto-flow: column/);
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
  const [edge, chefMode] = await Promise.all([
    readFile(
      new URL("../supabase/functions/chef-meal-plan/index.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("chef-mode.js", publicUrl), "utf8"),
  ]);
  assert.match(edge, /gemini-3\.1-flash-lite", timeoutMs: 12000/);
  assert.match(edge, /recipeImageQueryPlan/);
  assert.match(edge, /imageCandidateMatchesFamily/);
  assert.match(
    edge,
    /candidates\.map\(\(candidate\) =>[\s\S]*findRecipeImage\(candidate\.query, family, candidate\.match_kind\)/,
  );
  assert.match(edge, /PROMPT_VERSION/);
  assert.match(edge, /chef_meal_plan_completed/);
  assert.match(edge, /attachCuratedRecipeImage\(validatedPlan, meal\)/);
  assert.doesNotMatch(edge, /findRecipeImage\(meal\)/);
  assert.match(edge, /imageCandidateLooksPhotographic/);
  assert.match(edge, /curatedImage \|\|[\s\S]*images\.find\(Boolean\)/);
  assert.match(chefMode, /ChefDomain\.curatedRecipeImage\(recipe\)/);
  assert.doesNotMatch(chefMode, /recipe-visual-symbols/);
});

test("broad meal prompts use recent-history deduplication and rotating fallbacks", async () => {
  const edge = await readFile(
    new URL("../supabase/functions/chef-meal-plan/index.ts", import.meta.url),
    "utf8",
  );
  assert.match(edge, /\.from\("recipes"\)[\s\S]*\.limit\(12\)/);
  assert.match(
    edge,
    /recipeContextPromptEnvelope\(\{[\s\S]*recentMeals,[\s\S]*\}\)/,
  );
  assert.match(edge, /recipeVarietyRejectionReason/);
  assert.match(edge, /generationConfig: recipeGenerationConfig\(0\.55\)/);
  assert.match(edge, /selectLeastRecentFallback/);
  assert.match(edge, /Lemon paprika chicken quinoa skillet/);
  assert.match(edge, /Ginger beef broccoli skillet/);
  assert.match(edge, /Turkey white bean tomato skillet/);
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

test("ephemeral cooking sessions never reach local or cloud persistence", async () => {
  const chefMode = await readFile(new URL("chef-mode.js", publicUrl), "utf8");
  const persist = functionSource(chefMode, "function persistCookingState");
  const cloud = functionSource(chefMode, "function queueCookingCloudSync");
  const restore = functionSource(chefMode, "function restoreCookingState");
  const restoreCloud = functionSource(
    chefMode,
    "async function restoreCookingStateFromCloud",
  );

  assert.match(persist, /isEphemeralRecipe\(activeRecipe\)/);
  assert.match(cloud, /isEphemeralRecipe\(activeRecipe\)/);
  assert.match(restore, /isEphemeralRecipe\(saved\.activeRecipe\)/);
  assert.match(restoreCloud, /isEphemeralRecipe\(remote\.activeRecipe\)/);
  assert.ok(
    persist.indexOf("isEphemeralRecipe(activeRecipe)") <
      persist.indexOf("localStorage.setItem"),
  );
  assert.ok(
    cloud.indexOf("isEphemeralRecipe(activeRecipe)") <
      cloud.indexOf('.from("cooking_sessions")'),
  );
});

test("provider images accept TheMealDB and reject arbitrary hosts", async () => {
  const chefMode = await readFile(new URL("chef-mode.js", publicUrl), "utf8");
  assert.match(chefMode, /\[\s*"wikimedia\.org",\s*"themealdb\.com",\s*\]/);
  assert.match(chefMode, /\[\s*"wikimedia\.org",\s*"themealdb\.com",\s*\]/);
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

test("generation context invalidates in-flight requests across an account reset", async () => {
  const chefMode = await readFile(new URL("chef-mode.js", publicUrl), "utf8");
  assert.match(chefMode, /let chefStateEpoch = 0/);
  assert.match(chefMode, /const pendingGenerationControllers = new Set\(\)/);
  assert.match(chefMode, /function isCurrentGenerationContext\(/);
  assert.match(chefMode, /function assertGenerationContext\(/);

  const isCurrent = new Function(
    `return ${functionSource(chefMode, "function isCurrentGenerationContext")};`,
  )();
  assert.equal(isCurrent("owner-1", 4, "owner-1", 4), true);
  assert.equal(isCurrent("owner-1", 4, "owner-2", 4), false);
  assert.equal(isCurrent("owner-1", 4, "owner-1", 5), false);

  const reset = functionSource(chefMode, "function resetChefModeState");
  assert.match(reset, /chefStateEpoch \+= 1/);
  assert.match(reset, /controller\.abort\(\)/);
  assert.match(reset, /pendingGenerationControllers\.clear\(\)/);
});

test("generation leaves normal plans in memory and explicit Cook later owns inserts", async () => {
  const [app, chefMode] = await Promise.all([
    readFile(new URL("app.js", publicUrl), "utf8"),
    readFile(new URL("chef-mode.js", publicUrl), "utf8"),
  ]);
  const generate = functionSource(chefMode, "async function generatePlan");
  const persist = functionSource(chefMode, "async function persistGeneratedPlan");
  const saveForLater = functionSource(
    chefMode,
    "async function saveGeneratedPlanForLater",
  );
  const controls = functionSource(chefMode, "function renderPlanPersistenceControls");
  assert.match(generate, /const ownerUserId = session\.user\.id/);
  assert.match(generate, /assertGenerationContext\(ownerUserId, generationEpoch\)/);
  assert.doesNotMatch(generate, /persistGeneratedPlan|\.from\("recipes"\)|\.insert\(/);
  assert.match(controls, /if \(!currentPlanRecipeId\)/);
  assert.match(controls, /saveGeneratedPlanForLater\(recipe, currentPlanInstanceId\)/);
  assert.match(saveForLater, /const ownerUserId = session\.user\.id/);
  assert.match(saveForLater, /assertGenerationContext\(ownerUserId, generationEpoch\)/);
  assert.match(
    saveForLater,
    /persistGeneratedPlan\(\s*recipe,\s*recipe\.userRequest \|\| recipe\.title,\s*ownerUserId,\s*generationEpoch,\s*controller\.signal,?\s*\)/,
  );
  assert.match(saveForLater, /pendingPersistenceControllers\.add\(controller\)/);
  assert.match(saveForLater, /pendingPersistenceControllers\.delete\(controller\)/);
  assert.match(persist, /user_id: ownerUserId/);
  assert.match(persist, /app_user_id: ownerUserId/);
  assert.match(persist, /is_saved: true/);
  assert.match(persist, /abortSignal\(signal\)/);
  assert.doesNotMatch(persist, /user\.id/);
  assert.match(app, /error\?\.code === "stale_auth_context"/);
});

test("plan persistence never retargets an unrelated active cooking session", async () => {
  const chefMode = await readFile(new URL("chef-mode.js", publicUrl), "utf8");
  const renderPlan = functionSource(chefMode, "function renderPlan");
  const persist = functionSource(
    chefMode,
    "async function saveGeneratedPlanForLater",
  );
  const controls = functionSource(chefMode, "function renderPlanPersistenceControls");

  assert.match(chefMode, /let currentPlanRecipeId = null/);
  assert.match(chefMode, /let currentPlanInstanceId = null/);
  assert.doesNotMatch(renderPlan, /activeRecipeId\s*=/);
  assert.match(renderPlan, /currentPlanRecipeId\s*=\s*recipe\.saved_recipe_id \|\| null/);
  assert.match(renderPlan, /beginGuidedCooking\(\s*recipe,\s*ingredients,\s*currentPlanRecipeId/);
  assert.match(controls, /\.eq\("id", currentPlanRecipeId\)/);
  assert.match(persist, /currentPlanRecipeId = savedPlan\.saved_recipe_id/);
  assert.match(persist, /activeRecipeInstanceId === planInstanceId/);
  assert.match(persist, /activeRecipeId = savedPlan\.saved_recipe_id/);
  assert.doesNotMatch(persist, /plan_instance_id:\s*savedPlan/);
});

test("cloud cooking restores are invalidated when cooking state changes", async () => {
  const chefMode = await readFile(new URL("chef-mode.js", publicUrl), "utf8");
  const restore = functionSource(
    chefMode,
    "async function restoreCookingStateFromCloud",
  );
  const clear = functionSource(chefMode, "function clearCookingState");
  const begin = functionSource(chefMode, "async function beginGuidedCooking");
  const reset = functionSource(chefMode, "function resetChefModeState");

  assert.match(chefMode, /let cookingStateRevision = 0/);
  assert.match(chefMode, /const pendingCookingRestoreControllers = new Set\(\)/);
  assert.match(restore, /const cookingRevision = cookingStateRevision/);
  assert.match(restore, /assertCookingRestoreContext\(ownerId, syncEpoch, cookingRevision\)/);
  assert.ok((restore.match(/assertCookingRestoreContext/g) || []).length >= 5);
  assert.match(clear, /invalidateCookingRestores\(\)/);
  assert.match(begin, /invalidateCookingRestores\(\)/);
  assert.match(reset, /invalidateCookingRestores\(\)/);
});

test("sign-out copy distinguishes saved and ephemeral cooking progress in both languages", async () => {
  const [app, chefMode, i18n] = await Promise.all([
    readFile(new URL("app.js", publicUrl), "utf8"),
    readFile(new URL("chef-mode.js", publicUrl), "utf8"),
    readFile(new URL("i18n.js", publicUrl), "utf8"),
  ]);
  assert.match(chefMode, /function isCurrentCookingEphemeral\(\)/);
  assert.match(app, /isCurrentCookingEphemeral\(\)/);
  assert.match(app, /I18n\.translate\([\s\S]*"Saved cooking progress will remain available when you sign in again\."/);
  assert.match(app, /I18n\.translate\([\s\S]*"This unsaved cooking progress will be lost when you sign out\."/);
  assert.match(i18n, /"Saved cooking progress will remain available when you sign in again\.":/);
  assert.match(i18n, /"This unsaved cooking progress will be lost when you sign out\.":/);
});

test("session-only recipes remain in-memory across nutrition, reuse, grocery, and completion", async () => {
  const chefMode = await readFile(new URL("chef-mode.js", publicUrl), "utf8");
  const usda = chefMode.slice(
    chefMode.indexOf("async function renderUsdaReference"),
    chefMode.indexOf("async function generatePlan"),
  );
  const checklist = chefMode.slice(
    chefMode.indexOf("function renderShoppingChecklist"),
    chefMode.indexOf("function shoppingListIntegrityReport"),
  );
  const completion = chefMode.slice(
    chefMode.indexOf("async function completeCooking"),
    chefMode.indexOf("function updateVoiceButton"),
  );
  assert.match(usda, /if \(isSessionOnlyRecipe\(recipe\)\)/);
  assert.ok(
    usda.indexOf("isSessionOnlyRecipe(recipe)") < usda.indexOf("fetch("),
    "session-only recipes must return before a USDA fetch",
  );
  assert.match(usda, /This recipe stays in this session/);
  assert.match(checklist, /\{ allowPersistence = true \} = \{\}/);
  assert.match(checklist, /if \(!allowPersistence \|\| !integrity\.safe\) return/);
  assert.match(checklist, /Save to Grocery List unavailable/);
  assert.match(chefMode, /const canSaveReuseIdeas = !isSessionOnlyRecipe\(recipe\)/);
  assert.match(completion, /if \(isSessionOnlyRecipe\(recipe\)\)/);
  assert.ok(
    completion.indexOf("isSessionOnlyRecipe(recipe)") < completion.indexOf("logCompletedMeal"),
    "session-only completion must skip nutrition and feedback persistence",
  );
  const sessionOnlyCompletion = completion.slice(
    completion.indexOf("if (isSessionOnlyRecipe(recipe))"),
    completion.indexOf("const nutritionLogPromise"),
  );
  assert.doesNotMatch(
    sessionOnlyCompletion,
    /deductRecipeFromPantry|sb\.|logCompletedMeal|openMealFeedback/,
    "session-only completion must not change pantry or any database state",
  );
  assert.match(sessionOnlyCompletion, /nothing was saved or changed/i);
});

test("session-only voice tips stay in memory while normal recipes remain per-user", async () => {
  const chefMode = await readFile(new URL("chef-mode.js", publicUrl), "utf8");
  const showTip = functionSource(chefMode, "function shouldShowVoiceTip");
  const dismissTip = functionSource(chefMode, "function dismissVoiceTip");
  const reset = functionSource(chefMode, "function resetChefModeState");

  assert.match(chefMode, /let sessionVoiceTipDismissed = false/);
  assert.match(showTip, /if \(isSessionOnlyRecipe\(recipe\)\) return !sessionVoiceTipDismissed/);
  assert.match(
    dismissTip,
    /if \(isSessionOnlyRecipe\(recipe\)\) \{\s*sessionVoiceTipDismissed = true;\s*return;\s*\}/,
  );
  assert.match(showTip, /localStorage\.getItem/);
  assert.match(dismissTip, /localStorage\.setItem/);
  assert.match(reset, /sessionVoiceTipDismissed = false/);
});

test("account switches clear the old shell before profile boot and boot rejects stale results", async () => {
  const app = await readFile(new URL("app.js", publicUrl), "utf8");
  const boot = functionSource(app, "async function boot");
  const authChange = functionSource(app, "sb.auth.onAuthStateChange");
  assert.match(boot, /const expectedUserId =/);
  assert.match(boot, /if \(!isCurrentAppUser\(expectedUserId\)\) return false/);
  assert.match(authChange, /resetChefState\(\);[\s\S]*user = null;[\s\S]*profile = null;[\s\S]*authScreen\(\);[\s\S]*user = session\.user;[\s\S]*void boot\(\)/);
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

test("Chef Mode renders ordered strict timers and the AI contract forbids busywork", async () => {
  const [chefMode, edge] = await Promise.all([
    readFile(new URL("chef-mode.js", publicUrl), "utf8"),
    readFile(new URL("../supabase/functions/chef-meal-plan/index.ts", import.meta.url), "utf8"),
  ]);
  assert.match(chefMode, /currentStep\.timers\.length/);
  assert.match(chefMode, /data-current-step-timer/);
  assert.match(chefMode, /stepTimerIndex/);
  assert.match(chefMode, /reconcileStrictRecipeTimers/);
  assert.match(edge, /Take 5 minutes to read the recipe.*forbidden busywork/);
  assert.match(edge, /Sear side one for 20 seconds[\s\S]*two ordered 20-second timers/);
  assert.match(edge, /each timer needs its own explicit duration occurrence/);
  assert.match(edge, /"timers":\[/);
});

test("legacy recipe safety is visible and blocks unsafe downstream actions", async () => {
  const [chefMode, i18n] = await Promise.all([
    readFile(new URL("chef-mode.js", publicUrl), "utf8"),
    readFile(new URL("i18n.js", publicUrl), "utf8"),
  ]);
  assert.match(chefMode, /ChefDomain\.recipeIntegrityReport\(recipe\)/);
  assert.match(chefMode, /legacy-recipe-warning/);
  assert.match(chefMode, /Regenerate precise recipe/);
  assert.match(chefMode, /integrity\.safe \? "" : "disabled"/);
  assert.match(chefMode, /This legacy recipe is missing exact ingredient measurements/);
  assert.match(chefMode, /unsafe shopping list cannot be added to pantry/i);
  assert.match(i18n, /This legacy recipe is missing exact ingredient measurements/);
  assert.match(i18n, /這份舊食譜缺少精確的食材份量/);
  const renderPlan = chefMode.slice(
    chefMode.indexOf("function renderPlan("),
    chefMode.indexOf("function renderEquipmentAdaptations("),
  );
  assert.ok(
    renderPlan.indexOf("ChefDomain.recipeIntegrityReport(recipe)") <
      renderPlan.indexOf("if (!recipe.steps.length)"),
    "integrity must be measured before display-only fallback steps are added",
  );
});

test("offline scope is visible and reacts to connection changes", async () => {
  const app = await readFile(new URL("app.js", publicUrl), "utf8");
  assert.match(app, /id="connection-status"/);
  assert.match(app, /function updateConnectionStatus\(\)/);
  assert.match(app, /window\.addEventListener\("online", updateConnectionStatus\)/);
  assert.match(app, /window\.addEventListener\("offline", updateConnectionStatus\)/);
  assert.match(app, /Current cooking progress stays on this device/);
  assert.match(app, /planning, sync, and nutrition references need a connection/);
});

test("representative recipe imagery is disclosed instead of presented as exact", async () => {
  const chefMode = await readFile(new URL("chef-mode.js", publicUrl), "utf8");
  assert.match(chefMode, /displayImage\?\.match_kind === "representative"/);
  assert.match(chefMode, /Representative dish image/);
  assert.match(chefMode, /displayImage\.source/);
  assert.match(chefMode, /displayImage\.creator/);
  assert.match(chefMode, /displayImage\.license/);
});

test("weekly planning stays read-only until an action and blocks unsafe recipes", async () => {
  const [chefMode, i18n] = await Promise.all([
    readFile(new URL("chef-mode.js", publicUrl), "utf8"),
    readFile(new URL("i18n.js", publicUrl), "utf8"),
  ]);
  const weekly = chefMode.slice(
    chefMode.indexOf("async function renderWeeklyPlanner()"),
    chefMode.indexOf("function renderPersonalizedSwaps("),
  );
  assert.match(weekly, /async function ensureWeekPlan\(\)/);
  assert.match(weekly, /if \(plan\) return plan/);
  assert.match(weekly, /ChefDomain\.recipeIntegrityReport\(recipeRow\.recipe\)/);
  assert.match(weekly, /unsafeWeeklyRecipes/);
  assert.match(weekly, /Regenerate those recipes before building a weekly list/);
  assert.match(i18n, /請先重新產生這些食譜，再建立本週購物清單/);
});

test("recipe responses do not await remote image lookup", async () => {
  const edge = await readFile(
    new URL("../supabase/functions/chef-meal-plan/index.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(edge, /await addRecipeImage/);
});

test("onboarding saves, reloads, edits, and dedupes custom allergies", async () => {
  const [app, i18n] = await Promise.all([
    readFile(new URL("app.js", publicUrl), "utf8"),
    readFile(new URL("i18n.js", publicUrl), "utf8"),
  ]);
  const onboarding = app.slice(
    app.indexOf("function onboarding("),
    app.indexOf("async function boot()"),
  );
  assert.match(onboarding, /name="custom_allergies"/);
  assert.match(
    onboarding,
    /allergies\.filter\(\(value\) => !dietSafetyChoices\.includes\(value\)\)/,
    "saved custom allergies must reload into the input on edit",
  );
  assert.match(
    onboarding,
    /split\(\/\[,、，\]\/\)/,
    "custom allergies must accept English and CJK comma separators",
  );
  assert.match(
    onboarding,
    /toLocaleLowerCase\(\)/,
    "custom allergies must dedupe case-insensitively",
  );
  assert.match(onboarding, /seenAllergies/);
  assert.ok(
    onboarding.indexOf("allergies: mergedAllergies") >= 0,
    "the saved payload must use the merged, deduped allergy list",
  );
  assert.match(i18n, /"Other allergies \(comma separated\)"/);
});
