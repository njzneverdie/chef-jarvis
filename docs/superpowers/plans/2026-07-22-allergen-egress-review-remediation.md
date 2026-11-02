# Allergen Egress Review Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every actionable safety, fail-closed, test, observability, UI-profile, versioning, and deployment gap recorded in `docs/reviews/2026-07-22-chef-meal-plan-allergen-egress-code-review.md`.

**Architecture:** Keep one request-scoped response boundary, but replace whole-field allergen exemptions with occurrence-level text removal and strict runtime schema checks. Extend the final boundary to saved allergies plus medical dietary restrictions, expose custom allergy entry in onboarding, exercise the real shared responder used by the handler, and give the Edge bundle a new verifiable release identity before deploying it.

**Tech Stack:** Supabase Edge Functions, Deno TypeScript, JavaScript ES modules, Node test runner, Cloudflare Pages.

## Global Constraints

- Unsafe or malformed plan responses fail closed; never delete individual ingredients.
- Never log profile values, allergy values, tokens, credentials, or complete recipes.
- Safety labels clear only their own exact phrase; any remaining positive allergen occurrence rejects the whole plan.
- `lactose-free` is safe only for lactose restriction, never for milk/dairy allergy.
- The final medical-safety gate covers saved allergies plus gluten/lactose medical preferences, not general vegan/vegetarian/halal preferences.
- Preserve existing public success-response shapes, CORS, statuses, headers, and quota semantics.
- Every behavior change follows RED → GREEN; record the expected failing assertion before production edits.
- Do not deploy until all local gates and final code review are clean.

---

### Task 1: Harden matcher semantics and plan/profile schemas

**Files:**
- Modify: `tests/named-recipe-pipeline.test.mjs`
- Modify: `supabase/functions/_shared/named-recipe-integrity.js`

**Interfaces:**
- Consumes: existing `recipeRestrictionRejectionReason(plan, profile)`.
- Produces: strict `mealPlanResponseAllergenGate(body, profile)` and occurrence-level matching for all callers.

- [ ] **Step 1: Add RED tests for whole-field masking**

Add table cases for dairy and gluten, independently in `name` and `usda_query`:

```js
[
  ["dairy", "Oat milk blended with whole milk"],
  ["dairy", "Dairy-free yogurt with Greek yogurt"],
  ["gluten", "Gluten-free seasoning with added gluten"],
]
```

Run the focused pattern and observe every new unsafe case is currently allowed.

- [ ] **Step 2: Add RED tests for restriction-aware lactose handling**

Assert `Lactose-free whole milk` is rejected for `dairy`/`milk allergy` but accepted for `lactose`.

- [ ] **Step 3: Add RED tests for family coverage**

Cover at minimum:

```js
[
  ["soy", "Roasted soybeans"],
  ["seafood", "Salmon fillet"],
  ["fish", "Cod fillet"],
  ["Shellfish allergy", "Crayfish tails"],
  ["Shellfish allergy", "Langoustine tails"],
  ["Nut allergy", "Groundnut oil"],
  ["gluten", "Semolina flour"],
]
```

- [ ] **Step 4: Add RED tests for bilingual safe labels and false positives**

Assert `無花生醬` and `無麩質麵包` pass, contradictory `無花生醬含花生` fails, and `乳酸`/`乳酸鈣` do not trigger dairy.

- [ ] **Step 5: Add RED tests for malformed gate inputs**

Assert plans fail closed for missing/non-array ingredients, non-object ingredient entries, non-string names/queries, and profiles whose `allergies` or `dietary_preferences` are missing, null, non-array, or contain non-string values.

- [ ] **Step 6: Implement occurrence-level matching**

Replace whole-field booleans with helpers that remove only exact safe phrases/products before rescanning the remainder. Extend explicit-free removal to `無/无/不含`. Keep plant-milk exceptions family-local so almond/soy remains visible to nut/soy families.

- [ ] **Step 7: Implement restriction-aware dairy behavior and vocabulary fixes**

Distinguish lactose-only restrictions from milk/dairy allergy. Add the directly reproduced family synonyms/members. Remove bare `乳` matching and use explicit dairy compounds instead.

- [ ] **Step 8: Implement strict schemas and medical preference filtering**

Require a loaded profile with string-array `allergies` and `dietary_preferences`, and a plan with string ingredient fields. Pass only gluten/lactose medical preferences alongside allergies to the shared matcher.

- [ ] **Step 9: Verify GREEN**

Run focused tests, all named-recipe tests, then `npm test`.

---

### Task 2: Fail closed at profile load and align onboarding safety data

