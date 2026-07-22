# Chef Meal Plan Allergen Egress Gate Handoff

**Last updated:** 2026-07-22  
**Repository:** `/Users/daniel/Desktop/chef jarvis by chatgpt/chef-jarvis-netlify-web`  
**Branch:** `agent/optimize-startup-and-chef-mode`  
**Current phase:** Follow-up review FR-01–FR-04 plus RR-01/RR-02/RR-05
remediated and locally verified; function version bumped to
`2026-07-22.named-recipe.15` for deployment.

## Follow-up remediation (2026-07-22, review: docs/reviews/2026-07-22-allergen-matcher-hardening-follow-up-review.md)

- **FR-01:** `withoutLabeledDairyFreeProducts` no longer guesses phrase
  boundaries with a connector blacklist; only a closed descriptor whitelist
  (`whole|skim|...`) may sit between the safety label and the dairy word.
  All five probe phrases (`Dairy-free sauce including milk`, `… spread has
  butter`, `… recipe includes milk`, `… sauce, milk`, `Non-dairy sauce,
  milk`) now BLOCK in both `name` and `usda_query`.
- **FR-02:** every safety-label strip goes through `replaceUnlessNegated`;
  labels preceded by `not/never/isn't/…` or `並非/并非/不是/絕非/非` are kept
  so the allergen stays visible and the plan is rejected. English and
  Chinese negation regressions added.
- **FR-03:** plant-based/meatless analogue phrases must be label-adjacent;
  connector bypasses (`Plant-based sauce including chicken`, …) now report
  conflicts while `Plant-based chicken pieces` stays allowed.
- **FR-04:** the gate distinguishes a missing `plan` key (pass-through for
  error/clarification bodies) from a present-but-malformed `plan` key —
  `null`, `undefined`, arrays, and primitives all fail closed.
- **RR-02:** the handler validates the profile row after the query: missing
  row or non-string-array `allergies`/`dietary_preferences` returns 503
  `profile_unavailable` before resolution, provider, quota, or model work.
- **RR-05:** the metered success branch sets
  `failureStage = "egress_validation"` before the gate runs, so an egress
  rejection is diagnosed as `egress_validation`/`restriction_conflict`.
- **RR-01:** `FUNCTION_VERSION` and `requiredMealPlanVersion` bumped
  together to `2026-07-22.named-recipe.15`.

Verification: focused RED observed for all 16 new tests before the fix;
`npm test` 226/226, `npm run check`, `git diff --check` all pass; direct
probes rerun for every FR case (all BLOCK) and every safe-label positive
(all pass).

**RR-03 (2026-07-23):** `tests/edge/meal-plan-response-boundary.test.ts`
(`npm run test:edge`) imports the unmodified Edge Function under Deno,
stubs Supabase auth/REST/RPC and Gemini behind a URL-routing fetch stub,
and drives real HTTP requests through all three plan paths: AI success
(200 `ai_generated`, quota kept), unconfigured fallback (200 labeled, no
quota), and models-failed fallback (200 labeled, consume then refund).
Unsafe variants assert the egress gate returns 500 with no plan, refunds
reserved quota, and never logs `chef_meal_plan_completed`. 5/5 pass.
`deno check --no-lock` on the Edge Function also passes (repo `deno.lock`
is v5; the pinned deno-bin 2.2.7 skips it).

**RR-04 (2026-07-23):** onboarding has an "Other allergies (comma
separated)" input: prefills from saved `allergies` minus the checkbox
choices, accepts English/CJK comma separators, dedupes case-insensitively
against checkbox picks and itself, and saves the merged list to
`app_profiles.allergies`. Covered by a `tests/ui-contracts.test.mjs`
contract and verified rendering in the browser preview. PWA cache version
bumped to `20260723-custom-allergies-1`.

## Implementation evidence (2026-07-22)

Executed test-first per the committed plan.

**Commits:**

- `3e5c6b3` test: enforce allergen-safe meal plan bodies — adds
  `mealPlanResponseAllergenGate` to
  `supabase/functions/_shared/named-recipe-integrity.js` plus the focused
  gate tests in `tests/named-recipe-pipeline.test.mjs`.
- `f8ef2aa` fix: gate meal plans against saved allergens — request-scoped
  `safeRespond` in `supabase/functions/chef-meal-plan/index.ts`; all 14
  handler `return respond(...)` calls replaced; metered success branch gates
  before `quotaRequestId = null` and before the completion log.
- `b045502` test: align source contracts with safeRespond — updates the two
  pre-existing source-contract assertions that expected `return respond(`.

**Observed RED before implementation:**

- API test: `Expected values to be strictly equal: 'undefined' !== 'function'`.
- Matrix: `Missing expected exception: ai/provider success exposed Roasted
  peanuts for peanut`; fail-closed: `Missing expected exception.`
- Source contract: `The input did not match the regular expression
  /mealPlanResponseAllergenGate/`.

**GREEN verification:**

