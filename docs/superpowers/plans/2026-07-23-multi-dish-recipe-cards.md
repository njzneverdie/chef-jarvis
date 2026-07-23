# Multi-Dish Recipe Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Chef Jarvis recognize two to six explicitly separated dish names, generate and validate each dish independently, and render one independently actionable recipe card per dish.

**Architecture:** Add a pure menu-request parser and a pure bounded-concurrency menu orchestrator under `supabase/functions/_shared`. Refactor the Edge Function's single named-recipe pipeline into one reusable item generator, then call it once for a single dish or up to six times for a menu while sharing one authenticated profile, one quota operation, and one deadline. Extend the final allergen egress gate and browser state to understand `recipes[].plan`, while preserving the current single-plan response contract.

**Tech Stack:** Vanilla JavaScript browser client, Supabase Edge Functions on Deno/TypeScript, Supabase RPC quota enforcement, Gemini REST API, Node built-in test runner, Deno tests, Cloudflare Pages static hosting.

## Global Constraints

- A menu contains two to six unique, non-empty dish names after Unicode and whitespace normalization.
- Recognized separators are `、`, `，`, `,`, `；`, `;`, newlines, `＋`, and `+`.
- Natural-language `和`, `與`, and `and` never split a dish name.
- A non-empty dish item longer than 160 characters returns `400 invalid_menu_item`; seven or more unique items return `400 menu_too_large`.
- Single-dish `{ plan }` and clarification responses remain backward compatible.
- Menu item statuses are exactly `ready`, `clarification_required`, and `unavailable`.
- Failed or clarification items never contain `plan`, `ingredients`, or `steps`.
- At most three menu dishes generate concurrently; all work shares the request deadline.
- One menu submission consumes one planning quota operation.
- Every ready item passes dish identity, completeness, dietary restriction, and allergen validation independently.
- Final response serialization rechecks every `recipes[].plan`; unsafe content fails closed.
- Do not add hard-coded aliases for the example dishes.
- Do not add a permanent menu table or support concurrent Chef Mode sessions.

---

### Task 1: Parse Explicit Multi-Dish Requests

**Files:**
- Create: `supabase/functions/_shared/menu-request.js`
- Create: `tests/menu-request.test.mjs`
- Test: `tests/dish-resolver.test.mjs`

**Interfaces:**
- Produces: `parseMenuRequest(value, { maximumItems = 6, maximumItemLength = 160 } = {})`.
- Produces: `{ kind: "single", originalRequest, dishes: [string] }`, `{ kind: "menu", originalRequest, dishes: string[] }`, or `{ kind: "invalid", originalRequest, dishes: string[], code: "menu_too_large" | "invalid_menu_item" }`.
- `classifyMealRequest` continues to produce only `named_dish` or `broad_request` for one dish; menu routing happens before `baselineDishResolution`.

- [ ] **Step 1: Write failing parser tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { parseMenuRequest } from "../supabase/functions/_shared/menu-request.js";

test("parses explicit menu separators without dish-name knowledge", () => {
  for (const request of [
    "宮保雞丁、排骨蛋炒飯、炒高麗菜",
    "宮保雞丁，排骨蛋炒飯，炒高麗菜",
    "宮保雞丁, 排骨蛋炒飯, 炒高麗菜",
    "宮保雞丁；排骨蛋炒飯；炒高麗菜",
    "宮保雞丁\n排骨蛋炒飯\n炒高麗菜",
    "宮保雞丁＋排骨蛋炒飯+炒高麗菜",
  ]) {
    assert.deepEqual(parseMenuRequest(request), {
      kind: "menu",
      originalRequest: request,
      dishes: ["宮保雞丁", "排骨蛋炒飯", "炒高麗菜"],
    });
  }
});

test("keeps conjunction-based dish names single", () => {
  for (const request of ["mac and cheese", "fish and chips", "牛肉與青椒炒飯"]) {
    assert.deepEqual(parseMenuRequest(request), {
      kind: "single",
      originalRequest: request,
      dishes: [request],
    });
  }
});

test("normalizes, removes empty entries, and deduplicates", () => {
  assert.deepEqual(parseMenuRequest("  麻婆豆腐、、麻婆豆腐；炒高麗菜；  "), {
    kind: "menu",
    originalRequest: "麻婆豆腐、、麻婆豆腐；炒高麗菜；",
    dishes: ["麻婆豆腐", "炒高麗菜"],
  });
});

