# Chef Jarvis

Chef Jarvis is a personalized AI cooking companion that turns a meal idea into a complete cooking workflow: a profile-aware recipe, a checkable grocery list, healthy ingredient substitutions, guided cooking steps, and independent kitchen timers.

**Live app:** [chef-jarvis.pages.dev](https://chef-jarvis.pages.dev)

## Why Chef Jarvis

Most recipe apps start with a generic recipe. Chef Jarvis starts with the person cooking it.

During onboarding, users set their nutrition target, body goal, allergies, dietary needs, dislikes, and available kitchen equipment. Every plan is then designed around that profile.

Its primary product principle is **personalized healthy swaps**:

- Recomposition / fat-loss users get leaner, higher-protein alternatives.
- Muscle-gain users receive protein-forward portion suggestions.
- Lactose intolerance, gluten-free needs, and common food allergies are carried into every plan.
- Users can select a suggested substitute before starting guided cooking.

## Core experience

1. **Create an account and food profile** — body data, calorie/macronutrient targets, health goal, allergies, dietary preferences, dislikes, and kitchen equipment.
2. **Ask for a meal** — enter a dish or a free-form request such as “high-protein Kung Pao chicken for two.”
3. **Receive a personalized plan** — exact purchasable ingredient names, measured quantities, preparation notes, macros, cooking steps, equipment alternatives, and ideas that reuse purchased ingredients.
4. **Build and use a grocery checklist** — save only what is needed, then check off or delete lists from the Shopping page.
5. **Choose healthy swaps** — review profile-safe replacements before cooking.
6. **Cook in Chef Mode** — work through persistent step-by-step instructions with independent countdowns, stopwatches, completion alarms, notifications, and screen wake lock.
7. **Verify nutrition** — USDA FoodData Central reference values load in the background so the recipe is usable immediately.

## Feature set

| Area                | Included capabilities                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Personalization     | Macro target calculator or custom targets, body-composition goals, allergies, dietary preferences, dislikes, equipment profile |
| AI meal planning    | Gemini-powered bilingual plan using the server-verified profile and pantry, with strict validation and per-user quotas         |
| Smart swaps         | Fat-loss, recomposition, muscle-gain, lactose-free, gluten-free, nut-safe, and shellfish-safe alternatives                     |
| Grocery planning    | Checkable, separately listed ingredients with exact units and a dedicated page for persistent shopping lists                   |
| Chef Mode           | Persistent guided steps, language-aware speech, parallel timers, completion alerts, notifications, and wake lock               |
| Pantry and planning | Pantry inventory, saved meal cards, ingredient-reuse ideas for later meal planning                                             |
| Nutrition           | USDA FoodData Central ingredient reference data, loaded after the plan so it does not block the user                           |
| Language and images | English / Traditional Chinese UI toggle plus dish-specific Wikimedia Commons images with source and license attribution        |

## Product preview

| Personalized home                                                                 | Exact recipe and grocery list                                                              | Guided Chef Mode                                                                  |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| ![Chef Jarvis Traditional Chinese home](docs/screenshots/chef-jarvis-home-zh.png) | ![Chef Jarvis precise Kung Pao recipe](docs/screenshots/chef-jarvis-precise-recipe-zh.png) | ![Chef Jarvis guided cooking mode](docs/screenshots/chef-jarvis-chef-mode-zh.png) |

## Architecture

```text
Cloudflare Pages
  └─ Static web client
       ├─ Supabase Auth
       ├─ Supabase Postgres + RLS
       └─ Supabase Edge Functions
            ├─ chef-meal-plan → Gemini API
            └─ chef-usda-nutrition → USDA FoodData Central API
```

### Security model

- The browser only contains the Supabase **publishable** key.
- Gemini and USDA credentials are server-side Supabase Edge Function secrets.
- Both Edge Functions require a valid Supabase user JWT.
- User-owned data is protected with Supabase Row Level Security.

## Repository structure

```text
public/                         Cloudflare Pages static web app
  app.js                        Auth, shell, profile, and pantry UI
  chef-mode.js                  Planning, shopping, guided cooking, and one timer loop
  domain.js                     Tested nutrition and timer domain functions
  *.css                         Readable visual system and feature styles
supabase/functions/
  chef-meal-plan/               Authenticated Gemini meal-plan endpoint
  chef-usda-nutrition/          Authenticated USDA nutrition endpoint
supabase/migrations/            AI quota table, RLS, grants, and atomic quota function
tests/                          Node tests for nutrition and timer behavior
```

## Local development

This project is currently a dependency-light static app. Serve `public/` with any local static server, then sign in with a test Supabase account.

```bash
npm run serve
```

Run the local checks before deploying:

```bash
npm test
npm run check
```

The deployed client calls these Supabase functions:

```text
POST /functions/v1/chef-meal-plan
POST /functions/v1/chef-usda-nutrition
```

Both requests require the signed-in user’s access token and the project publishable key.

## Required Supabase Edge Function secrets

Set these in **Supabase Dashboard → Edge Functions → Secrets**. Do not place them in frontend code or commit them to Git.

```text
GEMINI_API_KEY=<Google AI Studio key>
USDA_FDC_API_KEY=<USDA FoodData Central key>
ALLOWED_ORIGINS=https://chef-jarvis.pages.dev,https://your-preview.example
```

Supabase-provided runtime variables (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`) are read by the functions. The service role never leaves the server; it is used to read the authenticated user’s profile and pantry and to consume the internal quota RPC.

## Applying Supabase changes

Link the local folder to the intended Supabase project, inspect the pending migration, then apply and deploy it before the updated meal-plan function:

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push
npx supabase functions deploy chef-meal-plan
npx supabase functions deploy chef-usda-nutrition
```

The meal-plan quota defaults to 5 requests per minute and 100 per rolling 24 hours per user.

## Deploying to Cloudflare Pages

The current production deployment is on Cloudflare Pages.

```bash
npx wrangler pages deploy public --project-name chef-jarvis --branch main
```

Cloudflare authentication is required locally. Supabase Edge Functions are deployed separately from the Supabase project.

## Product notes

- USDA values are references per 100 g. Final recipe nutrition varies by brand, portion, and cooking oil.
- Healthy swaps are guidance, not medical advice. Users with severe allergies should still check product labels.
- The design is web-first but the system boundaries also support a future App Store client using the same Supabase backend and Edge Functions.

## License

Private — all rights reserved.
