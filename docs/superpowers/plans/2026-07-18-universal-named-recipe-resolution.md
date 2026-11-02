# Universal Named Recipe Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every recognizable named-dish request resolve to that same dish through TheMealDB first and Gemini second, while asking for clarification on ambiguous names and never substituting an unrelated fallback.

**Architecture:** Add small pure modules for dish resolution, provider matching, TheMealDB access, provenance, and named-dish integrity. The authenticated `chef-meal-plan` Edge Function orchestrates those modules under one 42-second deadline; the browser handles clarification candidates, source attribution, session-only recipes, and exact failure states without persisting invalid output.

**Tech Stack:** Vanilla JavaScript, TypeScript in Supabase Edge Functions, Node.js built-in test runner, Playwright, TheMealDB API, Gemini API, Supabase Auth/Postgres/Edge Functions, Cloudflare Pages.

## Global Constraints

- Preserve every pre-existing uncommitted workspace change and stage only files named by the active task.
- Every behavior change begins with a failing focused test.
- A recognizable named dish may return only the same dish or a dish-specific error; it must never enter broad-request fallback rotation.
- Broad requests continue to support recipe variety and clearly labeled fallback meals.
- TheMealDB search plus detail lookup has one shared 4,000 ms deadline.
- The Edge Function has one shared 42,000 ms deadline; the browser keeps its existing 50,000 ms deadline.
- Provider, repair, and model attempts share the remaining deadline and must not reset it.
- TheMealDB and Gemini credentials remain server-side Supabase secrets.
- Do not persist complete external content unless `THEMEALDB_PERSISTENCE_POLICY=permanent` has been set after a documented license review.
- Clarification responses do not consume the meal-generation quota and do not create recipes.
- Failed named-dish generation refunds consumed quota and creates no recipe, image, shopping list, or nutrition lookup.
- Images and USDA lookup remain optional and must not delay a valid recipe response.
- User-visible additions require English and Traditional Chinese copy.
- Existing recipe JSON remains backward compatible; no provenance backfill is required.

---

## File Map

### New files

- `supabase/functions/_shared/dish-resolver.js` — pure request classification, alias normalization, resolver-output validation, and search-term construction.
- `supabase/functions/_shared/recipe-source.js` — pure source-candidate scoring, TheMealDB payload normalization, and provenance helpers.
- `supabase/functions/_shared/themealdb-provider.js` — bounded TheMealDB HTTP adapter with dependency-injected `fetch`.
- `supabase/functions/_shared/named-recipe-integrity.js` — named-dish identity checks, validation-error classification, and repair prompt construction.
- `tests/dish-resolver.test.mjs` — named/broad classification, aliases, typo resolution, and clarification contracts.
- `tests/recipe-source-provider.test.mjs` — provider ranking, payload normalization, timeout, miss, and persistence-policy contracts.
- `tests/named-recipe-pipeline.test.mjs` — same-dish enforcement, repair behavior, deadlines, quota refund, and no-fallback source contracts.
- `tests/fixtures/themealdb-beef-bourguignon.json` — stable provider-hit fixture.
- `tests/fixtures/themealdb-empty.json` — stable provider-miss fixture.

### Modified files

- `supabase/functions/chef-meal-plan/index.ts` — orchestration, provenance fields, model-assisted resolution, provider-first path, repair retry, deadline, outcomes, and named-dish failure response.
- `supabase/config.toml` — document the new function secrets without storing values.
- `public/app.js` — handle the result union and render clarification choices.
- `public/chef-mode.js` — persist only allowed recipes and render source attribution.
- `public/styles.css` — clarification UI.
- `public/chef-mode.css` — source and failure attribution UI.
- `public/i18n.js` — English and Traditional Chinese copy.
- `tests/ui-contracts.test.mjs` — clarification, attribution, session-only, and exact-failure browser contracts.
- `e2e/authenticated-smoke.spec.mjs` — route-mocked named-dish browser stories.
- `README.md` — provider setup, licensing gate, outcomes, and release checks.
- `.env.e2e.example` — document the optional authenticated named-recipe smoke variables.
- `scripts/verify-deployment.mjs` — require the new Edge Function version after deployment.
- `public/sw.js`, `public/boot.js`, `public/index.html`, and versioned public references — updated mechanically through `npm run pwa:version` after public assets change.

---

### Task 1: Add the pure dish-resolution contract

**Files:**
- Create: `supabase/functions/_shared/dish-resolver.js`
- Create: `tests/dish-resolver.test.mjs`

**Interfaces:**
- Consumes: raw request text and optional model-produced resolution data.
- Produces:
  - `classifyMealRequest(request): "named_dish" | "broad_request"`
  - `baselineDishResolution(request): DishResolution`
  - `normalizeDishResolution(originalRequest, candidate): DishResolution`
  - `dishSearchTerms(resolution): string[]`

- [ ] **Step 1: Write failing classification and alias tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  baselineDishResolution,
  classifyMealRequest,
  dishSearchTerms,
  normalizeDishResolution,
} from "../supabase/functions/_shared/dish-resolver.js";

test("classifies recognizable dish names separately from broad requests", () => {
  assert.equal(classifyMealRequest("肉燥飯"), "named_dish");
  assert.equal(classifyMealRequest("Beef Bourguignon"), "named_dish");
  assert.equal(classifyMealRequest("推薦一份高蛋白晚餐"), "broad_request");
});

test("normalizes approved aliases while preserving the original request", () => {
  const resolution = baselineDishResolution("魯肉飯");
  assert.equal(resolution.originalRequest, "魯肉飯");
  assert.equal(resolution.displayName, "魯肉飯");
  assert.equal(resolution.canonicalName, "肉燥飯");
  assert.ok(resolution.aliases.includes("lu rou fan"));
  assert.ok(resolution.aliases.includes("minced pork rice"));
});

test("accepts a high-confidence typo resolution from the model", () => {
  const resolution = normalizeDishResolution("肉躁飯", {
    canonical_name: "肉燥飯",
    aliases: ["lu rou fan", "minced pork rice"],
    confidence: 0.98,
    candidates: [],
  });
  assert.equal(resolution.needsClarification, false);
  assert.equal(resolution.displayName, "肉躁飯");
  assert.equal(resolution.canonicalName, "肉燥飯");
});