test("rejects oversized menus and oversized items", () => {
  assert.equal(
    parseMenuRequest("一、二、三、四、五、六、七").code,
    "menu_too_large",
  );
  assert.equal(
    parseMenuRequest(`${"菜".repeat(161)}、麻婆豆腐`).code,
    "invalid_menu_item",
  );
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run:

```bash
node --test tests/menu-request.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `_shared/menu-request.js`.

- [ ] **Step 3: Implement the pure parser**

```js
const explicitMenuSeparator = /[、，,；;\n\r＋+]+/u;

function clean(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseMenuRequest(
  value,
  { maximumItems = 6, maximumItemLength = 160 } = {},
) {
  const originalRequest = clean(value);
  const rawItems = originalRequest.split(explicitMenuSeparator);
  const dishes = [];
  const identities = new Set();
  for (const rawItem of rawItems) {
    const dish = clean(rawItem).replace(/^[.!！?？:：\s]+|[.!！?？:：\s]+$/g, "");
    if (!dish) continue;
    if (dish.length > maximumItemLength) {
      return {
        kind: "invalid",
        originalRequest,
        dishes,
        code: "invalid_menu_item",
      };
    }
    const identity = dish.toLocaleLowerCase();
    if (identities.has(identity)) continue;
    identities.add(identity);
    dishes.push(dish);
  }
  if (dishes.length > maximumItems) {
    return {
      kind: "invalid",
      originalRequest,
      dishes,
      code: "menu_too_large",
    };
  }
  return {
    kind: dishes.length > 1 ? "menu" : "single",
    originalRequest,
    dishes: dishes.length ? dishes : [originalRequest],
  };
}
```

- [ ] **Step 4: Add resolver regression coverage**

Add to `tests/dish-resolver.test.mjs`:

```js
test("the single-dish resolver never treats a full menu as one canonical dish", () => {
  const menu = parseMenuRequest("宮保雞丁、排骨蛋炒飯、炒高麗菜");
  assert.equal(menu.kind, "menu");
  assert.deepEqual(
    menu.dishes.map((dish) => baselineDishResolution(dish).canonicalName),
    ["宮保雞丁", "排骨蛋炒飯", "炒高麗菜"],
  );
});
```

Import `parseMenuRequest` from `menu-request.js`. Do not change `classifyMealRequest`; the handler must call `parseMenuRequest` before the resolver.

- [ ] **Step 5: Run parser and resolver tests**

Run:

```bash
node --test tests/menu-request.test.mjs tests/dish-resolver.test.mjs
```

Expected: all parser and resolver tests PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/menu-request.js tests/menu-request.test.mjs tests/dish-resolver.test.mjs
git commit -m "feat: parse multi-dish menu requests"
```

---

### Task 2: Orchestrate Menu Items with Bounded Concurrency

**Files:**
- Create: `supabase/functions/_shared/menu-generation.js`
- Create: `tests/menu-generation.test.mjs`

**Interfaces:**
- Consumes: ordered `dishes: string[]`.
- Consumes: `worker(dish, index): Promise<MenuRecipeItem>`.
- Produces: `generateMenuItems(dishes, worker, { concurrency = 3 } = {})`.
- Produces: `buildMenuResponse(originalRequest, recipes, requestMeta)`.
- `MenuRecipeItem` is one of:
  - `{ requested_dish, status: "ready", plan, meta? }`
  - `{ requested_dish, status: "clarification_required", needs_description, candidates, message?, meta? }`
  - `{ requested_dish, status: "unavailable", code, message, meta? }`

- [ ] **Step 1: Write failing orchestration tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMenuResponse,
  generateMenuItems,
} from "../supabase/functions/_shared/menu-generation.js";

test("preserves input order while limiting concurrent workers", async () => {
  let active = 0;
  let maximumActive = 0;
  const dishes = ["A", "B", "C", "D", "E", "F"];
  const results = await generateMenuItems(dishes, async (dish) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setTimeout(resolve, dish === "A" ? 8 : 1));
    active -= 1;
    return { requested_dish: dish, status: "ready", plan: { title: dish } };
  });
  assert.equal(maximumActive, 3);
  assert.deepEqual(results.map((item) => item.requested_dish), dishes);
});

test("converts thrown item failures into plan-free unavailable entries", async () => {
  const [result] = await generateMenuItems(["麻婆豆腐"], async () => {
    const error = new Error("raw provider response");
    error.code = "named_recipe_unavailable";
    error.safeMessage = "目前無法取得完整食譜，請稍後再試。";
    error.meta = { failure_stage: "repair_validation", failure_reason: "recipe_schema" };
    throw error;
  });
  assert.deepEqual(result, {
    requested_dish: "麻婆豆腐",
    status: "unavailable",
    code: "named_recipe_unavailable",
    message: "目前無法取得完整食譜，請稍後再試。",
    meta: {
      failure_stage: "repair_validation",
      failure_reason: "recipe_schema",
    },
  });
  assert.equal("plan" in result, false);
});

