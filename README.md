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
3. **Receive a personalized plan** — ingredients, portions, macros, cooking steps, equipment alternatives, and ideas that reuse purchased ingredients.
4. **Build a grocery checklist** — select only what is needed and save the list to the user’s account.
5. **Choose healthy swaps** — review profile-safe replacements before cooking.
6. **Cook in Chef Mode** — work through step-by-step instructions with multiple independent countdowns and stopwatches.
7. **Verify nutrition** — USDA FoodData Central reference values load in the background so the recipe is usable immediately.

## Feature set

| Area | Included capabilities |
| --- | --- |
| Personalization | Macro target calculator or custom targets, body-composition goals, allergies, dietary preferences, dislikes, equipment profile |
| AI meal planning | Gemini-powered recipe plan, ingredients, realistic portions, macros, steps, substitutions, reuse ideas |
| Smart swaps | Fat-loss, recomposition, muscle-gain, lactose-free, gluten-free, nut-safe, and shellfish-safe alternatives |
| Grocery planning | Checkable ingredient list, quantities, persistent saved shopping lists |
| Chef Mode | Guided steps, spoken instruction, multiple parallel timers, countdowns, stopwatches, custom clocks |
| Pantry and planning | Pantry inventory, saved meal cards, ingredient-reuse ideas for later meal planning |
| Nutrition | USDA FoodData Central ingredient reference data, loaded after the plan so it does not block the user |

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
  app.js                        Auth, profile, planning, pantry UI
  chef-mode.js                  Guided cooking, timers, grocery list, healthy swaps
  *.css                         Visual system and feature-specific styles
supabase/functions/
  chef-meal-plan/               Authenticated Gemini meal-plan endpoint
  chef-usda-nutrition/          Authenticated USDA nutrition endpoint
netlify/                        Legacy migration reference only; not used in production
```

## Local development

This project is currently a dependency-light static app. Serve `public/` with any local static server, then sign in with a test Supabase account.

```bash
npx serve public
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
```

Supabase-provided runtime variables (`SUPABASE_URL`, publishable keys, and JWT verification) are used automatically by the functions.

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
