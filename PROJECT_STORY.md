# Chef Jarvis — Project Story

## 💡 Inspiration

Every recipe app I've used starts from the same place: the recipe. You search "Kung Pao chicken," you get a generic recipe written for a generic person, and then *you* do all the hard work — mentally converting portions, swapping out the peanuts because of an allergy, guessing whether the macros fit your training goals, and juggling three pots while scrolling a webpage that keeps dimming.

I wanted to flip that. **Chef Jarvis starts with the person, not the dish.** You tell it once about your body, your nutrition targets, your allergies, your dislikes, and even the equipment in your kitchen — and from that point on, every meal plan, every ingredient substitution, and every cooking step is generated around *you*. The name says it: not a recipe database, but a personal sous-chef.

The second inspiration was the moment of actually cooking. Reading a recipe is easy; executing one is a real-time, multi-threaded problem — the rice is steaming, the chicken needs flipping in 90 seconds, and your hands are covered in marinade. That's why guided **Chef Mode** with parallel timers and spoken instructions became a core feature, not an afterthought.

## 🛠 How I built it

### Architecture

I deliberately kept the client dependency-light — a static site — and pushed all secrets and AI work to the edge:

```text
Cloudflare Pages (static web client, vanilla JS)
  └─ Supabase
       ├─ Auth (email + confirmation flow)
       ├─ Postgres with Row Level Security
       └─ Edge Functions (Deno)
            ├─ chef-meal-plan     → Google Gemini
            └─ chef-usda-nutrition → USDA FoodData Central
```

The browser only ever holds the Supabase **publishable** key. The Gemini and USDA API keys live exclusively in Edge Function secrets, and both functions verify the caller's Supabase JWT before doing anything. User data (profiles, pantry, saved recipes, shopping lists) is protected by RLS, so even the API itself can't leak one user's data to another.

### The personalization engine

Onboarding computes each user's daily targets from first principles. I used the **Mifflin–St Jeor equation** for basal metabolic rate:

$$
\mathrm{BMR} = 10m + 6.25h - 5a + s
\qquad
s = \begin{cases} +5 & \text{male} \\ -161 & \text{female} \end{cases}
$$

where $m$ is weight in kg, $h$ is height in cm, and $a$ is age. Daily calories scale by an activity factor and shift by goal:

$$
\mathrm{kcal} = \mathrm{BMR} \times f_{\text{activity}} + \Delta_{\text{goal}},
\qquad
f \in \{1.25, 1.45, 1.65\},\;
\Delta \in \{-350_{\text{fat loss}},\; +250_{\text{muscle gain}}\}
$$

Macros are then allocated protein-first — $1.8\,\mathrm{g/kg}$ of body weight (or $2.0$ for muscle gain), fat at $27\%$ of calories, and carbohydrates take the remainder:

$$
C = \frac{\mathrm{kcal} - 4P - 0.27\,\mathrm{kcal}}{4}
$$

Users who already know their numbers can override everything with custom targets.

### AI meal planning with a safety net

The `chef-meal-plan` Edge Function builds a strict prompt: respect every allergy, never recommend an allergen, only suggest equipment alternatives the user actually owns, and return **only** a fixed JSON schema (title, macros, ingredients, steps, substitutions, equipment adaptations, reuse ideas). I set `responseMimeType: "application/json"` and a low temperature, then defensively strip code fences and extract the outermost `{...}` before parsing — because LLMs don't always do what they're told.

Crucially, the function **never returns a blank failure**. It tries two Gemini models in sequence with tight timeouts, and if both fail it degrades to a hand-written fallback plan (with dish-aware ingredient templates — it even pattern-matches requests like 宮保雞丁 and 蛋炒飯) so the guided-cooking experience still works while the AI is busy. The UI labels fallback plans honestly and asks the user to verify quantities.

### Grounded nutrition

