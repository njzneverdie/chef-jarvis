# Chef Jarvis

## Inspiration

Every recipe app starts from the recipe: you search a dish, get instructions written for a generic person, and then *you* do the hard work — converting portions, dodging allergens, guessing whether the macros fit your goals, and juggling three pots while your phone screen dims.

We wanted to flip that. **Chef Jarvis starts with the person, not the dish.** Tell it once about your body, nutrition targets, allergies, dislikes, and the equipment in your kitchen — and every meal plan, substitution, and cooking step is generated around *you*. The second inspiration was the act of cooking itself: it's a real-time, multi-threaded problem, so hands-free guided cooking with parallel timers became a core feature, not an afterthought.

## What it does

Chef Jarvis turns one sentence — "high-protein Kung Pao chicken for two" — into a complete cooking workflow:

1. **Personal food profile** — onboarding captures body data, macro targets (calculated or custom), body-composition goal, allergies, dietary needs, dislikes, and kitchen equipment.
2. **AI meal plan** — a Gemini-powered recipe with realistic portions, macros, ingredients, and steps that respect every restriction in your profile.
3. **Personalized healthy swaps** — fat-loss users get leaner alternatives, muscle-gain users get protein-forward portions, and lactose/gluten/nut/shellfish restrictions are carried into every suggestion.
4. **Smart grocery checklist** — tick off only what you need to buy; the list is saved to your account.
5. **USDA-grounded meal nutrition** — ingredients are ranked against multiple FoodData Central candidates, converted from recipe units to grams, and totaled with match coverage and confidence warnings.
6. **Chef Mode** — step-by-step guided cooking with spoken instructions (Web Speech API), a tappable step queue, and multiple independent kitchen clocks: countdowns *and* stopwatches running in parallel.
7. **Equipment adaptations** — no wok? Jarvis only suggests alternatives using devices you actually own.
8. **A closed pantry loop** — selected grocery items become a saved list, completed lists can be added to the pantry, and cooked recipes deduct the quantities they used with an undo option.
9. **Daily and weekly planning** — schedule saved recipes across seven days, merge a weekly grocery list, and log cooked or estimated meals against daily macro targets.
10. **Bilingual installable experience** — Traditional Chinese/English switching, offline PWA assets, wake lock, notifications, and cross-device cooking-session recovery.

## How we built it

A deliberately dependency-light static client, with all secrets and AI work pushed to the edge:

```text
Cloudflare Pages (static web client, vanilla JS)
  └─ Supabase
       ├─ Auth (email + confirmation flow)
       ├─ Postgres with Row Level Security
       └─ Edge Functions (Deno)
            ├─ chef-meal-plan     → Google Gemini
            └─ chef-usda-nutrition → USDA FoodData Central
```

The browser only holds the Supabase **publishable** key; Gemini and USDA keys live exclusively in Edge Function secrets, and both functions verify the caller's JWT. All user data sits behind Row Level Security.

Personalization is math before it's AI. We compute basal metabolic rate with the **Mifflin–St Jeor equation**:

$$
\mathrm{BMR} = 10m + 6.25h - 5a + s,
\qquad
s = \begin{cases} +5 & \text{male} \\ -161 & \text{female} \end{cases}
$$

then scale by activity and shift by goal:

$$
\mathrm{kcal} = \mathrm{BMR} \times f_{\text{activity}} + \Delta_{\text{goal}},
\quad
f \in \{1.25, 1.45, 1.65\},\;
\Delta \in \{-350_{\text{fat loss}},\, +250_{\text{muscle gain}}\}
$$

Macros are allocated protein-first ($1.8$–$2.0\,\mathrm{g/kg}$ body weight), fat at $27\%$ of calories, and carbs take the remainder:

$$
C = \frac{\mathrm{kcal} - 4P - 0.27\,\mathrm{kcal}}{4}
$$