**Files:**
- Modify: `tests/named-recipe-pipeline.test.mjs`
- Modify: `tests/ui-contracts.test.mjs`
- Modify: `supabase/functions/chef-meal-plan/index.ts`
- Modify: `public/app.js`
- Modify: `public/i18n.js`

**Interfaces:**
- Consumes: strict gate from Task 1.
- Produces: validated `responseProfile` and user-saveable custom allergy values.

- [ ] **Step 1: Add RED profile-source contract tests**

Assert `profileRow === null` returns `profile_unavailable` before `responseProfile` assignment and before plan generation. Assert assignment occurs only after string-array validation.

- [ ] **Step 2: Add RED UI tests**

Assert onboarding exposes a comma-separated custom allergy input, preserves existing custom allergies when editing, and merges them with fixed allergy checkboxes without storing dietary values in `allergies`.

- [ ] **Step 3: Implement handler profile validation**

Return the existing non-sensitive `profile_unavailable` 503 for a missing or malformed row. Do not bind `responseProfile` until validated.

- [ ] **Step 4: Implement custom allergy persistence**

Keep current fixed choices, add `Other food allergies (comma separated)`, de-duplicate trimmed values, preserve edit state, and add Traditional Chinese translation.

- [ ] **Step 5: Verify GREEN**

Run focused profile/UI tests and full `npm test`.

---

### Task 3: Exercise the actual response boundary and fix diagnostics

**Files:**
- Modify: `supabase/functions/_shared/named-recipe-integrity.js`
- Modify: `supabase/functions/chef-meal-plan/index.ts`
- Modify: `tests/named-recipe-pipeline.test.mjs`

**Interfaces:**
- Produces: `createMealPlanSafeResponder({ getProfile, serialize })` used by the real handler and executable in Node tests.

- [ ] **Step 1: Add RED responder execution tests**

Test the actual shared responder with each AI/provider and fallback body. Assert unsafe/malformed bodies never reach the serializer, safe bodies preserve status/headers/body, and a profile assigned after responder creation is read at call time.

- [ ] **Step 2: Implement and wire the responder factory**

Create the smallest pure factory around `mealPlanResponseAllergenGate`; replace the inline handler closure with that factory without changing call shapes.

- [ ] **Step 3: Add RED diagnostic ordering test**

Assert the generated plan branch sets `failureStage = "egress_validation"` immediately before final serialization and that diagnostic priority recognizes the stage.

- [ ] **Step 4: Implement egress diagnostics**

Add the stage without logging sensitive values. Keep existing quota and completion ordering.

- [ ] **Step 5: Verify GREEN**

Run focused tests, Deno check, and full `npm test`.

---

### Task 4: Release identity, documents, and deployment

**Files:**
- Modify: `supabase/functions/chef-meal-plan/index.ts`
- Modify: `scripts/verify-deployment.mjs`
- Modify: `tests/deployment-verification.test.mjs`
- Modify: `docs/handoffs/2026-07-22-chef-meal-plan-allergen-egress-gate.md`
- Modify: `docs/superpowers/specs/2026-07-22-chef-meal-plan-allergen-egress-gate-design.md`
- Modify: `docs/superpowers/plans/2026-07-22-chef-meal-plan-allergen-egress-gate.md`
- Modify: `docs/reviews/2026-07-22-chef-meal-plan-allergen-egress-code-review.md`

**Interfaces:**
- Produces: a unique Edge release version and accurate deployment evidence.

- [ ] **Step 1: Add RED version expectations**

Choose the next unique version `2026-07-22.named-recipe.15`; update the test first so current `.14` fails.

- [ ] **Step 2: Bump local/verifier versions**

Update `FUNCTION_VERSION` and `requiredMealPlanVersion` together.

- [ ] **Step 3: Update documents**

Record remediation commits, current test totals, Deno check, resolved findings, current deployment state, approved spec status, and completed plan checkboxes.

- [ ] **Step 4: Run local release gates**

```bash
npm test
npm run check
npm run test:e2e
npx -y deno check supabase/functions/chef-meal-plan/index.ts
git diff --check
```

- [ ] **Step 5: Obtain final whole-branch Code Review**

Do not deploy while any Critical/Important finding remains.

- [ ] **Step 6: Deploy Edge Function and public assets**

Discover CLI flags via `--help`, deploy `chef-meal-plan`, and deploy `public/` only if Task 2 changed frontend assets.

- [ ] **Step 7: Verify production**

Run `npm run verify:deployment`; read the ACTIVE Supabase function and assert it contains the gate, responder, current matcher, and `.15`; run a non-destructive authenticated smoke test if dedicated credentials are available.

- [ ] **Step 8: Commit and push reviewed changes**

Commit only scoped files, preserve unrelated untracked files, and push the current feature branch after production verification.