test("requires clarification for a low-confidence dish resolution", () => {
  const resolution = normalizeDishResolution("紅燒飯", {
    canonical_name: "",
    aliases: [],
    confidence: 0.55,
    candidates: ["紅燒肉飯", "紅燒牛肉飯"],
  });
  assert.equal(resolution.needsClarification, true);
  assert.deepEqual(resolution.clarificationCandidates, [
    "紅燒肉飯",
    "紅燒牛肉飯",
  ]);
});

test("requires a description for an unrecognized custom dish name", () => {
  const resolution = normalizeDishResolution("Daniel 特製宇宙飯", {
    canonical_name: "",
    aliases: [],
    confidence: 0.2,
    candidates: [],
  });
  assert.equal(resolution.needsClarification, true);
  assert.equal(resolution.needsDescription, true);
  assert.deepEqual(resolution.clarificationCandidates, []);
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
node --test tests/dish-resolver.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `dish-resolver.js`.

- [ ] **Step 3: Implement the minimum pure resolver**

Create the module with this public shape:

```js
import { isBroadMealRequest } from "./recipe-variety.js";

const aliasGroups = [
  {
    canonicalName: "肉燥飯",
    pattern: /^(?:肉燥飯|滷肉飯|卤肉饭|魯肉飯|鲁肉饭|lu rou fan)$/i,
    aliases: ["肉燥飯", "滷肉飯", "魯肉飯", "lu rou fan", "minced pork rice"],
  },
];

function clean(value) {
  return String(value || "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function classifyMealRequest(request) {
  return isBroadMealRequest(clean(request)) ? "broad_request" : "named_dish";
}

export function baselineDishResolution(request) {
  const originalRequest = clean(request);
  const group = aliasGroups.find(({ pattern }) => pattern.test(originalRequest));
  return {
    requestType: classifyMealRequest(originalRequest),
    originalRequest,
    displayName: originalRequest,
    canonicalName: group?.canonicalName || originalRequest,
    aliases: group?.aliases || [originalRequest],
    confidence: group ? 1 : 0.8,
    needsClarification: false,
    clarificationCandidates: [],
  };
}

export function normalizeDishResolution(originalRequest, candidate = {}) {
  const baseline = baselineDishResolution(originalRequest);
  const confidence = Number(candidate.confidence);
  const candidates = Array.isArray(candidate.candidates)
    ? candidate.candidates.map(clean).filter(Boolean).slice(0, 3)
    : [];
  const canonicalName = clean(candidate.canonical_name);
  const needsClarification = Number.isFinite(confidence) && confidence < 0.85;
  const needsDescription = needsClarification && candidates.length === 0;
  return {
    ...baseline,
    canonicalName: needsClarification
      ? baseline.canonicalName
      : canonicalName || baseline.canonicalName,
    aliases: [
      ...new Set([
        ...(Array.isArray(candidate.aliases) ? candidate.aliases.map(clean) : []),
        ...baseline.aliases,
      ].filter(Boolean)),
    ].slice(0, 8),
    confidence: Number.isFinite(confidence) ? confidence : baseline.confidence,
    needsClarification,
    needsDescription,
    clarificationCandidates: needsClarification ? candidates : [],
  };
}

export function dishSearchTerms(resolution) {
  return [
    resolution.canonicalName,
    ...(resolution.aliases || []),
  ].map(clean).filter((value, index, values) =>
    value && values.indexOf(value) === index
  ).slice(0, 4);
}
```

- [ ] **Step 4: Run focused and full tests**

Run:

```bash
node --test tests/dish-resolver.test.mjs
npm test
```

Expected: all dish-resolver tests pass and the existing suite remains green.

- [ ] **Step 5: Commit only the resolver task**

```bash
git add supabase/functions/_shared/dish-resolver.js tests/dish-resolver.test.mjs
git commit -m "feat: resolve named dish requests"
```

---

### Task 2: Add the TheMealDB provider and source matcher

**Files:**
- Create: `supabase/functions/_shared/recipe-source.js`
- Create: `supabase/functions/_shared/themealdb-provider.js`
- Create: `tests/recipe-source-provider.test.mjs`
- Create: `tests/fixtures/themealdb-beef-bourguignon.json`
- Create: `tests/fixtures/themealdb-empty.json`

**Interfaces:**
- Consumes: `DishResolution`, provider API key, injected `fetchImpl`, and one timeout.
- Produces:
  - `scoreSourceCandidate(title, resolution): number`
  - `selectSourceCandidate(meals, resolution): object | null`
  - `normalizeTheMealDbRecipe(meal, persistencePolicy): ExternalRecipeSeed`
  - `fetchTheMealDbRecipe(options): Promise<ProviderResult>`

- [ ] **Step 1: Add stable provider fixtures**

The hit fixture must include a minimal real-shape object:

```json
{
  "meals": [{
    "idMeal": "52904",
    "strMeal": "Beef Bourguignon",
    "strInstructions": "Brown the beef. Simmer until tender.",
    "strIngredient1": "Beef",
    "strMeasure1": "1 kg",
    "strIngredient2": "Red Wine",
    "strMeasure2": "750 ml",
    "strSource": "https://example.test/beef-bourguignon",
    "strMealThumb": "https://example.test/beef-bourguignon.jpg"
  }]
}
```

The miss fixture is:

```json
{ "meals": null }
```

- [ ] **Step 2: Write failing ranking, normalization, miss, and timeout tests**

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { baselineDishResolution } from "../supabase/functions/_shared/dish-resolver.js";
import {
  normalizeTheMealDbRecipe,
  selectSourceCandidate,
} from "../supabase/functions/_shared/recipe-source.js";
import { fetchTheMealDbRecipe } from "../supabase/functions/_shared/themealdb-provider.js";

const hitFixture = JSON.parse(await readFile(
  new URL("./fixtures/themealdb-beef-bourguignon.json", import.meta.url),
  "utf8",
));
const missFixture = JSON.parse(await readFile(
  new URL("./fixtures/themealdb-empty.json", import.meta.url),
  "utf8",
));

test("rejects a merely ingredient-related meal title", () => {
  const resolution = baselineDishResolution("肉燥飯");
  assert.equal(
    selectSourceCandidate(
      [{ strMeal: "Vegetable Pork Rice Bowl" }],
      resolution,
    ),
    null,
  );
});

test("selects an exact external recipe and keeps provenance", () => {
  const selected = selectSourceCandidate(
    hitFixture.meals,
    baselineDishResolution("Beef Bourguignon"),
  );
  const recipe = normalizeTheMealDbRecipe(selected, "session_only");
  assert.equal(recipe.source_provider, "themealdb");
  assert.equal(recipe.source_title, "Beef Bourguignon");
  assert.equal(recipe.source_persistence, "session_only");
  assert.deepEqual(recipe.ingredient_lines, ["1 kg Beef", "750 ml Red Wine"]);
});

test("returns provider_miss without choosing a nearby dish", async () => {
  const result = await fetchTheMealDbRecipe({
    apiKey: "test-key",
    resolution: baselineDishResolution("肉燥飯"),
    fetchImpl: async () => new Response(JSON.stringify(missFixture)),
    timeoutMs: 4000,
  });
  assert.equal(result.outcome, "provider_miss");
  assert.equal(result.recipe, null);
});

test("maps aborts to provider_unavailable", async () => {
  const result = await fetchTheMealDbRecipe({
    apiKey: "test-key",
    resolution: baselineDishResolution("Beef Bourguignon"),
    fetchImpl: async () => {
      throw new DOMException("Timed out", "AbortError");
    },
    timeoutMs: 10,
  });
  assert.equal(result.outcome, "provider_unavailable");
});
```

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```bash
node --test tests/recipe-source-provider.test.mjs
```

Expected: FAIL because both provider modules are missing.

- [ ] **Step 4: Implement candidate scoring and payload normalization**

Implement exact/alias containment plus token similarity, with `0.82` as the minimum accepted score:

```js
function normalize(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenScore(left, right) {
  const leftTokens = new Set(normalize(left).split(" ").filter(Boolean));
  const rightTokens = new Set(normalize(right).split(" ").filter(Boolean));
  if (!leftTokens.size || !rightTokens.size) return 0;
  const common = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return common / new Set([...leftTokens, ...rightTokens]).size;
}

export function scoreSourceCandidate(title, resolution) {
  const candidate = normalize(title);
  const names = [
    resolution.canonicalName,
    ...(resolution.aliases || []),
  ].map(normalize).filter(Boolean);
  return Math.max(0, ...names.map((name) => {
    if (candidate === name) return 1;
    if (candidate.includes(name) || name.includes(candidate)) return 0.9;
    return tokenScore(candidate, name);
  }));
}

export function selectSourceCandidate(meals, resolution) {
  const ranked = (Array.isArray(meals) ? meals : [])
    .map((meal) => ({
      meal,
      score: scoreSourceCandidate(meal?.strMeal, resolution),
    }))
    .filter(({ score }) => score >= 0.82)
    .sort((left, right) => right.score - left.score);
  return ranked[0]?.meal || null;
}
```

Normalize ingredient slots `1` through `20` and return:

```js
{
  provider_id: String(meal.idMeal),
  source_provider: "themealdb",
  source_title: String(meal.strMeal),
  source_url: String(meal.strSource || ""),
  source_image_url: String(meal.strMealThumb || ""),
  source_persistence: persistencePolicy,
  ingredient_lines: ["1 kg Beef", "750 ml Red Wine"],
  instructions_text: String(meal.strInstructions || ""),
}
```

Reject a source as incomplete when it has no title, fewer than two non-empty ingredient lines, or no instructions.

- [ ] **Step 5: Implement the bounded HTTP adapter**

Use at most four unique terms, one shared abort signal, and no browser-visible key:

```js
export async function fetchTheMealDbRecipe({
  apiKey,
  resolution,
  fetchImpl = fetch,
  timeoutMs = 4000,
  persistencePolicy = "session_only",
}) {
  if (!apiKey) {
    return { outcome: "provider_unavailable", recipe: null };
  }
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    for (const term of dishSearchTerms(resolution)) {
      const url =
        `https://www.themealdb.com/api/json/v1/${encodeURIComponent(apiKey)}` +
        `/search.php?s=${encodeURIComponent(term)}`;
      const response = await fetchImpl(url, { signal });
      if (!response.ok) continue;
      const payload = await response.json();
      const selected = selectSourceCandidate(payload.meals, resolution);
      if (selected) {
        return {
          outcome: "external_recipe",
          recipe: normalizeTheMealDbRecipe(selected, persistencePolicy),
        };
      }
    }
    return { outcome: "provider_miss", recipe: null };
  } catch (error) {
    return {
      outcome: "provider_unavailable",
      recipe: null,
      reason: error instanceof Error ? error.message : "unknown",
    };
  }
}
```

- [ ] **Step 6: Run focused and full tests**

Run:

```bash
node --test tests/recipe-source-provider.test.mjs
npm test
```

Expected: all provider tests and the full Node suite pass.

- [ ] **Step 7: Commit only the provider task**

```bash
git add \
  supabase/functions/_shared/recipe-source.js \
  supabase/functions/_shared/themealdb-provider.js \
  tests/recipe-source-provider.test.mjs \
  tests/fixtures/themealdb-beef-bourguignon.json \
  tests/fixtures/themealdb-empty.json
git commit -m "feat: add TheMealDB recipe provider"
```

---

### Task 3: Enforce named-dish identity and classify repairable output

**Files:**
- Create: `supabase/functions/_shared/named-recipe-integrity.js`
- Create: `tests/named-recipe-pipeline.test.mjs`

**Interfaces:**
- Consumes: validated plan title, `DishResolution`, and thrown validation errors.
- Produces:
  - `namedDishRejectionReason(plan, resolution): string`
  - `recipeValidationDisposition(error): "repairable" | "fatal"`
  - `buildRecipeRepairPrompt(options): string`
  - `remainingTimeout(deadlineAt, capMs, now): number`

- [ ] **Step 1: Write failing identity, repair, and deadline tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { baselineDishResolution } from "../supabase/functions/_shared/dish-resolver.js";
import {
  buildRecipeRepairPrompt,
  namedDishRejectionReason,
  recipeValidationDisposition,
  remainingTimeout,
} from "../supabase/functions/_shared/named-recipe-integrity.js";

test("accepts the same named dish with a descriptive title", () => {
  const resolution = baselineDishResolution("肉燥飯");
  assert.equal(
    namedDishRejectionReason({ title: "家常台式肉燥飯" }, resolution),
    "",
  );
});

test("rejects an unrelated fallback title for a named dish", () => {
  const reason = namedDishRejectionReason(
    { title: "精準蔬菜鷹嘴豆飯碗" },
    baselineDishResolution("肉燥飯"),
  );
  assert.match(reason, /does not match/i);
});

test("only structural timer and field failures are repairable", () => {
  assert.equal(
    recipeValidationDisposition(
      new Error(
        "steps[0].instruction must state an exact duration for its cooking action",
      ),
    ),
    "repairable",
  );
  assert.equal(
    recipeValidationDisposition(new Error("named dish does not match request")),
    "fatal",
  );
  assert.equal(
    recipeValidationDisposition(new Error("recipe contains an allergen")),
    "fatal",
  );
});

test("all attempts share the remaining deadline", () => {
  assert.equal(remainingTimeout(42_000, 20_000, 10_000), 20_000);
  assert.equal(remainingTimeout(42_000, 20_000, 37_500), 4_500);
  assert.equal(remainingTimeout(42_000, 20_000, 42_000), 0);
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test tests/named-recipe-pipeline.test.mjs
```

Expected: FAIL because `named-recipe-integrity.js` is missing.

- [ ] **Step 3: Implement identity matching and explicit repair allowlist**

Use normalized containment and aliases, not one shared ingredient token:

```js
function normalizeDishText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, "")
    .trim();
}

export function namedDishRejectionReason(plan, resolution) {
  if (resolution.requestType !== "named_dish") return "";
  const title = normalizeDishText(plan?.title);
  const names = [
    resolution.canonicalName,
    ...(resolution.aliases || []),
  ].map(normalizeDishText).filter(Boolean);
  const matches = names.some((name) =>
    title === name || title.includes(name) || name.includes(title)
  );
  return matches
    ? ""
    : `Generated title "${plan?.title || ""}" does not match named dish "${resolution.canonicalName}".`;
}

const repairablePatterns = [
  /^steps\[\d+\]\.instruction must state an exact duration/,
  /^steps\[\d+\]\.instruction must use one exact duration/,
  /^ingredients\[\d+\]\.(?:quantity|unit|preparation|category) /,
  /^substitutions\[\d+\]\./,
];

export function recipeValidationDisposition(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  return repairablePatterns.some((pattern) => pattern.test(message))
    ? "repairable"
    : "fatal";
}

export function remainingTimeout(deadlineAt, capMs, now = Date.now()) {
  return Math.max(0, Math.min(capMs, deadlineAt - now));
}

export function buildRecipeRepairPrompt({
  canonicalName,
  rawText,
  validationMessage,
  schemaText,
}) {
  return [
    `The requested dish is exactly: ${canonicalName}.`,
    `Validation failed with: ${validationMessage}`,
    "Repair only the rejected fields; do not change the dish identity.",
    "Return only JSON matching this schema:",
    schemaText,
    "Invalid JSON to repair:",
    rawText,
  ].join("\n\n");
}
```

- [ ] **Step 4: Run focused and full tests**

Run:

```bash
node --test tests/named-recipe-pipeline.test.mjs
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit only the integrity task**

```bash
git add \
  supabase/functions/_shared/named-recipe-integrity.js \
  tests/named-recipe-pipeline.test.mjs
git commit -m "feat: guard named recipe identity"
```

---

### Task 4: Integrate provider-first named-recipe orchestration

**Files:**
- Modify: `tests/named-recipe-pipeline.test.mjs`
- Modify: `tests/ui-contracts.test.mjs`
- Modify: `supabase/functions/chef-meal-plan/index.ts`
- Modify: `supabase/config.toml`

**Interfaces:**
- Consumes:
  - `THEMEALDB_API_KEY`
  - `THEMEALDB_PERSISTENCE_POLICY` with allowed values `session_only | permanent`
  - existing `GEMINI_API_KEY`
- Produces:
  - `{ plan, meta }` for successful recipes
  - `{ clarification_required: true, needs_description, original_request, candidates, meta }`
  - `{ error, code: "named_recipe_unavailable", meta }` with HTTP 503

- [ ] **Step 1: Add failing Edge source-contract tests**

Extend `tests/named-recipe-pipeline.test.mjs`:

```js
test("the Edge function uses provider-first flow and never named fallback", async () => {
  const edge = await readFile(
    new URL("../supabase/functions/chef-meal-plan/index.ts", import.meta.url),
    "utf8",
  );
  assert.match(edge, /THEMEALDB_API_KEY/);
  assert.match(edge, /fetchTheMealDbRecipe/);
  assert.match(edge, /namedDishRejectionReason/);
  assert.match(edge, /clarification_required: true/);
  assert.match(edge, /named_recipe_unavailable/);
  assert.match(edge, /EDGE_DEADLINE_MS = 42_000/);
  assert.match(edge, /remainingTimeout/);
  assert.doesNotMatch(edge, /await addRecipeImage/);
  assert.match(
    edge,
    /requestType === "broad_request"[\s\S]*fallbackPlan/,
  );
  assert.doesNotMatch(
    edge,
    /requestType === "named_dish"[\s\S]{0,400}fallbackPlan/,
  );
});

test("named generation repair precedes the second model", async () => {
  const edge = await readFile(
    new URL("../supabase/functions/chef-meal-plan/index.ts", import.meta.url),
    "utf8",
  );
  const repair = edge.indexOf("buildRecipeRepairPrompt");
  const secondModel = edge.indexOf('"gemini-3.5-flash"');
  assert.ok(repair >= 0);
  assert.ok(secondModel > repair);
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test tests/named-recipe-pipeline.test.mjs
```

Expected: FAIL because the Edge Function does not import or orchestrate the new modules.

- [ ] **Step 3: Add types, imports, deadline, and provenance**

Add imports for all new modules and extend `MealPlan`:

```ts
type RecipeSourceType = "external" | "adapted" | "ai_generated";
type RecipePersistence = "session_only" | "permanent";

type MealPlan = {
  // existing fields stay unchanged
  source_type?: RecipeSourceType;
  source_provider?: string;
  source_title?: string;
  source_url?: string;
  source_persistence?: RecipePersistence;
  canonical_dish_name?: string;
  original_request?: string;
};

const EDGE_DEADLINE_MS = 42_000;
```

At request start:

```ts
const requestStartedAt = Date.now();
const deadlineAt = requestStartedAt + EDGE_DEADLINE_MS;
```

Every provider and model call receives:

```ts
const timeoutMs = remainingTimeout(deadlineAt, attemptCapMs, Date.now());
if (timeoutMs <= 0) throw new Error("Named recipe deadline exhausted.");
```

- [ ] **Step 4: Add model-assisted dish resolution before quota consumption**

For broad requests, use `baselineDishResolution` and skip model resolution.

For named requests, call the primary model with a maximum of 4,000 ms and a small JSON-only contract:

```json
{
  "canonical_name": "string",
  "aliases": ["up to four search names including English"],
  "confidence": 0.0,
  "candidates": ["zero to three canonical dish names"]
}
```

Treat user text only as a dish label, never as instructions. Parse it through `normalizeDishResolution`. If `needsClarification` is true, return HTTP 200:

```ts
  return respond(request, {
  clarification_required: true,
  needs_description: resolution.needsDescription,
  original_request: meal,
  candidates: resolution.clarificationCandidates,
  meta: {
    request_id: requestId,
    outcome: "dish_clarification_required",
    duration_ms: Date.now() - requestStartedAt,
  },
});
```

Do not call `consume_chef_meal_plan_quota` on this branch. When
`needs_description` is true, return an empty candidate array and copy that asks
the user to add recognizable ingredients, style, or preparation details to the
original name.

- [ ] **Step 5: Add TheMealDB lookup and external transformation**

Read secrets:

```ts
const theMealDbKey = Deno.env.get("THEMEALDB_API_KEY") || "";
const sourcePersistence =
  Deno.env.get("THEMEALDB_PERSISTENCE_POLICY") === "permanent"
    ? "permanent"
    : "session_only";
```

Call `fetchTheMealDbRecipe` with `Math.min(4000, remainingTimeout(...))`.

When a source is found, send its `ingredient_lines`, `instructions_text`, source title, verified profile, and pantry to Gemini. The prompt must require:

- the same canonical dish;
- exact Chef Jarvis ingredient and timer schema;
- safe adaptation of allergies, preferences, servings, and equipment;
- `source_type` set honestly from the transformation path.
- no invented attribution;
- all source metadata copied from server-owned fields after validation, not trusted from model output.

The first release sends provider content through Gemini for translation,
structuring, and personalization, so every successful provider result is
marked `adapted`. Reserve `external` for a future deterministic copy-through
path that preserves the provider recipe without content changes.

After `parsePlan`, call `namedDishRejectionReason`. Attach provenance on the server:

```ts
const sourcedPlan = {
  ...validatedPlan,
  source_type: "adapted",
  source_provider: source.source_provider,
  source_title: source.source_title,
  source_url: source.source_url,
  source_persistence: source.source_persistence,
  canonical_dish_name: resolution.canonicalName,
  original_request: meal,
};
```

Use the provider image only when it is an HTTPS URL from the provider payload.
For every named or broad success path, remove `await addRecipeImage(...)` from
the response path. AI-generated and broad fallback plans may attach only a
synchronous curated image or `null`; Wikimedia lookup must not delay the recipe
response. The existing client already supports an image-free recipe layout.

- [ ] **Step 6: Add repair-before-failover for Gemini output**

Keep the raw output text. On a repairable parse/validation error:

1. Build `buildRecipeRepairPrompt`.
2. Call the same model once with at most 8,000 ms of remaining time.
3. Parse and fully validate again.
4. Run `namedDishRejectionReason` again.
5. If still invalid, continue to the second model.

Fatal identity/allergen errors skip same-model repair and continue to the second model.

The second model uses at most the smaller of 18,000 ms and remaining time. Every successful named-dish plan receives:

```ts
{
  source_type: "ai_generated",
  source_provider: "",
  source_title: "",
  source_url: "",
  source_persistence: "permanent",
  canonical_dish_name: resolution.canonicalName,
  original_request: meal,
}
```

- [ ] **Step 7: Remove static fallback from named-dish failure**

After refunding quota, branch by request type:

```ts
if (resolution.requestType === "named_dish") {
  console.log("chef_meal_plan_completed", {
    request_id: requestId,
    outcome: "generation_validation_failed",
    duration_ms: Date.now() - requestStartedAt,
  });
  return respond(
    request,
    {
      error:
        language === "zh-TW"
          ? `目前無法取得「${resolution.displayName}」的完整食譜，請稍後再試。`
          : `A complete recipe for "${resolution.displayName}" is unavailable right now. Please try again.`,
      code: "named_recipe_unavailable",
      meta: {
        request_id: requestId,
        outcome: "generation_validation_failed",
        duration_ms: Date.now() - requestStartedAt,
      },
    },
    503,
  );
}
```

Only the broad-request branch may call `fallbackPlan`.

When `GEMINI_API_KEY` is missing, a named request may use a provider result only if it can be deterministically converted and validated; otherwise return the same named error. It must never enter static fallback.

- [ ] **Step 8: Add safe operational logs**

Log request ID, provider, provider outcome, model, attempt, validation disposition, per-stage duration, and final outcome. Do not log the raw request, full profile, allergies, access token, API keys, or recipe payload.

Use a one-way digest for canonical dish observability:

```ts
const dishDigest = await crypto.subtle.digest(
  "SHA-256",
  new TextEncoder().encode(resolution.canonicalName),
);
const dishKey = [...new Uint8Array(dishDigest)]
  .slice(0, 8)
  .map((byte) => byte.toString(16).padStart(2, "0"))
  .join("");
```

- [ ] **Step 9: Document config names without storing secrets**

Add comments to `supabase/config.toml` or its existing function-secret documentation area naming:

```text
THEMEALDB_API_KEY
THEMEALDB_PERSISTENCE_POLICY=session_only|permanent
```

Do not add values to tracked files.

- [ ] **Step 10: Run Edge contracts and the full suite**

Run:

```bash
node --test tests/named-recipe-pipeline.test.mjs
npm test
npm run check
```

Expected: all tests and syntax/PWA consistency checks pass.

- [ ] **Step 11: Commit only the orchestration task**

```bash
git add \
  supabase/functions/chef-meal-plan/index.ts \
  supabase/config.toml \
  tests/named-recipe-pipeline.test.mjs \
  tests/ui-contracts.test.mjs
git commit -m "feat: orchestrate named recipe resolution"
```

---

### Task 5: Add clarification and provenance UI

**Files:**
- Modify: `tests/ui-contracts.test.mjs`
- Modify: `public/app.js`
- Modify: `public/chef-mode.js`
- Modify: `public/styles.css`
- Modify: `public/chef-mode.css`
- Modify: `public/i18n.js`

**Interfaces:**
- Consumes the Edge response union:
  - `{ plan, meta }`
  - `{ clarification_required, needs_description, original_request, candidates, meta }`
- Produces:
  - `generatePlan(request): Promise<{ kind: "plan", plan } | { kind: "clarification", originalRequest, needsDescription, candidates }>`
  - `renderDishClarification(result): void`
  - source attribution and session-only persistence behavior.

- [ ] **Step 1: Add failing UI contract tests**

```js
test("named recipe clarification does not render or persist a plan", async () => {
  const [app, chefMode] = await Promise.all([
    readFile(new URL("app.js", publicUrl), "utf8"),
    readFile(new URL("chef-mode.js", publicUrl), "utf8"),
  ]);
  assert.match(chefMode, /kind: "clarification"/);
  assert.match(app, /function renderDishClarification/);
  assert.match(app, /data-dish-candidate/);
  assert.match(app, /requestSubmit\(\)/);
});

test("external recipes show provenance and obey persistence policy", async () => {
  const chefMode = await readFile(new URL("chef-mode.js", publicUrl), "utf8");
  assert.match(chefMode, /recipe-source-note/);
  assert.match(chefMode, /source_type === "adapted"/);
  assert.match(chefMode, /source_url/);
  assert.match(chefMode, /source_persistence === "session_only"/);
  assert.match(chefMode, /rel="noopener noreferrer"/);
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test --test-name-pattern="named recipe clarification|external recipes show provenance" tests/ui-contracts.test.mjs
```

Expected: FAIL because clarification and source UI do not exist.

- [ ] **Step 3: Return a result union from `generatePlan`**

After parsing the response:

```js
if (data.clarification_required) {
  return {
    kind: "clarification",
    originalRequest: data.original_request || request,
    needsDescription: Boolean(data.needs_description),
    candidates: Array.isArray(data.candidates) ? data.candidates.slice(0, 3) : [],
  };
}
if (!response.ok) {
  const error = new Error(data.error || "Jarvis could not create a plan.");
  error.code = data.code || "";
  throw error;
}
const plan = {
  ...data.plan,
  userRequest: request,
  fallback: Boolean(data.fallback || data.plan?.fallback),
};
return {
  kind: "plan",
  plan: await persistGeneratedPlan(plan, request),
};
```

- [ ] **Step 4: Render clarification candidates without creating a recipe**

In the meal form handler:

```js
const result = await generatePlan(input);
if (result.kind === "clarification") {
  renderDishClarification(result);
  return;
}
renderPlan(result.plan);
show("plan");
```

`renderDishClarification` places an accessible panel after `#meal-form`. When
candidates exist, it renders 2–3 buttons. Each button sets `#meal-input` to its
exact candidate and calls `document.querySelector("#meal-form").requestSubmit()`.
When `needsDescription` is true, it renders no candidate button and asks the
user to append recognizable ingredients, cuisine, or preparation details before
resubmitting. Replacing a previous panel must not duplicate content.

- [ ] **Step 5: Respect session-only external content**

At the start of `persistGeneratedPlan`:

```js
if (plan.source_persistence === "session_only") {
  plan.is_saved = false;
  plan.persistence_notice =
    "This sourced recipe is available in this session and was not stored.";
  return plan;
}
```

Do not call Supabase `.insert()` on this branch. Hide “Cook later” for session-only recipes and explain why.

- [ ] **Step 6: Render source attribution**

For `external` and `adapted` recipes, render:

```html
<p class="recipe-source-note">
  <span>Source recipe</span>
  <a target="_blank" rel="noopener noreferrer">Source title</a>
</p>
```

Use “Adapted from” / 「改編自」 when `source_type === "adapted"`. Escape title and URL, and accept only HTTPS source links before adding `href`.

For `ai_generated`, show “Generated by Chef Jarvis” without a fake source link.

- [ ] **Step 7: Add bilingual copy and styles**

Add translations for:

- “Which dish did you mean?”
- “Choose a dish so Jarvis does not guess.”
- “Add ingredients or cooking details so Jarvis can identify this custom dish.”
- “Source recipe”
- “Adapted from”
- “Generated by Chef Jarvis”
- “This sourced recipe is available in this session and was not stored.”
- the named-recipe unavailable error.

Style candidates as keyboard-focusable buttons and source attribution as secondary metadata. Error and clarification panels must remain readable on the existing mobile breakpoint.

- [ ] **Step 8: Run focused and full tests**

Run:

```bash
node --test --test-name-pattern="named recipe clarification|external recipes show provenance" tests/ui-contracts.test.mjs
npm test
npm run check
```

Expected: all tests pass.

- [ ] **Step 9: Commit only the UI task**

```bash
git add \
  public/app.js \
  public/chef-mode.js \
  public/styles.css \
  public/chef-mode.css \
  public/i18n.js \
  tests/ui-contracts.test.mjs
git commit -m "feat: show named recipe resolution states"
```

---

### Task 6: Add complete browser stories and release documentation

**Files:**
- Modify: `e2e/authenticated-smoke.spec.mjs`
- Modify: `.env.e2e.example`
- Modify: `README.md`
- Modify: `scripts/verify-deployment.mjs`
- Modify mechanically: `public/sw.js`
- Modify mechanically: `public/boot.js`
- Modify mechanically: version query strings in `public/index.html` and versioned public references.

**Interfaces:**
- Consumes: dedicated E2E account and mocked Edge/REST responses.
- Produces: repeatable browser acceptance for provider hit, clarification, exact AI result, and complete failure.

- [ ] **Step 1: Add a route-mocked authenticated named-recipe E2E test**

After signing in with the dedicated account, intercept:

```js
await page.route("**/functions/v1/chef-meal-plan", async (route) => {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      plan: {
        title: "肉燥飯",
        summary: "以豬絞肉和醬油慢燉的台式肉燥飯。",
        minutes: 35,
        servings: 2,
        kcal: 1100,
        protein_g: 45,
        carbs_g: 130,
        fat_g: 38,
        ingredients: [
          {
            name: "豬絞肉",
            usda_query: "ground pork",
            quantity: 300,
            unit: "g",
            preparation: "無需處理",
            category: "protein"
          },
          {
            name: "白米飯",
            usda_query: "cooked white rice",
            quantity: 400,
            unit: "g",
            preparation: "煮熟",
            category: "grain"
          }
        ],
        steps: [{
          instruction: "以中火拌炒豬絞肉 5 分鐘。",
          timers: [{
            label: "拌炒豬絞肉",
            kind: "cook",
            duration_seconds: 300
          }]
        }],
        substitutions: [],
        equipment_adaptations: [],
        reuse_ideas: [],
        source_type: "adapted",
        source_provider: "themealdb",
        source_title: "Lu Rou Fan",
        source_url: "https://example.test/lu-rou-fan",
        source_persistence: "session_only",
        canonical_dish_name: "肉燥飯",
        original_request: "肉燥飯"
      },
      meta: { outcome: "external_recipe" }
    }),
  });
});
```

Also intercept attempted recipe inserts and fail the test if one occurs. Submit 「肉燥飯」 and assert:

- title is 肉燥飯;
- source link is visible;
- no generic fallback notice is present;
- no recipe insert request occurs.

- [ ] **Step 2: Add clarification and exact-failure E2E stories**

Mock clarification:

```json
{
  "clarification_required": true,
  "original_request": "紅燒飯",
  "candidates": ["紅燒肉飯", "紅燒牛肉飯"],
  "meta": { "outcome": "dish_clarification_required" }
}
```

Assert both candidate buttons appear, selecting one resubmits that exact candidate, and no recipe is rendered before selection.

Also mock an unrecognized custom name with `needs_description: true` and an
empty candidate array. Assert the UI asks for ingredients or cooking details,
does not generate a recipe, and does not consume a persistence request.

Mock HTTP 503:

```json
{
  "error": "目前無法取得「肉燥飯」的完整食譜，請稍後再試。",
  "code": "named_recipe_unavailable",
  "meta": { "outcome": "generation_timeout" }
}
```

Assert the exact message appears and no unrelated recipe title, image, or plan persistence request occurs.

- [ ] **Step 3: Run browser tests**

Run:

```bash
npm run test:e2e
```

Expected: public smoke passes; named-recipe stories pass with E2E credentials or are explicitly skipped when the dedicated account variables are absent.

- [ ] **Step 4: Document provider setup and licensing gate**

Add to `README.md`:

```bash
npx supabase secrets set THEMEALDB_API_KEY=<supporter-key>
npx supabase secrets set THEMEALDB_PERSISTENCE_POLICY=session_only
```

Document:

- `session_only` is the safe default;
- `permanent` may be set only after written license review confirms storage, translation, adaptation, and replay rights;
- the development key `1` is not the production configuration;
- named requests never use broad fallback;
- expected outcomes and log fields;
- required smoke cases before release.

- [ ] **Step 5: Bump the function and PWA versions**

Change `FUNCTION_VERSION` in `chef-meal-plan/index.ts` to the next named-recipe release identifier, then run:

```bash
npm run pwa:version
npm run check
```

Expected: public asset references, `boot.js`, and `sw.js` share one new version and `npm run check` passes.

- [ ] **Step 6: Run the complete verification matrix**

Run:

```bash
npm test
npm run check
npm run test:e2e
```

Expected:

- all Node tests pass;
- public syntax and PWA consistency checks pass;
- public Playwright tests pass;
- authenticated tests pass with credentials or report only documented skips.

- [ ] **Step 7: Commit the release-facing changes**

```bash
git add \
  e2e/authenticated-smoke.spec.mjs \
  .env.e2e.example \
  README.md \
  scripts/verify-deployment.mjs \
  supabase/functions/chef-meal-plan/index.ts \
  public/sw.js \
  public/boot.js \
  public/index.html \
  public
git commit -m "test: cover named recipe resolution"
```

Before committing, inspect `git diff --cached --name-only` and unstage any unrelated pre-existing public change. Because `git add public` is broad, prefer enumerating the exact mechanically versioned files shown by `npm run pwa:version`.

---

### Task 4 rejection-closure report — 2026-07-18

- Added deterministic restriction scanning for ingredient names and USDA queries,
  substitution `from`/`to`/USDA queries, recipe instructions, and substitution
  step updates. The returned restriction failure remains generic.
- Named-dish resolutions now carry bounded `coreIngredientGroups` and
  `coreTechniqueTerms`. The resolver prompt requests those markers as data;
  curated 肉燥飯 aliases include ground/minced-pork and braising evidence.
- A named result must now pass title, core ingredient, and technique checks
  after both the first parse and a repair parse. Missing trustworthy evidence
  is fatal, so an unavailable resolver/provider cannot turn a named request
  into a title-only unrelated plan. A verified provider can contribute bounded
  server-owned ingredient/technique evidence when present.
- TheMealDB image URLs are accepted only over HTTPS from `themealdb.com` or a
  subdomain; arbitrary provider image hosts are rejected.

Focused RED cases initially failed for absent core fields, instruction-only
restriction leakage, and missing provider image host validation. GREEN passed:

```bash
node --test tests/dish-resolver.test.mjs tests/named-recipe-pipeline.test.mjs tests/ui-contracts.test.mjs
npm test
npm run check
git diff --check
```

Availability tradeoff: a recognizable named dish without resolver core markers
and without sufficiently descriptive verified provider evidence now fails with
the existing dish-specific unavailable response instead of risking a different
dish. This is intentional fail-closed behavior.

### Task 4 follow-up review closure — 2026-07-18

- Generation, repair, resolver, provider, and identity-verifier calls are all
  bounded with `deadlineTimeout(..., REFUND_RESERVE_MS)`. Quota refunds are
  centralized in `refundQuotaSafely`: local quota state clears before the
  attempt, a reserved-time RPC is tried, and a failed/deadline attempt gets an
  idempotent `EdgeRuntime.waitUntil` retry when the runtime provides it. The
  helper suppresses refund errors so the normal controlled response still wins.
- Resolver core evidence now declares provenance (`curated`, `provider`,
  `model_hint`, or `none`). Curated evidence remains locally validated;
  provider evidence overrides model hints and requires overlap with a
  meaningful server-owned source ingredient. Arbitrary named dishes require a
  separate model verifier, using compact sanitized recipe data and accepting
  only strict same-dish, >=0.95-confidence, no-missing-core responses.
- Canonical correction now permits only curated Han aliases and conservative
  aligned Latin token typos. Clarification options are independently tied to
  the supplied label, so unrelated suggestions are removed.
- Halal labels are excluded from literal matching after dedicated pork/lard/
  alcohol enforcement. Explicit plant-based analogues and specified plant
  milks pass vegan/vegetarian or dairy checks respectively, while other
  independent allergy families remain enforced.

Focused RED tests initially failed for semantic substitutions, unrelated
clarification candidates, absent evidence provenance, unsafe deadline use,
and missing verifier/provider checks. GREEN passed `npm test`, `npm run check`,
and `git diff --check`. `npx deno check --node-modules-dir=auto` is available
and resolved the Edge dependency, but reports 29 existing project-wide typing
errors from untyped Supabase queries/RPCs and pre-existing timer/image typing;
the Node-based checks do not type-check the Edge function.

### Task 4 final review closure — 2026-07-18

- Provider evidence now needs two distinct, non-generic source-ingredient
  overlaps with distinct generated ingredients. A lone shared protein is not
  proof; weak provider evidence proceeds to the independent identity verifier
  after structural, restriction, and title checks instead of failing solely on
  overlap. Curated evidence remains locally sufficient.
- Provider title, ingredients, and instructions are bounded and serialized as
  JSON behind an explicit untrusted-data/never-instructions prompt boundary;
  provider text is not logged.
- Vegan and vegetarian analogue handling is term-specific. A plant-based
  chicken analogue can suppress its chicken match but cannot suppress butter,
  egg, dairy, or another animal ingredient in the same field. English term
  matching now uses positive word-bounded matches, retaining `*-free` safety.
- The Edge function now passes direct Deno type-checking. It uses a portable
  timeout handle type, typed recipe timers/image candidates, minimal Supabase
  result and row shapes, a typed RPC wrapper, and bounded promise races with
  abort signals where the query supports them. Runtime validation remains
  unchanged.

Focused RED cases covered lone-beef provider overlap, plant-based analogue
masking, weak-provider verifier wiring, and provider prompt isolation. GREEN
verification passed `npm test` (133 tests), `npm run check`,
`npx -y deno check --node-modules-dir=auto supabase/functions/chef-meal-plan/index.ts`,
and `git diff --check`. No staging or commit was performed.

### Task 5 rejection-closure report — 2026-07-18

- Session-only recipes remain cookable in the active tab, but guided-cooking
  snapshots now remove/skip local state and return before cloud session writes.
- Local and cloud restoration ignore stale session-only snapshots. Switching
  from a persistent cooking session first closes that persistent session, then
  starts the session-only recipe with no saved recipe ID and no persistence.
- Client image allowlists now accept TheMealDB alongside Wikimedia while still
  requiring HTTPS and an approved host.
- Executable/source contracts assert that session-only guards precede
  `localStorage.setItem` and `cooking_sessions` access; tests also cover the
  recipes insert guard and the client image allowlist.

No commit or staging was performed. Browser E2E was not rerun in this focused
rejection-closure pass; the Node suite and syntax/PWA checks above passed.

### Task 5 final review closure — 2026-07-18

- Normal and permanent generated plans now render only in memory. Generation
  never inserts a recipe, so an account switch while a request is pending
  cannot commit the returned plan.
- “Cook later” is the sole generated-plan insert path. It captures the current
  user and Chef-state epoch, registers an abort controller for auth reset,
  writes the immutable owner directly as `is_saved: true`, and ignores stale
  contexts without changing the rendered controls or showing a toast.
- Unsaved permanent plans show explicit “Not saved yet” controls and explain
  that they are lost on refresh until saved. They may still start in-memory
  guided cooking; cloud progress may use a null recipe ID until then.
- Session-only completion performs no pantry deduction or database operation;
  its completion message states that nothing was saved or changed. Its voice
  tip dismissal now stays only in memory and is reset with auth/state reset.
- UI contracts cover the no-insert generation path, explicit save ownership and
  cancellation wiring, session-only completion, and session-only voice-tip
  storage isolation.

---

### Task 7: Verify the production release without consuming real user data

**Files:**
- No source changes unless verification exposes a defect.

**Interfaces:**
- Consumes: deployed Cloudflare Pages assets, deployed `chef-meal-plan`, TheMealDB secret, and a disposable test account.
- Produces: release evidence for exact dish, provider miss, clarification, and failure behavior.

- [ ] **Step 1: Review the final diff before deployment**

Run:

```bash
git status --short
git diff --check
git diff --stat HEAD~6..HEAD
```

Expected: no whitespace errors; every change belongs to named-recipe resolution or previously approved workspace work.

- [ ] **Step 2: Deploy the required Supabase configuration**

Using the exact project reference already linked in the repository:

```bash
npx supabase functions deploy chef-meal-plan
```

Set secrets through Supabase secret management, never through tracked files. Apply `THEMEALDB_PERSISTENCE_POLICY=session_only` until license review is recorded.

- [ ] **Step 3: Deploy the matching public assets**

Deploy the same commit whose function version and public asset version were verified locally. Do not claim completion while production hashes differ from local files.

- [ ] **Step 4: Run deployment verification**

Run:

```bash
npm run verify:deployment
```

Expected: public hashes and `X-Chef-Jarvis-Function-Version` match local source.

- [ ] **Step 5: Run disposable-account smoke cases**

Verify:

1. A TheMealDB-known English dish shows external source attribution.
2. 「肉燥飯」 never becomes a vegetable bowl; provider miss reaches same-dish Gemini generation.
3. An ambiguous typo displays candidates and creates no recipe.
4. Forced provider/model failure returns the original dish-specific error and refunds quota.
5. A broad request can still use labeled fallback.

Do not use a personal production account for mutation cases.

- [ ] **Step 6: Inspect Edge logs**

Confirm logs contain request ID, provider outcome, model attempt, validation disposition, stage durations, and final outcome. Confirm they do not contain raw profile, allergies, tokens, API keys, or full recipe content.

- [ ] **Step 7: Run verification-before-completion**

Invoke `superpowers:verification-before-completion`, rerun the relevant automated commands, and report only observed results. Do not claim that every named dish is guaranteed by a finite database; claim the approved behavior:

> Every recognizable named-dish request returns the same dish through provider or Gemini, asks for clarification when ambiguous, or fails explicitly without substitution.
