# Chef Meal Plan Allergen Egress Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guarantee that every `chef-meal-plan` response, including both broad-request fallbacks, cannot serialize a saved user allergen family in `plan.ingredients`.

**Architecture:** Add one pure egress-gate function beside the existing bilingual allergen matcher, then make a request-scoped `safeRespond` the only JSON response path inside the Edge Function handler. The gate rejects the complete response before serialization; the metered success path performs the gate before clearing quota ownership or logging success.

**Tech Stack:** Supabase Edge Functions, Deno TypeScript, JavaScript ES modules, Node.js built-in test runner.

## Global Constraints

- Reuse `recipeRestrictionRejectionReason`; do not duplicate or expand the allergen-family vocabulary.
- The gate uses only `profile.allergies`, not dietary preferences, for this egress invariant.
- Reject an unsafe recipe as a whole; never delete or rewrite individual ingredients.
- A response containing a plan without a loaded profile must fail closed.
- Direct `Response` objects are permitted only for the two body-free/simple `OPTIONS` branches.
- Do not log raw profiles, allergy values, credentials, or complete recipe payloads.
- No database, RLS, authentication, or public success-response-shape changes.

---

### Task 1: Pure allergen egress gate

**Files:**
- Modify: `tests/named-recipe-pipeline.test.mjs:1-18`
- Modify: `tests/named-recipe-pipeline.test.mjs` after the existing restriction tests
- Modify: `supabase/functions/_shared/named-recipe-integrity.js:198-264`

**Interfaces:**
- Consumes: `recipeRestrictionRejectionReason(plan, profile)` from the same shared module.
- Produces: `mealPlanResponseAllergenGate(body, profile)`, returning the original body when safe and throwing a non-sensitive `Error` when unsafe.

- [ ] **Step 1: Add an API-existence test that fails cleanly**

Add a namespace import without changing the existing named imports:

```js
import * as namedRecipeIntegrity from "../supabase/functions/_shared/named-recipe-integrity.js";
```

Add this focused test:

```js
test("exports a meal-plan allergen egress gate", () => {
  assert.equal(
    typeof namedRecipeIntegrity.mealPlanResponseAllergenGate,
    "function",
  );
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test --test-name-pattern="exports a meal-plan allergen egress gate" tests/named-recipe-pipeline.test.mjs
```

Expected: one assertion failure because the export is `undefined`; no module-load or syntax error.

- [ ] **Step 3: Add the smallest exported function and verify the API test GREEN**

Add after `recipeRestrictionRejectionReason`:

```js
export function mealPlanResponseAllergenGate(body) {
  return body;
}
```

Run the Step 2 command again. Expected: the focused API test passes.

- [ ] **Step 4: Add the real all-path allergen matrix and fail-closed tests**

Add these fixtures and tests:

```js
const allergenFamilyCases = [
  ["peanut", "Roasted peanuts"],
  ["Nut allergy", "Almond flour"],
  ["dairy", "Unsalted butter"],
  ["egg", "Large eggs"],
  ["soy", "Extra-firm tofu"],
  ["gluten", "Wheat flour"],
  ["sesame", "Tahini"],
  ["fish", "Salmon fillet"],
  ["shellfish", "Raw shrimp"],
  ["cilantro", "Fresh cilantro"],
];

const planResponseCases = [
  ["ai/provider success", (plan) => ({ plan, model: "gemini-test" })],
  ["Gemini-unconfigured fallback", (plan) => ({
    plan,
    fallback: true,
    notice: "Gemini is not configured yet.",
  })],
  ["all-models-failed fallback", (plan) => ({
    plan,
    fallback: true,
    meta: { outcome: "fallback_models_failed" },
  })],
];

test("every plan response path rejects every saved allergen family before serialization", () => {
  const gate = namedRecipeIntegrity.mealPlanResponseAllergenGate;
  for (const [pathName, makeBody] of planResponseCases) {
    for (const [allergy, ingredient] of allergenFamilyCases) {
      const body = makeBody({
        ingredients: [{ name: ingredient, usda_query: ingredient }],
      });
      assert.throws(
        () => gate(body, { allergies: [allergy] }),
        /allergen egress/i,
        `${pathName} exposed ${ingredient} for ${allergy}`,
      );
    }
  }
});

test("the egress gate fails closed without a profile but leaves non-plan responses unchanged", () => {
  const gate = namedRecipeIntegrity.mealPlanResponseAllergenGate;
  const errorBody = { error: "Please sign in first." };
  const clarificationBody = { clarification_required: true, candidates: [] };

  assert.equal(gate(errorBody, null), errorBody);
  assert.equal(gate(clarificationBody, null), clarificationBody);
  assert.throws(
    () => gate({ plan: { ingredients: [{ name: "Rice" }] } }, null),
    /safety profile is unavailable/i,
  );
});

test("the egress gate preserves explicit allergen-free ingredients", () => {
  const body = {
    plan: {
      ingredients: [{ name: "Peanut-free sauce", usda_query: "peanut-free sauce" }],
    },
    fallback: true,
  };
  assert.equal(
    namedRecipeIntegrity.mealPlanResponseAllergenGate(body, {
      allergies: ["peanut"],
    }),
    body,
  );
});
```