- Focused: 5/5 gate and source-contract tests pass.
- Full suite: `npm test` → 188 tests, 188 pass, 0 fail (was 183 before).
- `npm run check` → PWA assets synchronized at 20260722-app-icon-1 (15 files).
- `git diff --check` → clean.
- Response-path contract: zero `return respond(` after `Deno.serve`; exactly
  two `return new Response(` in the handler, both in `OPTIONS`.
- `deno` CLI is not installed locally, so no type-check ran; the deploy step
  will surface any TypeScript issue.

**Remaining work:** deploy `chef-meal-plan` when separately requested
(`npx supabase functions deploy chef-meal-plan`), after bumping
`FUNCTION_VERSION` in `supabase/functions/chef-meal-plan/index.ts:48` and the
matching `requiredMealPlanVersion` in `scripts/verify-deployment.mjs:21`, then
`npm run verify:deployment`.

**If interrupted, resume with:**

```bash
npm test -- tests/named-recipe-pipeline.test.mjs
```

## User request

Apply the Cloud Code review recommendation to `chef-meal-plan`:

- add one allergen egress gate immediately before all JSON responses;
- cover every response path, including both broad-request fallbacks;
- assert that no saved user allergen family can appear in returned
  `plan.ingredients`;
- fail closed by rejecting the whole recipe rather than deleting ingredients.

The user selected approach **A**: a request-scoped `safeRespond` is the only JSON
response function used inside the Edge Function handler.

## Approved design

Read first:

`docs/superpowers/specs/2026-07-22-chef-meal-plan-allergen-egress-gate-design.md`

Design commit:

`dfbc512 docs: design allergen egress gate`

The user explicitly approved the written spec.

Implementation plan:

`docs/superpowers/plans/2026-07-22-chef-meal-plan-allergen-egress-gate.md`

## Verified codebase facts

- Edge Function: `supabase/functions/chef-meal-plan/index.ts`
- Existing allergen matcher:
  `recipeRestrictionRejectionReason` in
  `supabase/functions/_shared/named-recipe-integrity.js`
- Primary tests: `tests/named-recipe-pipeline.test.mjs`
- Current plan-producing response categories:
  1. AI/provider success around the final model loop.
  2. `fallback_unconfigured` when `GEMINI_API_KEY` is absent.
  3. `fallback_models_failed` after every model attempt fails.
- AI parsing and repair already perform restriction checks, but the three final
  plan responses do not share a last egress guard.
- Both broad-request fallback paths call `fallbackPlan` and currently return
  directly through the top-level `respond` serializer.
- Supabase changelog was checked on 2026-07-22. No Edge Function breaking change
  affects this local response-safety modification.

## Required implementation shape

1. Add a pure shared response-safety helper, preferably
   `supabase/functions/_shared/meal-plan-response-safety.js`.
2. Reuse the existing bilingual allergen-family matcher with only
   `profile.allergies`; do not duplicate the family vocabulary.
3. Bodies without a non-null `plan` pass unchanged.
4. A body with a plan and no loaded profile fails closed.
5. A body with an allergen conflict throws a deliberately non-sensitive error.
6. Define request-scoped `safeRespond` at the start of the `Deno.serve`
   callback. It captures a nullable profile and calls the pure guard before the
   existing serializer.
7. Replace every handler `return respond(...)` with `return safeRespond(...)`.
   Direct `OPTIONS` `Response` objects remain unchanged because they have no
   recipe body.
8. Assign the captured profile only after the profile query succeeds.
9. In the metered AI-success branch, run the gate before clearing
   `quotaRequestId` and before logging a successful completion. This preserves
   refund behavior if the gate rejects the recipe.
10. Never sanitize a recipe by deleting individual ingredients.

## TDD sequence

No production-code implementation has been made. Execute the committed plan
test-first:

1. Add a focused test matrix to `tests/named-recipe-pipeline.test.mjs` (or a
   focused new test file if that keeps the boundary clearer).
2. Cover AI/provider success, unconfigured fallback, models-failed fallback,
   clarification, and error body shapes.
3. For every supported allergen family, insert an unsafe ingredient into each
   plan-producing body and assert rejection.
4. Assert safe alternatives such as explicit allergen-free labels remain
   accepted according to existing matcher behavior.
5. Add a source-contract assertion that no handler response bypasses
   `safeRespond` and that all three current plan-producing branches use it.
6. Run the focused test and record an expected RED caused by the missing helper
   or missing gate.
7. Implement the smallest production change that makes the focused test GREEN.
8. Re-run the focused test, then the full suite and project check.

## Verification commands

From the repository root:

```bash
npm test -- tests/named-recipe-pipeline.test.mjs
npm test
npm run check
git diff --check
git status --short --branch
```

If an authenticated live verification or deployment is later requested, verify
the current Supabase CLI/MCP instructions first and do not expose profile,
allergy, token, API-key, or complete recipe payloads in logs.

## Repository baseline

The last commit before this handoff file was created is:

- `dfbc512` adds the approved design document.

Check `git status` before editing because the user may have changed the shared
working tree after this handoff was written.
