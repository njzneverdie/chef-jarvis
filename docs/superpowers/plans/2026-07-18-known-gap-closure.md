# Chef Jarvis Known-Gap Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every actionable issue in the approved product specification's “已知缺口與差異” section, and convert external-only gaps into explicit, repeatable release checks.

**Architecture:** Add pure domain checks for legacy content, visible runtime status for offline and image uncertainty, a JWT-protected account-deletion Edge Function backed by foreign-key cascades, and scripts/tests for deployment and browser verification. Preserve the dependency-light static client and existing Supabase boundaries.

**Tech Stack:** Vanilla JavaScript, Node.js built-in test runner, Playwright, Cloudflare Pages, Supabase Auth/Postgres/Edge Functions.

## Global Constraints

- Preserve all pre-existing uncommitted workspace changes.
- Do not infer missing legacy ingredient quantities.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser.
- All new behavior must start with a failing test.
- Keep Gemini and USDA optional to the usable recipe/cooking flow.
- Use English and Traditional Chinese copy for user-visible status and destructive actions.
- Do not rename the repository directory from inside the active workspace; use the canonical product ID `chef-jarvis` in tracked configuration.

---

### Task 1: Detect and contain unsafe legacy recipe data

**Files:**
- Modify: `tests/domain.test.mjs`
- Modify: `tests/ui-contracts.test.mjs`
- Modify: `public/domain.js`
- Modify: `public/chef-mode.js`
- Modify: `public/i18n.js`
- Modify: `public/guided-cooking.css`

**Interfaces:**
- Consumes: recipe objects and shopping-list item rows.
- Produces: `ChefDomain.recipeIntegrityReport(recipe)` returning `{ safe, issues }`.

- [ ] **Step 1: Add failing domain tests**

```js
test("legacy recipes with generic or unmeasured ingredients are unsafe", () => {
  const report = recipeIntegrityReport({
    ingredients: [
      { name: "這道料理的主要蛋白質食材", quantity: 2, unit: "serving" },
      { name: "新鮮蔬菜與辛香料", quantity: null, unit: "" },
    ],
    steps: [{ instruction: "Cook until done.", timers: [] }],
  });
  assert.equal(report.safe, false);
  assert.ok(report.issues.includes("generic_ingredient"));
  assert.ok(report.issues.includes("missing_measurement"));
});

test("structured recipes pass the integrity report", () => {
  const report = recipeIntegrityReport({
    ingredients: [{
      name: "Boneless skinless chicken breast",
      quantity: 400,
      unit: "g",
      preparation: "cut into 2 cm cubes",
    }],
    steps: [{ instruction: "Cook the chicken for 6 minutes.", timers: [{
      label: "Cook chicken", kind: "cook", duration_seconds: 360,
    }] }],
  });
  assert.deepEqual(report, { safe: true, issues: [] });
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `node --test --test-name-pattern="legacy recipes|structured recipes" tests/domain.test.mjs`

Expected: FAIL because `recipeIntegrityReport` is not exported.

- [ ] **Step 3: Implement the pure integrity report**

```js
function recipeIntegrityReport(recipe = {}) {
  const issues = new Set();
  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  const generic = /主要蛋白質食材|新鮮蔬菜|辛香料|調味料|main protein|fresh vegetables|seasonings?/i;
  if (!ingredients.length) issues.add("missing_ingredients");
  for (const raw of ingredients) {
    const item = normalizeIngredient(raw);
    if (!item.name || generic.test(item.name)) issues.add("generic_ingredient");
    if (!(Number(item.quantity) > 0) || !item.unit) issues.add("missing_measurement");
  }
  if (!normalizeRecipeSteps(recipe.steps).length) issues.add("missing_steps");
  return { safe: issues.size === 0, issues: [...issues] };
}
```

Export it through `ChefDomain`.

- [ ] **Step 4: Add failing UI contract tests**

Require `renderPlan()` and `startRecipeFromShoppingList()` to call `recipeIntegrityReport`, render `legacy-recipe-warning`, and expose a “Regenerate precise recipe” action instead of silently treating unsafe legacy data as current-quality output.

- [ ] **Step 5: Run the UI contract test and verify RED**

Run: `node --test --test-name-pattern="legacy recipe safety" tests/ui-contracts.test.mjs`

Expected: FAIL because the warning and guard do not exist.

- [ ] **Step 6: Add the warning and action**

Render a warning that says quantities cannot be inferred. Keep the recipe readable, but block creation of a new shopping list, adding unsafe shopping data to pantry, and starting guided cooking until the user regenerates a precise recipe from its title.

- [ ] **Step 7: Run focused and full tests**

Run: `npm test`

Expected: all tests pass.

---

### Task 2: Make partial-offline behavior explicit

**Files:**
- Modify: `tests/ui-contracts.test.mjs`
- Modify: `public/app.js`
- Modify: `public/i18n.js`
- Modify: `public/styles.css`

**Interfaces:**
- Consumes: `navigator.onLine`, browser `online` and `offline` events.
- Produces: `updateConnectionStatus()` and a visible `#connection-status` banner.

