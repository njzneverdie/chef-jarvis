# Chef Jarvis Release Review

Use this checklist from the repository root before every release. The tracked
Supabase project identity is `chef-jarvis`; the historical local directory name
does not determine the deployed project.

## 1. Local automated gates

```bash
npm test
npm run check
npm run test:e2e
git diff --check
```

Expected result:

- Node domain and source-contract tests all pass.
- JavaScript syntax and PWA asset versions are synchronized.
- Public Playwright tests pass.
- The authenticated Playwright test either passes with the dedicated
  credentials below or reports one intentional skip.
- Git reports no whitespace errors.

For authenticated read-only navigation coverage:

```bash
CHEF_E2E_EMAIL=<dedicated-test-account> \
CHEF_E2E_PASSWORD=<test-only-password> \
npm run test:e2e
```

The account must have confirmed email and completed onboarding. Do not use a
personal account. Tests that create, update, or delete production data require
a separate disposable account and explicit cleanup; the current authenticated
smoke suite is read-only.

## 2. Database and Edge Functions

Review pending migrations, then apply them before deploying the functions:

```bash
npx supabase link --project-ref <project-ref>
npx supabase migration list
npx supabase db push
npx supabase functions deploy chef-meal-plan
npx supabase functions deploy chef-usda-nutrition
npx supabase functions deploy chef-delete-account
```

Confirm that `GEMINI_API_KEY`, `USDA_FDC_API_KEY`, and `ALLOWED_ORIGINS` are set.
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are
Supabase-managed runtime values and must never be copied into frontend files.

## 3. Cloudflare Pages

Deploy the exact reviewed `public/` directory:

```bash
npx wrangler pages deploy public --project-name chef-jarvis --branch main
```

## 4. Deployment identity check

After Cloudflare and all three Edge Functions are deployed, run:

```bash
npm run verify:deployment
```

This compares SHA-256 digests for `boot.js`, `domain.js`, `app.js`, and
`chef-mode.js`, then checks version headers from all Edge Functions using
`OPTIONS`. The request does not authenticate, call Gemini or USDA, consume
quota, or mutate user data.

A mismatch is a failed release gate. Deploy the missing component or review why
production intentionally differs; do not update the expected local version just
to make the check pass.

## 5. Manual high-risk review

With a disposable account only:

- Export account data and inspect the JSON collections.
- Confirm legacy unmeasured recipes display a warning and cannot start cooking.
- Confirm an unmeasured shopping list cannot update pantry.
- Generate one AI meal and inspect exact quantities, timers, swaps, image label,
  and USDA coverage.
- Complete Chef Mode and verify nutrition/pantry feedback behavior.
- Download the export, then type `DELETE` in the account deletion flow.
- Confirm the deleted credentials can no longer sign in and linked rows are
  gone.

Do not run destructive production checks against a personal or shared account.