- [ ] **Step 5: Run the matrix and verify RED for the missing behavior**

Run:

```bash
node --test --test-name-pattern="egress gate|every plan response path" tests/named-recipe-pipeline.test.mjs
```

Expected: the export test passes, while unsafe recipes are not rejected and the missing-profile assertion fails.

- [ ] **Step 6: Implement the minimal pure gate**

Replace the temporary function with:

```js
export function mealPlanResponseAllergenGate(body, profile) {
  if (!body || typeof body !== "object" || body.plan == null) return body;
  if (!profile || typeof profile !== "object") {
    throw new Error("Meal plan response safety profile is unavailable.");
  }
  const reason = recipeRestrictionRejectionReason(body.plan, {
    allergies: Array.isArray(profile.allergies) ? profile.allergies : [],
    dietary_preferences: [],
  });
  if (reason) {
    throw new Error("Meal plan response failed allergen egress validation.");
  }
  return body;
}
```

- [ ] **Step 7: Run the focused tests and verify GREEN**

Run the Step 5 command. Expected: all selected tests pass with no warnings.

- [ ] **Step 8: Commit the pure gate**

```bash
git add tests/named-recipe-pipeline.test.mjs supabase/functions/_shared/named-recipe-integrity.js
git commit -m "test: enforce allergen-safe meal plan bodies"
```

---

### Task 2: Route every Edge Function response through the gate

**Files:**
- Modify: `tests/named-recipe-pipeline.test.mjs` near the existing Edge Function source-contract tests
- Modify: `supabase/functions/chef-meal-plan/index.ts:33-44`
- Modify: `supabase/functions/chef-meal-plan/index.ts:2508-3196`

**Interfaces:**
- Consumes: `mealPlanResponseAllergenGate(body, responseProfile)`.
- Produces: request-scoped `safeRespond(body, status?, extraHeaders?)` as the only JSON-return path inside `Deno.serve`.

- [ ] **Step 1: Add the source-contract regression test**

Add:

```js
test("chef-meal-plan routes every JSON return through one request-scoped allergen gate", async () => {
  const edge = await readFile(
    new URL("../supabase/functions/chef-meal-plan/index.ts", import.meta.url),
    "utf8",
  );
  const handler = edge.slice(edge.indexOf("Deno.serve"));

  assert.match(edge, /mealPlanResponseAllergenGate/);
  assert.match(handler, /let responseProfile: Profile \| null = null/);
  assert.match(handler, /const safeRespond = \(/);
  assert.match(
    handler,
    /mealPlanResponseAllergenGate\(body, responseProfile\)/,
  );
  assert.match(handler, /responseProfile = profile/);
  assert.doesNotMatch(handler, /\breturn respond\(/);
  assert.equal(
    handler.match(/return new Response\(/g)?.length,
    2,
    "only OPTIONS may bypass the JSON response gate",
  );

  const unconfigured = handler.slice(
    handler.indexOf('outcome: "fallback_unconfigured"'),
    handler.indexOf("quotaRequestId = requestId"),
  );
  assert.match(unconfigured, /return safeRespond\(\{[\s\S]*?plan,/);

  const generatedStart = handler.indexOf("const plan = namedRequest");
  const generated = handler.slice(
    generatedStart,
    handler.indexOf("} catch (error)", generatedStart),
  );
  assert.match(generated, /const response = safeRespond\(\{[\s\S]*?plan,/);
  assert.ok(
    generated.indexOf("const response = safeRespond") <
      generated.indexOf("quotaRequestId = null"),
    "the gate must run before quota ownership is cleared",
  );
  assert.ok(
    generated.indexOf("const response = safeRespond") <
      generated.indexOf('console.log("chef_meal_plan_completed"'),
    "the gate must run before success is logged",
  );

  const modelsFailed = handler.slice(
    handler.indexOf('outcome: "fallback_models_failed"'),
    handler.indexOf("} catch (error)", handler.indexOf('outcome: "fallback_models_failed"')),
  );
  assert.match(modelsFailed, /return safeRespond\(\{[\s\S]*?plan,/);
});
```