- [ ] **Step 1: Add a failing UI contract test**

Assert that `app.js` creates `id="connection-status"`, subscribes to both connection events, and explains that local cooking progress remains available while planning, sync, and nutrition lookup require a connection.

- [ ] **Step 2: Verify RED**

Run: `node --test --test-name-pattern="offline scope" tests/ui-contracts.test.mjs`

Expected: FAIL because the banner does not exist.

- [ ] **Step 3: Implement status rendering**

```js
function updateConnectionStatus() {
  const banner = document.querySelector("#connection-status");
  if (!banner) return;
  banner.hidden = navigator.onLine;
  banner.textContent =
    "You’re offline. Current cooking progress stays on this device; planning, sync, and nutrition references need a connection.";
}
```

Call it after shell and auth rendering, and register `online`/`offline` listeners once.

- [ ] **Step 4: Add translations and styles**

Add the Traditional Chinese message and a non-modal high-contrast status style.

- [ ] **Step 5: Run tests**

Run: `npm test`

Expected: all tests pass.

---

### Task 3: Add complete account deletion and data-retention disclosure

**Files:**
- Create: `supabase/migrations/20260718090000_link_text_profiles_to_auth_users.sql`
- Create: `supabase/functions/chef-delete-account/index.ts`
- Create: `tests/account-deletion-contract.test.mjs`
- Create: `PRIVACY.md`
- Modify: `public/app.js`
- Modify: `public/i18n.js`
- Modify: `public/product-features.css`
- Modify: `supabase/config.toml`

**Interfaces:**
- Consumes: signed-in user's Bearer token and JSON `{ confirmation: "DELETE" }`.
- Produces: `POST /functions/v1/chef-delete-account` returning `{ deleted: true }`.

- [ ] **Step 1: Add failing deletion contract tests**

Verify:

```js
assert.match(migration, /alter column app_user_id type uuid/);
assert.match(migration, /references auth\.users\(id\) on delete cascade/);
assert.match(edge, /authorization\?\.startsWith\("Bearer "\)/);
assert.match(edge, /confirmation !== "DELETE"/);
assert.match(edge, /auth\.admin\.deleteUser\(user\.id/);
assert.match(app, /id="delete-account"/);
assert.match(app, /functions\/v1\/chef-delete-account/);
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests/account-deletion-contract.test.mjs`

Expected: FAIL because the migration, function, and UI do not exist.

- [ ] **Step 3: Create the cascade migration**

Delete non-UUID/orphan legacy rows, convert both `app_profiles.app_user_id` and `saved_meal_cards.app_user_id` to `uuid`, add foreign keys to `auth.users(id) on delete cascade`, recreate their RLS policies with `auth.uid() = app_user_id`, and re-grant table access explicitly.

- [ ] **Step 4: Implement the Edge Function**

Use `createClient` with the publishable key to call `auth.getUser(token)`. Require exact confirmation, create a separate service-role client only on the server, and call:

```ts
const { error } = await admin.auth.admin.deleteUser(user.id, false);
if (error) return respond(req, { error: "Account deletion failed." }, 500);
return respond(req, { deleted: true });
```

Allow only configured origins and `POST`/`OPTIONS`, with `Cache-Control: no-store`.

- [ ] **Step 5: Add the destructive profile UI**

Add a danger-zone button and modal requiring the exact word `DELETE`. Call the function with the current access token. On success clear Chef Jarvis localStorage keys, call local sign-out, clear in-memory profile state, and render the unauthenticated screen.

- [ ] **Step 6: Add the retention policy**

Document that user-owned product data is retained until account deletion; account deletion permanently removes the Auth user and cascaded product rows; logs required for short-lived rate limiting age out automatically; downloaded exports are controlled by the user.

- [ ] **Step 7: Canonicalize tracked project identity**

Change `supabase/config.toml` project ID from `chef-jarvis-netlify-web` to `chef-jarvis`. Keep filesystem paths unchanged.

- [ ] **Step 8: Run deletion contracts and full tests**

Run: `node --test tests/account-deletion-contract.test.mjs && npm test`

Expected: all tests pass.

---

### Task 4: Make deployed Edge Function versions verifiable without quota use

**Files:**
- Create: `scripts/verify-deployment.mjs`
- Create: `tests/deployment-verification.test.mjs`
- Modify: `supabase/functions/chef-meal-plan/index.ts`
- Modify: `supabase/functions/chef-usda-nutrition/index.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: production base URLs.
- Produces: `npm run verify:deployment`, comparing local public files and Edge Function version headers.

- [ ] **Step 1: Add failing contract tests**

Require each Edge Function to define `FUNCTION_VERSION`, return `X-Chef-Jarvis-Function-Version` on OPTIONS, and require the verifier to compare `boot.js`, `domain.js`, `app.js`, and `chef-mode.js` SHA-256 values.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/deployment-verification.test.mjs`

Expected: FAIL because the version headers and verifier do not exist.

- [ ] **Step 3: Add version headers**

Add a version constant to each function and merge:

