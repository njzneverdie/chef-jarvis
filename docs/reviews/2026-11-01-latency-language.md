# 2026-11-01 — Recipe latency and mixed-language output

Scope: iOS "幫我決定這一餐" (selection-first) is slow; zh-TW recipes show English
ingredient names / units. No production measurement was possible (the
Supabase project `mylcykwmwlnjlclodmuo` logs are not readable from the
connected Supabase account), so the latency analysis is from code.

## A. Latency — root causes (from code)

Selection requests are always `broad_request`: all 1200 planner choice
combinations × {zh-TW, en} from `ChefDomain.buildMealPlanningRequest` were run
through `classifyMealRequest` and none became `named_dish`. So selection
requests never pay for dish resolution, TheMealDB, or the identity verifier.

Request path for a selection request (`supabase/functions/chef-meal-plan/index.ts`):

1. Auth `getUser` → 5 parallel DB reads → quota RPC (`:2993`). Sequential, but sub-second.
2. Generation on `gemini-3.1-flash-lite`, cap 12 s (`:3119`), `thinkingLevel: "minimal"`, `maxOutputTokens: 6500` (`:225-226`). Thinking is already minimal.
3. Up to `MAX_RECIPE_REPAIRS = 2` repairs (`:53`), each re-sending the whole prompt plus the invalid JSON and regenerating the **entire** recipe, cap 8 s each (`:3223`).
4. If validation is "fatal", the loop breaks and escalates to `gemini-3.5-flash`, cap 18 s (`:3120`, `:3198`, `:3227`) with the identical prompt.
5. All bounded by `EDGE_DEADLINE_MS = 42_000` (`:51`) minus `REFUND_RESERVE_MS = 1_500` (`:52`).

Main causes:

- **Variety rejection forces the slow model.** `recipeVarietyRejectionReason`
  (`_shared/recipe-variety.js:123,141`) is not in `repairablePatterns`
  (`_shared/named-recipe-integrity.js:524`), so a "too similar to a recent recipe"
  result is fatal. The whole flash-lite generation is thrown away and the
  request escalates to the slower `gemini-3.5-flash` with the **same prompt**
  (it is not told what was rejected, so it can repeat). "Jarvis decides" with
  recent history makes this likely. Typical cost: ~10 s + ~15 s or more.
- **Output size.** The JSON contract asks for substitutions with fully
  rewritten `step_updates` (up to 8), equipment adaptations, up to 4 reuse
  ideas. Output tokens are the main per-call cost, and every repair
  regenerates all of it.
- **Worst case** = 12 + 8 + 8 s (flash-lite + 2 repairs) + the remaining ~12 s on
  3.5-flash ≈ 40 s, then a canned selection fallback.
- iOS showed only "正在準備食譜…" during this time; web shows staged messages.

## A. Changes

- `index.ts`: on a variety rejection, add **one extra flash-lite attempt**
  (`modelAttempts.splice`, `:3183`). It includes the rejected title as quoted
  data and uses temperature 0.8. Escalation to 3.5-flash stays as the last
  resort, and the 42 s deadline still bounds everything. Later attempts also
  carry the rejected title. Allergen, restriction, constraint, timer and egress
  allergen-gate validation are unchanged.
- The prompt now asks for a smaller output: exactly 1–2 substitutions, summary
  ≤ 2 sentences, `equipment_adaptations: []` unless the user lacks equipment
  (then ≤ 2), and ≤ 2 reuse ideas. The validator ceilings are unchanged (8
  substitutions max).
- Not changed: thinking (already minimal), repair count, model order, and
  quota/DB ordering. That ordering is mostly sub-second, and changing it
  affects refund semantics.
- iOS `PlanScreen` (`mobile/src/MealScreens.tsx`): staged progress text under
  the button at 0 / 8 / 22 s (same copy as web), using `accessibilityLiveRegion="polite"`.

## B. Mixed language — causes and changes

- `language` **is** passed (`mobile` sends `language: st.lang`, server reads it).
  The prompt only said "Create one … meal plan in Traditional Chinese". Every
  example in it is English, and it never said ingredient names, preparation
  and timer labels must be Chinese. Units are an English enum by design.
  Selection fallback templates are already localized. TheMealDB is only used
  for named dishes (never for selection) and is English, but generation now
  has to translate it.
- Prompt: a new **output-language contract** (`:3054`) lists every
  user-facing field. It keeps `image_query`/`usda_query` in English and
  `unit`/`category` as untranslated enums. `PROMPT_VERSION` is now
  `2026-11-01.1`, and `FUNCTION_VERSION` is now `2026-11-01.latency-language.27`
  (also updated in `scripts/verify-deployment.mjs` and its test).
- Observability: `chef_recipe_language` log (count only, no content) when a
  zh-TW plan has English-only fields. It does not add a repair round.
- Display: new `ChefDomain.unitLabel(unit, language, quantity)` in
  `public/domain.js` (synced to `mobile/src/shared-domain.js`). zh-TW: g→克,
  kg→公斤, ml→毫升, L→公升, tsp→茶匙, tbsp→湯匙, cup→杯, piece→個,
  clove→瓣, slice→片, can→罐, pack→包. 茶匙/湯匙 are kept rather than
  小匙/大匙 because web and existing tests already use them. The parser
  accepts 克/公克/公斤/毫升/公升/小匙/大匙 too. Stored data keeps the enum.
  - iOS: RecipeCard ingredients, pantry list, shopping list, PantryUse.
  - Web: ingredient cards (via `normalizeIngredient`, now also 克/毫升…), shopping list (`displayShoppingUnit` now delegates), pantry cards (`app.js`).
  - PWA asset version bumped to `20261101-latency-language`.

## Tests

- `npm test` (root): 244 pass / 0 fail (added a unit-label test).
- `npm run test:edge`: 9 pass / 0 fail. The new test checks that a
  recent-repeat rejection retries flash-lite with the rejected title, and
  that the prompt carries the language contract.
- `mobile`: `npx tsc --noEmit` clean, `npm test` 14/14, `sync-domain --check` identical.

## Deploy needed (not run)

All server-side changes (variety retry, smaller output, language contract,
language log) take effect only after deploying the Edge function:

    supabase functions deploy chef-meal-plan --project-ref mylcykwmwlnjlclodmuo

Unit labels and staged progress are client-side. They work on iOS once the new
build is installed, and on web after the next Pages deploy.

## iOS build

Release build for iPhone `00008140-001A22E40151801C`: **BUILD SUCCEEDED**
(using `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`, because
`xcode-select` points at CommandLineTools). It is installed with `devicectl`.
Launch was refused because the phone was locked, so open Chef Jarvis on the
phone manually.