AI-estimated macros are useful but unverifiable, so after each plan renders, the client asynchronously calls `chef-usda-nutrition`, which matches each ingredient against **USDA FoodData Central** and returns per-100 g reference values (energy via nutrient #208, protein, carbs, fat). It loads in the background so it never blocks cooking, and the UI is explicit that these are *ingredient references*, not the meal total — an honesty-in-data decision I care about.

### Chef Mode

The cooking screen is built around one rule: **the cook's attention is the scarcest resource.** One step at a time in large type, a tappable step queue, spoken instructions via the Web Speech API, and independent kitchen clocks — countdowns *and* stopwatches running in parallel, because real cooking is concurrent. Equipment adaptations from the plan ("no wok? here's the skillet method") surface inline right where you need them.

## 🧗 Challenges I ran into

1. **LLM output is a hostile data source.** Gemini would occasionally wrap JSON in markdown fences, truncate, or drift from the schema. I ended up treating the model like an untrusted API: strict prompt, JSON response mode, defensive parsing, model fallback chain, and finally the non-AI fallback plan. Designing for *graceful degradation* rather than assuming success was the single biggest mindset shift.

2. **Rendering untrusted content safely without a framework.** With a vanilla-JS, `innerHTML`-driven UI, every AI- or user-supplied string is a potential XSS vector. I wrote a small `esc()` helper and had to be disciplined about applying it everywhere — including inside HTML attributes. A framework gives you this for free; going without one taught me exactly what the framework was protecting me from.

3. **Concurrent timers are harder than they look.** Multiple independent clocks, two modes (countdown vs. stopwatch), pause/resume/reset, all surviving re-renders of the surrounding UI — reconciling a global tick loop with a re-rendered DOM produced subtle bugs (including two tick loops fighting over the same timer array). It was a miniature lesson in why separating state from view matters.

4. **Platform migration mid-project.** The app started life on Netlify Functions and moved to Cloudflare Pages + Supabase Edge Functions. Porting the same logic across two serverless runtimes (Node-style vs. Deno) forced me to isolate the pure logic (prompt building, JSON parsing, fallback plans) from platform plumbing — accidental but valuable architecture practice.

5. **Growing a codebase by layering.** Features like Chef Mode were added as an overlay script that wraps and overrides earlier render functions. It kept iteration fast, but taught me firsthand how an "override chain" becomes technical debt — and why the next version needs a proper module system and build step.

## 📚 What I learned

- **Personalization is a data-model problem before it's an AI problem.** The magic isn't the LLM — it's that the profile (allergies, goals, equipment, dislikes) is structured well enough to constrain the LLM meaningfully.
- **Treat AI as an unreliable dependency**: schema-constrain it, time-box it, verify it (USDA grounding), and always have a non-AI answer ready.
- **Security boundaries beat security effort.** Putting every secret behind a JWT-verified edge function and every row behind RLS meant the client could stay simple without being scary.
- **The browser platform is deep**: Web Speech for hands-free cooking, `FormData`-driven forms, CSS custom properties for a full design system — all without a single framework.
- Real nutrition math: Mifflin–St Jeor, activity multipliers, and protein-first macro allocation — and the humility that these are *estimates*, which shaped honest UI copy ("guidance, not medical advice").

## 🚀 What's next

The pantry-aware prompt, dedicated shopping view, weekly planner, PWA, wake lock, notifications, nutrition logging, voice control, and inventory loop described in the original roadmap are now working product features. The next phase is less about adding another isolated screen and more about making the system easier to operate at scale:

- Move Gemini model routing into environment configuration and monitor model retirement, latency, quota, and fallback rate.
- Migrate the proven vanilla-JS product to Vite + TypeScript modules, then add CI and a broader Playwright end-to-end suite.
- Add account deletion, a documented data-retention policy, and product analytics that do not expose private nutrition data.
- Build a licensed recipe-image source or first-party image library instead of depending on public search coverage.
- Photo-based pantry input: snap a fridge or receipt and let vision AI prepare a reviewable inventory draft.

The complete engineering journey—including the timer race, AI model 404, safe substitution contract, USDA matching, cross-device cooking sessions, and the production CDN startup incident—is documented in [`DEVELOPMENT_JOURNEY.md`](./DEVELOPMENT_JOURNEY.md).

Chef Jarvis started as a question — *what if the recipe adapted to you, instead of the other way around?* — and became a full-stack answer I now cook with.