```ts
"X-Chef-Jarvis-Function-Version": FUNCTION_VERSION
```

into every response, including OPTIONS. This endpoint must not authenticate or consume quota.

- [ ] **Step 4: Implement deployment verification**

The script hashes local public files with `node:crypto`, fetches the same production URL, compares digests, sends OPTIONS requests to both Edge Functions with the production Origin, and compares the returned version header with the local source constant. Any mismatch exits nonzero.

- [ ] **Step 5: Add the npm script**

```json
"verify:deployment": "node scripts/verify-deployment.mjs"
```

- [ ] **Step 6: Run tests and local syntax checks**

Run: `node --test tests/deployment-verification.test.mjs && npm run check`

Expected: all checks pass.

---

### Task 5: Add repeatable browser E2E smoke coverage

**Files:**
- Create: `playwright.config.mjs`
- Create: `e2e/public-smoke.spec.mjs`
- Create: `e2e/authenticated-smoke.spec.mjs`
- Create: `.env.e2e.example`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: optional `CHEF_E2E_EMAIL`, `CHEF_E2E_PASSWORD`, and `CHEF_E2E_BASE_URL`.
- Produces: `npm run test:e2e`.

- [ ] **Step 1: Install pinned browser test dependencies**

Run: `npm install --save-dev --save-exact @playwright/test serve`

Expected: package and lock files contain exact versions.

- [ ] **Step 2: Add a public smoke test**

Open a clean browser context, confirm the startup shell reaches the auth screen, verify invalid email/password validation, toggle Traditional Chinese, reload, and confirm the language persists.

- [ ] **Step 3: Run it before adding any app changes**

Run: `npx playwright test e2e/public-smoke.spec.mjs`

Expected: PASS against current public behavior. This test closes an evidence gap and therefore is allowed to begin green; all app behavior changes remain test-first in Tasks 1–4.

- [ ] **Step 4: Add an authenticated read-only smoke test**

Skip only when credentials are absent. Sign in with the dedicated account and verify Home, Plan, Week, Shopping, Pantry, Cook, and Profile navigation without changing production data.

- [ ] **Step 5: Add scripts and environment documentation**

```json
"test:e2e": "playwright test"
```

Document that production mutation tests require a disposable account and explicit cleanup.

- [ ] **Step 6: Run E2E**

Run: `npm run test:e2e`

Expected: public smoke passes; authenticated smoke passes when credentials exist or reports a single intentional skip.

---

### Task 6: Make uncertain recipe imagery honest and measurable

**Files:**
- Modify: `tests/recipe-image-validation.test.mjs`
- Modify: `tests/ui-contracts.test.mjs`
- Modify: `supabase/functions/_shared/recipe-image.js`
- Modify: `supabase/functions/chef-meal-plan/index.ts`
- Modify: `public/chef-mode.js`
- Modify: `public/i18n.js`

**Interfaces:**
- Consumes: exact and fallback image candidates.
- Produces: image metadata `match_kind: "exact" | "representative" | "curated"` and corresponding attribution copy.

- [ ] **Step 1: Add failing image metadata tests**

Require exact dish matches to return `exact`, broad-family fallback matches to return `representative`, and curated known-dish images to return `curated`.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/recipe-image-validation.test.mjs`

Expected: FAIL because `match_kind` is absent.

- [ ] **Step 3: Add match metadata**

Tag candidates at selection time. Never label a broad-family fallback as the exact finished dish.

- [ ] **Step 4: Add UI disclosure**

Display “Representative dish image” for representative matches; retain source, creator, and license. If no validated image exists, render the recipe without an image rather than inventing one.

- [ ] **Step 5: Run image and full tests**

Run: `node --test tests/recipe-image-validation.test.mjs && npm test`

Expected: all tests pass.

---

### Task 7: Reconcile the product specification and release evidence

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-07-18-chef-jarvis-current-product-spec-design.md`
- Create: `docs/RELEASE_REVIEW.md`

**Interfaces:**
- Consumes: completed Tasks 1–6.
- Produces: current documentation with each old gap marked closed, constrained, or requiring credentials/deployment.

- [ ] **Step 1: Update the README**

Document account deletion, honest legacy-data warnings, offline scope, deployment verification, browser E2E commands, and canonical project identity.

- [ ] **Step 2: Update the known-gaps section**

Mark:

- legacy data as contained by integrity warnings and action guards;
- E2E as automated with credential-gated authenticated coverage;
- Edge deployment as verifiable after the new function versions deploy;
- offline behavior as explicitly disclosed rather than fully offline;
- account deletion and retention as implemented;
- image precision as disclosed through `match_kind`;
- filesystem directory naming as an external compatibility path, while tracked project identity is canonical.

- [ ] **Step 3: Create the release review runbook**

List exact commands:

```bash
npm test
npm run check
npm run test:e2e
npm run verify:deployment
git diff --check
```

and the credentials required for authenticated tests.

- [ ] **Step 4: Run final verification**

Run all five commands. If deployment verification fails only because Edge Functions have not been deployed yet, report that exact external blocker and do not claim it closed.