- [ ] **Step 2: Run the source-contract test and verify RED**

Run:

```bash
node --test --test-name-pattern="routes every JSON return" tests/named-recipe-pipeline.test.mjs
```

Expected: failures for the missing import, missing request-scoped gate, direct
`respond` returns, and missing ordering guarantee.

- [ ] **Step 3: Import the gate and define request-scoped `safeRespond`**

Add `mealPlanResponseAllergenGate` to the existing shared integrity import.
At the start of the `Deno.serve` callback, before the method checks, add:

```ts
let responseProfile: Profile | null = null;
const safeRespond = (
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
) => respond(
  request,
  mealPlanResponseAllergenGate(body, responseProfile),
  status,
  extraHeaders,
);
```

- [ ] **Step 4: Route every JSON response and bind the validated profile**

Replace every handler call shaped like:

```ts
return respond(request, body, status, headers);
```

with:

```ts
return safeRespond(body, status, headers);
```

After the profile error branch, bind the verified profile:

```ts
const profile = (profileRow || {}) as Profile;
responseProfile = profile;
```

Keep the two `OPTIONS` `new Response(...)` returns unchanged.

- [ ] **Step 5: Gate metered success before quota clearing and success logging**

Replace the current success ordering with:

```ts
const durationMs = Date.now() - requestStartedAt;
const response = safeRespond({
  plan,
  model,
  meta: {
    request_id: requestId,
    prompt_version: PROMPT_VERSION,
    duration_ms: durationMs,
    image_found: Boolean(plan.image),
  },
});
quotaRequestId = null;
console.log("chef_meal_plan_completed", {
  request_id: requestId,
  prompt_version: PROMPT_VERSION,
  outcome: source ? "adapted_external_recipe" : "ai_generated",
  model,
  duration_ms: durationMs,
  image_found: Boolean(plan.image),
  dish_key: dishKey || undefined,
});
return response;
```

If the gate throws, the inner generation catch records a restriction failure;
after attempts are exhausted, the existing code refunds the quota before any
named failure or broad fallback response.

- [ ] **Step 6: Run the source-contract and focused gate tests and verify GREEN**

Run:

```bash
node --test --test-name-pattern="egress gate|every plan response path|routes every JSON return" tests/named-recipe-pipeline.test.mjs
```

Expected: all selected tests pass with no warnings.

- [ ] **Step 7: Commit the Edge Function wiring**

```bash
git add tests/named-recipe-pipeline.test.mjs supabase/functions/chef-meal-plan/index.ts
git commit -m "fix: gate meal plans against saved allergens"
```

---

### Task 3: Full verification and resumable handoff

**Files:**
- Modify: `docs/handoffs/2026-07-22-chef-meal-plan-allergen-egress-gate.md`

**Interfaces:**
- Consumes: completed gate and handler wiring.
- Produces: fresh verification evidence and an up-to-date Claude handoff.

- [ ] **Step 1: Run the complete local verification suite**

```bash
npm test
npm run check
git diff --check
```

Expected: every unit test passes, syntax/PWA asset checks pass, and diff check
prints no errors.

- [ ] **Step 2: Inspect the final response-path contract**

```bash
rg -n 'return respond\(|return safeRespond\(|const response = safeRespond|return new Response\(' supabase/functions/chef-meal-plan/index.ts
```

Expected:

- no `return respond(` after `Deno.serve` begins;
- all JSON paths use `safeRespond` or the already-gated `response` variable;
- exactly two handler `return new Response(` calls, both in `OPTIONS`.

- [ ] **Step 3: Update the Claude handoff with actual commits and test counts**

Record:

- RED failure messages observed;
- implementation commit hashes;
- focused and full test totals;
- any remaining deployment work;
- exact next command if work is interrupted.

- [ ] **Step 4: Commit the final handoff update**

```bash
git add docs/handoffs/2026-07-22-chef-meal-plan-allergen-egress-gate.md
git commit -m "docs: finalize allergen gate handoff"
```

- [ ] **Step 5: Report only evidence-backed completion status**

Include the changed files, RED-to-GREEN evidence, full verification results,
commit hashes, and whether the Supabase Edge Function remains undeployed.