test("builds deterministic menu totals", () => {
  const recipes = [
    { requested_dish: "A", status: "ready", plan: { title: "A" } },
    { requested_dish: "B", status: "clarification_required", candidates: [] },
    { requested_dish: "C", status: "unavailable", code: "named_recipe_unavailable", message: "Retry." },
  ];
  assert.deepEqual(
    buildMenuResponse("A、B、C", recipes, { request_id: "request-1" }).meta,
    {
      request_id: "request-1",
      requested_count: 3,
      ready_count: 1,
      clarification_count: 1,
      failed_count: 1,
    },
  );
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run:

```bash
node --test tests/menu-generation.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `_shared/menu-generation.js`.

- [ ] **Step 3: Implement ordered bounded concurrency and safe failures**

```js
function safeDiagnostic(meta) {
  return {
    failure_stage: String(meta?.failure_stage || "unknown").slice(0, 80),
    failure_reason: String(meta?.failure_reason || "recipe_schema").slice(0, 80),
  };
}

function unavailableItem(dish, error) {
  return {
    requested_dish: dish,
    status: "unavailable",
    code: String(error?.code || "named_recipe_unavailable").slice(0, 80),
    message: String(error?.safeMessage || "A complete recipe is unavailable right now. Please try again.").slice(0, 300),
    meta: safeDiagnostic(error?.meta),
  };
}

export async function generateMenuItems(
  dishes,
  worker,
  { concurrency = 3 } = {},
) {
  const results = Array(dishes.length);
  let nextIndex = 0;
  const runners = Array.from(
    { length: Math.min(Math.max(1, concurrency), dishes.length) },
    async () => {
      while (nextIndex < dishes.length) {
        const index = nextIndex;
        nextIndex += 1;
        try {
          results[index] = await worker(dishes[index], index);
        } catch (error) {
          results[index] = unavailableItem(dishes[index], error);
        }
      }
    },
  );
  await Promise.all(runners);
  return results;
}

export function buildMenuResponse(originalRequest, recipes, requestMeta = {}) {
  const readyCount = recipes.filter((item) => item.status === "ready").length;
  const clarificationCount = recipes.filter(
    (item) => item.status === "clarification_required",
  ).length;
  return {
    request_type: "menu",
    original_request: originalRequest,
    recipes,
    meta: {
      ...requestMeta,
      requested_count: recipes.length,
      ready_count: readyCount,
      clarification_count: clarificationCount,
      failed_count: recipes.length - readyCount - clarificationCount,
    },
  };
}
```

- [ ] **Step 4: Run orchestration tests**

Run:

```bash
node --test tests/menu-generation.test.mjs
```

Expected: all menu orchestration tests PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/menu-generation.js tests/menu-generation.test.mjs
git commit -m "feat: orchestrate menu recipe items"
```

---

### Task 3: Extend the Allergen Egress Gate to Menu Responses

**Files:**
- Modify: `supabase/functions/_shared/named-recipe-integrity.js`
- Modify: `tests/named-recipe-pipeline.test.mjs`
- Modify: `tests/edge/meal-plan-response-boundary.test.ts`

**Interfaces:**
- Consumes: singular `{ plan }` responses and menu `{ request_type: "menu", recipes: MenuRecipeItem[] }` responses.
- Produces: the unchanged safe response body.
- Throws `Meal plan response failed allergen egress validation.` for malformed menu item schemas or any unsafe ready plan.
- Non-ready menu items must not carry a `plan` key.

- [ ] **Step 1: Add failing Node tests for every menu status**

```js
test("the egress gate validates every ready menu recipe", () => {
  const gate = namedRecipeIntegrity.mealPlanResponseAllergenGate;
  const safePlan = {
    ingredients: [{ name: "Rice", usda_query: "white rice" }],
  };
  const body = {
    request_type: "menu",
    recipes: [
      { requested_dish: "白飯", status: "ready", plan: safePlan },
      {
        requested_dish: "未知料理",
        status: "clarification_required",
        candidates: [],
      },
      {
        requested_dish: "失敗料理",
        status: "unavailable",
        code: "named_recipe_unavailable",
        message: "Retry.",
      },
    ],
  };
  assert.equal(gate(body, gateProfile(["peanut"])), body);
});

test("the egress gate rejects an allergen in any ready menu recipe", () => {
  assert.throws(
    () => namedRecipeIntegrity.mealPlanResponseAllergenGate({
      request_type: "menu",
      recipes: [
        {
          requested_dish: "花生麵",
          status: "ready",
          plan: {
            ingredients: [{ name: "花生醬", usda_query: "peanut butter" }],
          },
        },
      ],
    }, gateProfile(["peanut"])),
    /allergen egress/i,
  );
});

test("non-ready menu items cannot smuggle a plan", () => {
  for (const status of ["clarification_required", "unavailable"]) {
    assert.throws(
      () => namedRecipeIntegrity.mealPlanResponseAllergenGate({
        request_type: "menu",
        recipes: [{
          requested_dish: "dish",
          status,
          plan: { ingredients: [] },
        }],
      }, gateProfile([])),
      /allergen egress/i,
      status,
    );
  }
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
node --test --test-name-pattern="menu recipe|menu items" tests/named-recipe-pipeline.test.mjs
```

Expected: FAIL because bodies without a top-level `plan` currently bypass the gate.

- [ ] **Step 3: Refactor the gate around one plan validator**

Inside `mealPlanResponseAllergenGate`, define and reuse:

```js
const validatePlan = (plan) => {
  if (
    !plan ||
    typeof plan !== "object" ||
    Array.isArray(plan) ||
    !Array.isArray(plan.ingredients) ||
    !plan.ingredients.every((ingredient) =>
      ingredient &&
      typeof ingredient === "object" &&
      !Array.isArray(ingredient) &&
      typeof ingredient.name === "string" &&
      typeof ingredient.usda_query === "string"
    )
  ) {
    throw new Error("Meal plan response failed allergen egress validation.");
  }
  const reason = recipeRestrictionRejectionReason(plan, {
    allergies: profile.allergies,
    dietary_preferences: medicalDietaryPreferences,
  });
  if (reason) {
    throw new Error("Meal plan response failed allergen egress validation.");
  }
};
```

Route response bodies with this exact decision order:

```js
const hasPlan = Object.prototype.hasOwnProperty.call(body, "plan");
const isMenu = body?.request_type === "menu";
if (!hasPlan && !isMenu) return body;
validateProfile();
if (hasPlan) {
  validatePlan(body.plan);
  return body;
}
if (!Array.isArray(body.recipes) || !body.recipes.length) {
  throw new Error("Meal plan response failed allergen egress validation.");
}
for (const item of body.recipes) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    throw new Error("Meal plan response failed allergen egress validation.");
  }
  if (item.status === "ready") {
    validatePlan(item.plan);
  } else if (
    !["clarification_required", "unavailable"].includes(item.status) ||
    Object.prototype.hasOwnProperty.call(item, "plan")
  ) {
    throw new Error("Meal plan response failed allergen egress validation.");
  }
}
return body;
```

Keep the medical dietary preference filter exactly equivalent to the current gate.

- [ ] **Step 4: Add a Deno boundary test**

Add a handler case to `tests/edge/meal-plan-response-boundary.test.ts` that passes a menu containing a safe ready item and an unavailable item, then assert the returned response contains both. Add a second case with peanut in one ready plan and assert a rejected response rather than serialized ingredients.

- [ ] **Step 5: Run Node and Edge safety tests**

Run:

```bash
node --test tests/named-recipe-pipeline.test.mjs
npm run test:edge
```

Expected: all named-recipe and Edge response-boundary tests PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/named-recipe-integrity.js tests/named-recipe-pipeline.test.mjs tests/edge/meal-plan-response-boundary.test.ts
git commit -m "feat: gate menu recipes for allergens"
```

---

### Task 4: Refactor and Batch the Edge Recipe Pipeline

**Files:**
- Modify: `supabase/functions/chef-meal-plan/index.ts`
- Modify: `supabase/functions/_shared/prompt-boundary.js`
- Modify: `tests/named-recipe-pipeline.test.mjs`
- Modify: `tests/prompt-boundary.test.mjs`
- Modify: `tests/quota-refund.test.mjs`

**Interfaces:**
- Consumes: `parseMenuRequest(meal)`.
- Consumes: `generateMenuItems(dishes, worker, { concurrency: 3 })`.
- Produces internally: `generateNamedRecipeItem(context): Promise<MenuRecipeItem>`.
- `generateNamedRecipeItem` never calls `respond` or `safeRespond`; it returns an item result or throws an error carrying only `code`, `safeMessage`, and fixed diagnostic `meta`.
- Single named dishes call the same `generateNamedRecipeItem` used by menu dishes.
- Broad requests continue through the current broad-request model and fallback flow.

- [ ] **Step 1: Add failing source-contract and prompt tests**

Add to `tests/named-recipe-pipeline.test.mjs`:

```js
test("the Edge function routes explicit menus before single-dish resolution", async () => {
  const edge = await readFile(
    new URL("../supabase/functions/chef-meal-plan/index.ts", import.meta.url),
    "utf8",
  );
  assert.match(edge, /parseMenuRequest\(meal\)/);
  assert.match(edge, /generateMenuItems\(/);
  assert.match(edge, /async function generateNamedRecipeItem\(/);
  assert.match(edge, /concurrency:\s*3/);
  assert.ok(
    edge.indexOf("parseMenuRequest(meal)") <
      edge.indexOf("baselineDishResolution("),
  );
});

test("one menu request consumes quota once and serializes once", async () => {
  const edge = await readFile(
    new URL("../supabase/functions/chef-meal-plan/index.ts", import.meta.url),
    "utf8",
  );
  const menuBranch = edge.slice(
    edge.indexOf('mealRequest.kind === "menu"'),
    edge.indexOf('mealRequest.kind === "single"'),
  );
  assert.equal(
    menuBranch.match(/consume_chef_meal_plan_quota/g)?.length,
    1,
  );
  assert.equal(menuBranch.match(/safeRespond\(/g)?.length, 1);
});
```

Add to `tests/prompt-boundary.test.mjs`:

```js
test("each menu item uses an isolated named-dish prompt boundary", () => {
  const envelope = recipeRequestPromptEnvelope({
    resolution: baselineDishResolution("麻婆豆腐"),
    userRequest: "宮保雞丁、麻婆豆腐",
  });
  assert.match(envelope, /"request_type":"named_dish"/);
  assert.match(envelope, /"canonical_dish_name":"麻婆豆腐"/);
  assert.doesNotMatch(envelope, /宮保雞丁/);
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
node --test --test-name-pattern="explicit menus|menu request|menu item" tests/named-recipe-pipeline.test.mjs tests/prompt-boundary.test.mjs
```

Expected: FAIL because the parser, batch orchestration, and reusable item function are not wired into the Edge Function.

- [ ] **Step 3: Add imports and menu result types**

Add imports:

```ts
import { parseMenuRequest } from "../_shared/menu-request.js";
import {
  buildMenuResponse,
  generateMenuItems,
} from "../_shared/menu-generation.js";
```

Add types near `DishResolution`:

```ts
type ReadyMenuRecipeItem = {
  requested_dish: string;
  status: "ready";
  plan: MealPlan;
  model: string;
  meta: Record<string, unknown>;
};

type ClarificationMenuRecipeItem = {
  requested_dish: string;
  status: "clarification_required";
  needs_description: boolean;
  candidates: string[];
  message?: string;
  meta: Record<string, unknown>;
};

type UnavailableMenuRecipeItem = {
  requested_dish: string;
  status: "unavailable";
  code: "named_recipe_unavailable";
  message: string;
  meta: {
    failure_stage: string;
    failure_reason: string;
  };
};

type MenuRecipeItem =
  | ReadyMenuRecipeItem
  | ClarificationMenuRecipeItem
  | UnavailableMenuRecipeItem;
```

- [ ] **Step 4: Extract the single named-dish worker before `Deno.serve`**

Move the current named-dish resolution, provider lookup, prompt construction, model attempts, repair loop, identity verification, provenance attachment, and diagnostics into:

```ts
async function generateNamedRecipeItem({
  meal,
  language,
  profile,
  planningProfile,
  pantry,
  recentMeals,
  apiKey,
  theMealDbKey,
  sourcePersistence,
  requestId,
  requestStartedAt,
  deadlineAt,
}: {
  meal: string;
  language: "en" | "zh-TW";
  profile: Profile;
  planningProfile: Profile & { taste_feedback: unknown[] };
  pantry: PantryItem[];
  recentMeals: RecentMeal[];
  apiKey: string;
  theMealDbKey: string;
  sourcePersistence: RecipePersistence;
  requestId: string;
  requestStartedAt: number;
  deadlineAt: number;
}): Promise<MenuRecipeItem> {
  let latestFailure = {
    outcome: "generation_validation_failed" as
      | "generation_timeout"
      | "generation_validation_failed",
    stage: "unknown",
    reason: "recipe_schema",
  };
  const recordFailure = (stage: string, reason: string) => {
    const preferred = preferNamedFailureDiagnostic(
      { stage: latestFailure.stage, reason: latestFailure.reason },
      { stage, reason },
    );
    latestFailure = { ...latestFailure, ...preferred };
  };

  let resolution = baselineDishResolution(meal) as unknown as DishResolution;
  // Relocate the resolver call and its chef_dish_resolution diagnostic here.
  // Relocate the clarification branch here and return status "clarification_required".
  // Relocate provider lookup and providerCoreIdentityEvidence here.
  // Relocate prompt construction, model attempts, repair, identity verification,
  // provenance attachment, and chef_recipe_generation diagnostics here.
  // Replace the successful safeRespond call with a ReadyMenuRecipeItem return.
  // Replace completeNamedFailure with an UnavailableMenuRecipeItem return.
}
```

The relocation must make these exact return substitutions:

```ts
return {
  requested_dish: meal,
  status: "clarification_required",
  needs_description: resolution.needsDescription,
  candidates: resolution.clarificationCandidates,
  message: resolution.needsDescription
    ? language === "zh-TW"
      ? "請在原菜名中補充可辨識的食材、風格或作法。"
      : "Please add recognizable ingredients, style, or preparation details to the original name."
    : undefined,
  meta: {
    outcome: "dish_clarification_required",
    duration_ms: Date.now() - requestStartedAt,
  },
};
```

```ts
return {
  requested_dish: meal,
  status: "ready",
  plan,
  model,
  meta: {
    prompt_version: PROMPT_VERSION,
    duration_ms: Date.now() - requestStartedAt,
    image_found: Boolean(plan.image),
  },
};
```

```ts
return {
  requested_dish: meal,
  status: "unavailable",
  code: "named_recipe_unavailable",
  message: language === "zh-TW"
    ? `目前無法取得「${meal}」的完整食譜，請稍後再試。`
    : `A complete recipe for "${meal}" is unavailable right now. Please try again.`,
  meta: {
    failure_stage: latestFailure.stage,
    failure_reason: latestFailure.reason,
  },
};
```

Do not place raw model text, canonical names, profile fields, or provider content in returned diagnostics.

- [ ] **Step 5: Route the handler by parsed request kind**

Immediately after validating non-empty `meal`, add:

```ts
const mealRequest = parseMenuRequest(meal);
if (mealRequest.kind === "invalid") {
  return safeRespond({
    error: mealRequest.code === "menu_too_large"
      ? language === "zh-TW"
        ? "一次最多可規劃六道菜，請縮短菜單後再試。"
        : "Plan up to six dishes at a time."
      : language === "zh-TW"
        ? "其中一道菜名過長，請縮短後再試。"
        : "One dish name is too long.",
    code: mealRequest.code,
  }, 400);
}
```

After profile, pantry, recent meals, API keys, and one successful quota allowance are available, add the menu branch:

```ts
if (mealRequest.kind === "menu") {
  const recipes = await generateMenuItems(
    mealRequest.dishes,
    (dish) => generateNamedRecipeItem({
      meal: dish,
      language,
      profile,
      planningProfile,
      pantry,
      recentMeals,
      apiKey,
      theMealDbKey,
      sourcePersistence,
      requestId,
      requestStartedAt,
      deadlineAt,
    }),
    { concurrency: 3 },
  ) as MenuRecipeItem[];
  const body = buildMenuResponse(mealRequest.originalRequest, recipes, {
    request_id: requestId,
    prompt_version: PROMPT_VERSION,
    duration_ms: Date.now() - requestStartedAt,
  });
  const readyCount = body.meta.ready_count;
  const response = safeRespond(body, readyCount > 0 ||
      body.meta.clarification_count > 0 ? 200 : 503);
  if (readyCount > 0) quotaRequestId = null;
  console.log("chef_meal_plan_completed", {
    request_id: requestId,
    prompt_version: PROMPT_VERSION,
    outcome: readyCount > 0 ? "menu_generated" : "menu_unavailable",
    requested_count: body.meta.requested_count,
    ready_count: readyCount,
    clarification_count: body.meta.clarification_count,
    failed_count: body.meta.failed_count,
    duration_ms: body.meta.duration_ms,
  });
  return response;
}
```

If `ready_count === 0`, execute the current idempotent refund before returning. If at least one ready plan exists, clear `quotaRequestId` before the outer catch can refund.

For `mealRequest.kind === "single"`:

- Pass `mealRequest.dishes[0]` to `baselineDishResolution`.
- For a named dish, call `generateNamedRecipeItem`, translate `ready` back to `{ plan, model, meta }`, translate `clarification_required` back to the current top-level clarification contract, and translate `unavailable` through `completeNamedFailure`.
- For a broad request, keep the broad prompt and fallback behavior unchanged.

- [ ] **Step 6: Add quota and response-path tests**

Extend `tests/quota-refund.test.mjs` with one menu success case and one all-failed menu case. Assert:

```js
assert.equal(success.consumeCalls, 1);
assert.equal(success.refundCalls, 0);
assert.equal(allFailed.consumeCalls, 1);
assert.equal(allFailed.refundCalls, 1);
```

Extend `tests/named-recipe-pipeline.test.mjs` to assert every menu return passes through `safeRespond` once and every item generation path returns an item rather than a `Response`.

- [ ] **Step 7: Run the Edge-focused suite**

Run:

```bash
node --test tests/menu-request.test.mjs tests/menu-generation.test.mjs tests/prompt-boundary.test.mjs tests/quota-refund.test.mjs tests/named-recipe-pipeline.test.mjs
npm run test:edge
npx deno check supabase/functions/chef-meal-plan/index.ts
```

Expected: all focused Node tests PASS, all Edge tests PASS, and Deno type-check exits 0.

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/chef-meal-plan/index.ts supabase/functions/_shared/prompt-boundary.js tests/named-recipe-pipeline.test.mjs tests/prompt-boundary.test.mjs tests/quota-refund.test.mjs
git commit -m "feat: generate independent menu recipes"
```

---

### Task 5: Normalize Menu Responses and Manage Browser State

**Files:**
- Modify: `public/chef-mode.js`
- Modify: `tests/ui-contracts.test.mjs`

**Interfaces:**
- `generatePlan(request)` produces `{ kind: "menu", ownerUserId, generationEpoch, originalRequest, recipes, meta }`.
- `menuPlanResults` holds only the current authenticated generation context.
- `renderMenuPlanCards(result)` renders cards without changing `currentPlan`.
- Opening a ready card calls `renderPlan(plan)`; only then does that recipe become `currentPlan`.

- [ ] **Step 1: Add failing UI contract tests**

```js
test("menu generation normalizes independent ready and failed recipes", async () => {
  const chefMode = await readFile(new URL("chef-mode.js", publicUrl), "utf8");
  assert.match(chefMode, /let menuPlanResults = \[\]/);
  assert.match(chefMode, /data\.request_type === "menu"/);
  assert.match(chefMode, /kind: "menu"/);
  assert.match(chefMode, /function renderMenuPlanCards\(/);
  assert.match(chefMode, /data-menu-open/);
  assert.match(chefMode, /data-menu-cook/);
  assert.match(chefMode, /data-menu-shopping/);
  assert.match(chefMode, /data-menu-retry/);
});

test("auth reset clears all menu plans", async () => {
  const chefMode = await readFile(new URL("chef-mode.js", publicUrl), "utf8");
  const reset = functionSource(chefMode, "function resetChefModeState");
  assert.match(reset, /menuPlanResults = \[\]/);
});
```

- [ ] **Step 2: Run focused UI tests and verify RED**

Run:

```bash
node --test --test-name-pattern="menu generation|menu plans" tests/ui-contracts.test.mjs
```

Expected: FAIL because menu state and rendering functions do not exist.

- [ ] **Step 3: Add menu state and safe response normalization**

Near `currentPlan`, add:

```js
let menuPlanResults = [];
```

In `resetChefModeState`, add:

```js
menuPlanResults = [];
```

In `generatePlan`, before top-level clarification handling, normalize the menu response:

```js
if (data.request_type === "menu" && Array.isArray(data.recipes)) {
  const recipes = data.recipes.slice(0, 6).map((item) => {
    const requestedDish = String(item?.requested_dish || "").slice(0, 160);
    if (item?.status === "ready" && item.plan && typeof item.plan === "object") {
      return {
        requestedDish,
        status: "ready",
        plan: {
          ...item.plan,
          userRequest: requestedDish,
          fallback: Boolean(item.plan.fallback),
          is_saved: false,
          saved_recipe_id: null,
        },
      };
    }
    if (item?.status === "clarification_required") {
      return {
        requestedDish,
        status: "clarification_required",
        needsDescription: Boolean(item.needs_description),
        candidates: Array.isArray(item.candidates)
          ? item.candidates.map(String).slice(0, 3)
          : [],
        message: String(item.message || "").slice(0, 300),
      };
    }
    return {
      requestedDish,
      status: "unavailable",
      code: String(item?.code || "named_recipe_unavailable").slice(0, 80),
      message: String(item?.message || "Please try again.").slice(0, 300),
      meta: {
        failure_stage: String(item?.meta?.failure_stage || "").slice(0, 80),
        failure_reason: String(item?.meta?.failure_reason || "").slice(0, 80),
      },
    };
  });
  assertGenerationContext(ownerUserId, generationEpoch);
  return {
    kind: "menu",
    ownerUserId,
    generationEpoch,
    originalRequest: String(data.original_request || request).slice(0, 500),
    recipes,
    meta: data.meta && typeof data.meta === "object" ? data.meta : {},
  };
}
```

This normalization runs even when the HTTP status is `503`, so an all-unavailable menu still renders individual retry cards. Only throw the current top-level error when the response is not a valid menu contract.

- [ ] **Step 4: Implement menu card rendering**

Add:

```js
function renderMenuPlanCards(result) {
  const form = document.querySelector("#meal-form");
  if (!form) return;
  document.querySelector("#menu-plan-results")?.remove();
  menuPlanResults = result.recipes;
  const section = document.createElement("section");
  section.id = "menu-plan-results";
  section.className = "menu-plan-results";
  section.setAttribute("aria-live", "polite");
  section.innerHTML = `
    <div class="menu-plan-heading">
      <p class="eyebrow">YOUR MENU</p>
      <h2>${esc(result.recipes.filter((item) => item.status === "ready").length)}
        / ${esc(result.recipes.length)} recipes ready</h2>
    </div>
    <div class="menu-recipe-grid">
      ${result.recipes.map((item, index) => item.status === "ready"
        ? `<article class="menu-recipe-card card" data-menu-card="${index}">
            <p class="eyebrow">RECIPE ${index + 1}</p>
            <h3>${esc(item.plan.title || item.requestedDish)}</h3>
            <p>${esc(item.plan.summary || "")}</p>
            <div class="recipe-facts">
              <span>◷ ${esc(displayNumber(item.plan.minutes))} min</span>
              <span>◌ ${esc(displayNumber(item.plan.servings))} servings</span>
            </div>
            <div class="menu-recipe-actions">
              <button class="cream" data-menu-open="${index}">Open recipe</button>
              <button class="dark" data-menu-cook="${index}">Start cooking →</button>
              <button class="cream" data-menu-shopping="${index}">Review shopping list</button>
            </div>
          </article>`
        : `<article class="menu-recipe-card menu-recipe-failed card" data-menu-card="${index}">
            <p class="eyebrow">${item.status === "clarification_required" ? "NEEDS DETAILS" : "TRY AGAIN"}</p>
            <h3>${esc(item.requestedDish)}</h3>
            <p>${esc(item.message || "A complete recipe is unavailable right now.")}</p>
            <button class="cream" data-menu-retry="${index}">Try this dish again</button>
          </article>`).join("")}
    </div>`;
  form.insertAdjacentElement("afterend", section);

  const openMenuRecipe = (index) => {
      const item = menuPlanResults[index];
      if (!item || item.status !== "ready") return;
      renderPlan(item.plan);
      show("plan");
  };
  section.querySelectorAll("[data-menu-open]").forEach((button) => {
    button.onclick = () => openMenuRecipe(Number(button.dataset.menuOpen));
  });
  section.querySelectorAll("[data-menu-cook]").forEach((button) => {
    button.onclick = () => {
      openMenuRecipe(Number(button.dataset.menuCook));
      document.querySelector("#start-guided-cook")?.click();
    };
  });
  section.querySelectorAll("[data-menu-shopping]").forEach((button) => {
    button.onclick = () => {
      openMenuRecipe(Number(button.dataset.menuShopping));
      document.querySelector("#jump-to-ingredients")?.click();
    };
  });
  section.querySelectorAll("[data-menu-retry]").forEach((button) => {
    button.onclick = async () => {
      const index = Number(button.dataset.menuRetry);
      const item = menuPlanResults[index];
      if (!item) return;
      button.disabled = true;
      try {
        const replacement = await generatePlan(item.requestedDish);
        assertGenerationContext(
          replacement.ownerUserId,
          replacement.generationEpoch,
        );
        if (replacement.kind === "plan") {
          menuPlanResults[index] = {
            requestedDish: item.requestedDish,
            status: "ready",
            plan: replacement.plan,
          };
          renderMenuPlanCards({ ...result, recipes: menuPlanResults });
        }
      } finally {
        if (button.isConnected) button.disabled = false;
      }
    };
  });
}
```

Use `window.I18n.translate` for all visible English labels in the final code, and add the corresponding Traditional Chinese translations in `public/i18n.js`.

- [ ] **Step 5: Wire app submission to the menu renderer**

In `public/app.js`, between clarification and single-plan handling:

```js
if (result.kind === "menu") {
  renderMenuPlanCards(result);
  return;
}
```

At the start of a new submit, remove `#menu-plan-results`. Keep the current generation-context assertion before rendering.

- [ ] **Step 6: Run UI tests**

Run:

```bash
node --test tests/ui-contracts.test.mjs
```

Expected: all UI contract tests PASS.

- [ ] **Step 7: Commit**

```bash
git add public/app.js public/chef-mode.js public/i18n.js tests/ui-contracts.test.mjs
git commit -m "feat: render independent menu recipe cards"
```

---

### Task 6: Style and Verify Independent Recipe Cards

**Files:**
- Modify: `public/styles.css`
- Modify: `tests/ui-contracts.test.mjs`

**Interfaces:**
- `#menu-plan-results` appears directly after `#meal-form`.
- `.menu-recipe-grid` is responsive without changing the single-plan layout.
- Ready and failed cards remain visually distinct and keyboard accessible.

- [ ] **Step 1: Add a failing static UI test**

```js
test("multi-dish cards have responsive and failure-state styling", async () => {
  const styles = await readFile(new URL("styles.css", publicUrl), "utf8");
  assert.match(styles, /\.menu-plan-results/);
  assert.match(styles, /\.menu-recipe-grid/);
  assert.match(styles, /\.menu-recipe-failed/);
  assert.match(styles, /grid-template-columns:\s*repeat\(auto-fit/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test --test-name-pattern="multi-dish cards" tests/ui-contracts.test.mjs
```

Expected: FAIL because the menu-card selectors are absent.

- [ ] **Step 3: Add responsive styles**

```css
.menu-plan-results {
  margin-top: 22px;
}

.menu-plan-heading {
  margin-bottom: 14px;
}

.menu-plan-heading h2 {
  margin: 4px 0 0;
  font-family: var(--serif);
  color: var(--green);
}

.menu-recipe-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 16px;
}

.menu-recipe-card {
  display: flex;
  min-height: 250px;
  flex-direction: column;
  align-items: flex-start;
}

.menu-recipe-card h3 {
  margin: 6px 0 10px;
  color: var(--green);
  font-family: var(--serif);
  font-size: clamp(1.6rem, 2vw, 2.2rem);
}

.menu-recipe-card > p:not(.eyebrow) {
  flex: 1;
}

.menu-recipe-card button {
  margin-top: 16px;
}

.menu-recipe-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.menu-recipe-failed {
  border-color: rgba(196, 91, 54, 0.45);
  background: #fff7f1;
}
```

Reuse current CSS variables after confirming their exact names in `public/styles.css`; do not introduce a new color system.

- [ ] **Step 4: Run the UI suite**

Run:

```bash
node --test tests/ui-contracts.test.mjs
```

Expected: all UI contract tests PASS.

- [ ] **Step 5: Commit**

```bash
git add public/styles.css tests/ui-contracts.test.mjs
git commit -m "style: add multi-dish recipe cards"
```

---

### Task 7: Version, Full Verification, Deployment, and Live Acceptance

**Files:**
- Modify: `supabase/functions/chef-meal-plan/index.ts`
- Modify: `scripts/verify-deployment.mjs`
- Modify: `tests/deployment-verification.test.mjs`
- Modify: `public/index.html`
- Modify: `public/boot.js`
- Modify: `public/sw.js`
- Modify: `public/manifest.webmanifest`

**Interfaces:**
- `FUNCTION_VERSION` becomes `2026-07-23.named-recipe.22`.
- Deployment verifier requires the same `.22` version.
- The deployed Edge Function returns the version header expected by `verify-deployment.mjs`.

- [ ] **Step 1: Write the failing deployment-version test**

Change `tests/deployment-verification.test.mjs` to require:

```js
assert.match(
  script,
  /requiredMealPlanVersion\s*=\s*"2026-07-23\.named-recipe\.22"/,
);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test --test-name-pattern="deployment verifier compares" tests/deployment-verification.test.mjs
```

Expected: FAIL because the script still requires `.21`.

- [ ] **Step 3: Synchronize function and verifier versions**

Set:

```ts
const FUNCTION_VERSION = "2026-07-23.named-recipe.22";
```

and:

```js
const requiredMealPlanVersion = "2026-07-23.named-recipe.22";
```

Synchronize the changed browser assets with:

```bash
npm run pwa:version -- 20260723-multi-dish-menu-1
```

Expected: `public/index.html`, `public/boot.js`, `public/sw.js`, and `public/manifest.webmanifest` all use `20260723-multi-dish-menu-1`.

- [ ] **Step 4: Run complete local verification**

Run:

```bash
npm test
npm run test:edge
npm run check
npx deno check supabase/functions/chef-meal-plan/index.ts
git diff --check
```

Expected:

- Node suite: zero failures.
- Edge suite: zero failures.
- Static checks: zero failures.
- Deno check: exit 0.
- Diff check: no whitespace errors.

- [ ] **Step 5: Commit implementation and push**

```bash
git add supabase/functions public scripts tests
git commit -m "feat: support multi-dish recipe cards"
git push origin agent/optimize-startup-and-chef-mode
```

If all implementation work was already committed task-by-task, use:

```bash
git status -sb
git push origin agent/optimize-startup-and-chef-mode
```

Expected: the local branch is synchronized with its upstream.

- [ ] **Step 6: Deploy Edge Function and static site**

Deploy `supabase/functions/chef-meal-plan` to project `mylcykwmwlnjlclodmuo` with JWT verification enabled. Deploy the exact pushed static source state to the current Cloudflare Pages production project. Do not create a second site or change the production URL.

Expected:

- `chef-meal-plan` status is `ACTIVE`.
- Edge deployment reports version `.22`.
- `https://chef-jarvis.pages.dev/` serves the new static hashes.

- [ ] **Step 7: Verify deployed artifacts**

Run:

```bash
npm run verify:deployment
```

Expected: every public asset hash matches and `chef-meal-plan 2026-07-23.named-recipe.22` passes.

- [ ] **Step 8: Execute live acceptance cases**

In the signed-in production app, submit:

```text
宮保雞丁、排骨蛋炒飯、炒高麗菜
紅燒牛肉麵、麻婆豆腐、蒜炒空心菜
beef bourguignon, Caesar salad, garlic bread
肉燥飯
mac and cheese
```

For each of the first three menus, run twice and verify:

- The number and order of cards match the request.
- Each ready card contains its own title, complete measured ingredients, and complete steps.
- A failed card does not hide ready cards.
- Retrying one failed card leaves other cards unchanged.
- Opening a card produces the current single-plan view.
- Shopping, save, and Chef Mode actions target only the selected card.
- No alert or ready card exposes unsafe ingredient data or unrestricted diagnostic text.

For `肉燥飯` and `mac and cheese`, verify the response remains a single plan rather than a menu.

- [ ] **Step 9: Record final evidence**

Capture:

- Final two commit hashes.
- Supabase Edge deployment version and `ACTIVE` status.
- `npm test`, `npm run test:edge`, `npm run check`, Deno check, and deployment verifier totals.
- Two-run results for each multi-dish acceptance menu.
- Any legitimate provider/model failure as an individual card result, including only its fixed failure stage and reason.

Do not claim universal success from one model response. Completion requires the parser, response contract, allergen gate, independent cards, and repeated production cases to pass.