The meal-plan function prompts Gemini with a strict JSON schema, low temperature, and `responseMimeType: "application/json"`, then defensively strips code fences and extracts the outermost `{...}` before parsing. It tries two models with tight timeouts and, if both fail, degrades to a hand-written fallback plan (with dish-aware templates — it even pattern-matches requests like 宮保雞丁 and 蛋炒飯), so guided cooking always works.

## Challenges we ran into

- **LLM output is a hostile data source.** Gemini would occasionally wrap JSON in markdown fences, truncate, or drift from the schema. We ended up treating the model like an untrusted API: strict prompting, defensive parsing, a model fallback chain, and finally a non-AI fallback plan. Designing for graceful degradation was the biggest mindset shift.
- **Rendering untrusted content safely without a framework.** With a vanilla-JS, `innerHTML`-driven UI, every AI- or user-supplied string is a potential XSS vector. We wrote a small escaping helper and had to apply it with discipline — including inside HTML attributes.
- **Concurrent timers are harder than they look.** Independent clocks in two modes (countdown vs. stopwatch), pause/resume/reset, all surviving UI re-renders — reconciling a global tick loop with a re-rendered DOM produced subtle state bugs and taught us why separating state from view matters.
- **Platform migration mid-project.** We started on Netlify Functions and moved to Cloudflare Pages + Supabase Edge Functions. Porting the same logic across two serverless runtimes forced us to isolate pure logic (prompt building, parsing, fallbacks) from platform plumbing.

## Accomplishments that we're proud of

- **A real security model, not a demo shortcut**: JWT-verified edge functions, server-side secrets only, and Row Level Security on every user-owned table — the client never sees a private key.
- **The AI never leaves you stranded**: two-model fallback plus a hand-crafted degraded plan means a user can always cook, even when the AI is down — and the UI is honest about which one it served.
- **Honesty in nutrition data**: AI estimates are clearly labeled as whole-recipe estimates, and USDA reference values are explicitly per-100 g ingredient data — no fake precision.
- **Chef Mode feels like a product, not a feature**: one step at a time in large type, spoken instructions, and truly parallel kitchen clocks built for messy-hands cooking.
- Shipped as a **full-stack, deployed, account-based web app** — auth, database, edge functions, two external APIs — with a dependency-light static frontend.

## What we learned

- **Personalization is a data-model problem before it's an AI problem.** The magic isn't the LLM — it's a profile structured well enough (allergies, goals, equipment, dislikes) to constrain the LLM meaningfully.
- **Treat AI as an unreliable dependency**: schema-constrain it, time-box it, ground it with real data (USDA), and always have a non-AI answer ready.
- **Security boundaries beat security effort.** Putting every secret behind a JWT-verified function and every row behind RLS let the client stay simple without being scary.
- **The browser platform is deep**: Web Speech for hands-free cooking, FormData-driven forms, CSS custom properties as a design system — all without a framework, which also taught us exactly what frameworks protect you from.
- Real nutrition math (Mifflin–St Jeor, activity multipliers, protein-first allocation) — and the humility that these are estimates, which shaped honest UI copy: guidance, not medical advice.

## What's next for Chef Jarvis

The pantry-aware prompt, weekly planner, shopping view, PWA, kitchen notifications, and nutrition log from the first roadmap have now shipped. The next stage is operational maturity:

- **Configurable AI routing and observability** — move the model list into environment configuration and track latency, cost, quotas, validation failures, and fallback rate.
- **Engineering maturity** — migrate the proven product to Vite + TypeScript modules, expand Playwright coverage, and run lint/test/deploy checks in CI.
- **Privacy lifecycle** — add account deletion and a documented retention policy alongside the existing authenticated JSON data export.
- **Licensed visual coverage** — replace best-effort public image search with a licensed or first-party recipe image library.
- **Photo-based pantry input** — snap a fridge or receipt and review the ingredients before adding them to inventory.

The full chronological debugging and product story is recorded in [`DEVELOPMENT_JOURNEY.md`](./DEVELOPMENT_JOURNEY.md), including the timer race, unsafe substitution discovery, Gemini model 404, USDA matching work, and the production startup incident.
