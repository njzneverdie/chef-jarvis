# Chef Jarvis iOS

Native React Native / Expo rebuild of the production app, sharing its Supabase backend and tested ingredient/nutrition rules. The older `chef-jarvis-codex/mobile` prototype is retained separately and is not the new app.

## Open in Xcode

Open `ios/ChefJarvis.xcworkspace` (not the `.xcodeproj`). Select the ChefJarvis scheme and your iPhone or simulator, then Run. The shared Run action uses **Release**, which embeds the JavaScript bundle and works without Metro. For live development, explicitly change Run to Debug; Debug builds need Metro:

```sh
npm ci
npm start
```

The local Xcode installation is `/Applications/Xcode.app`; if command-line tools point elsewhere:

```sh
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
```

To regenerate native source after changing config/plugins:

```sh
npx expo prebuild --platform ios --no-install
LANG=en_US.UTF-8 pod install --project-directory=ios
```

The share extension `ios/ChefJarvisShare` (target `ChefJarvisShare`, bundle ID `com.njzneverdie.chefjarvis.share`) puts Chef Jarvis in the share sheet of Instagram, YouTube and Safari. It takes the first YouTube or Instagram link and opens `chefjarvis://import?url=<link>`. It lives only in the native project: `expo prebuild` regenerates `ios/` and would drop it, so re-add it afterwards (or avoid prebuild). On a real iPhone, select your Personal Team for both the ChefJarvis and ChefJarvisShare targets.

A Release simulator build embeds JS and does not need Metro. See `scripts/build-ios-simulator.sh`. Simulator signing is local/ad-hoc and does not require paid membership. For a real iPhone, select your own Personal Team under Signing & Capabilities. `with-local-notifications.cjs` removes APNs entitlements (registered first because Expo mods unwind in reverse); kitchen timers use local notifications. A Release build was signed, installed and launched on the connected iPhone with the user’s Personal Team. App Store distribution will require Apple Developer enrollment and a finalized bundle ID (currently `com.njzneverdie.chefjarvis`). No App Store submission has been attempted.

## Feature coverage

- English/Traditional Chinese screens and persisted language choice.
- Real Supabase email/password sign-in, email confirmation and website-based password recovery; Keychain session storage and automatic refresh.
- Food profile: calculated/custom nutrition, body goals, allergy/diet/dislike/equipment lists.
- Selection-first AI planning: no dish-name typing; one-tap defaults, serving/time chips, optional meal/priority/cuisine choices, server-validated serving/time limits. Dish clarification, attribution and source-only persistence restrictions remain supported.
- Measured recipe details, healthy substitutions, equipment alternatives and reuse ideas.
- Saved recipes, pantry add/edit/remove, checked shopping lists and inventory transfer.
- Current-week meal scheduling, serving scaling and merged weekly groceries.
- USDA references, daily journal, manual food logging and cooking feedback.
- Guided cooking, independent countdowns and stopwatches, speech output, optional speech commands, native scheduled local notifications and wake lock.
- User-scoped local progress, mobile cloud progress restoration and idempotent completion IDs.
- Optional pantry-use preview/update/undo before closing the cooking session.
- Account-scoped in-memory recommendation/choice retention across navigation; checkbox-based common food/kitchen preferences and optional custom additions.
- Collapsible cooking step queue, resettable new timers, tap-based serving adjustment and optional star feedback.
- Complete cloud-data export through the native share sheet and confirmed permanent account deletion.

No camera recognition, HealthKit, grocery checkout or payments are advertised or included. Those were concepts in the old prototype, not working production features. Source-only recipes stay in memory; they cannot enter saved recipes, persistent groceries, USDA lookups, cloud cooking, or nutrition logs.

## Important behavior

Email confirmation and password reset deliberately finish at the existing HTTPS website, followed by sign-in here. This avoids depending on an unconfigured Supabase native redirect allowlist. PKCE native callback handling exists for future configured deep-link flows.

Nutrition totals are for the whole recipe and are divided by recipe servings for display. Swaps invalidate nutrition and all remaining full-step substitution proposals; use USDA reference lookup before logging an altered recipe. Partial USDA references are shown as incomplete and never replace the original nutrition estimate for logging. Foundation Atwater energy fields are supported.

Pantry matching uses exact ingredient names and compatible units. Inventory changes use conditional quantities to avoid silently overwriting concurrent edits. Preview the whole-recipe consumption before applying it. Only the newest 100 records per main collection are loaded in the UI; export fetches full collections.

Progress created on mobile syncs through `timeline.mobile`. Existing web cooking sessions remain untouched; importing/resuming their different timer schema is not yet implemented. Use one client per cooking session.

## Verification

```sh
npm run typecheck
npm test
node scripts/sync-domain.mjs --check
npm run bundle
```

The copied `src/shared-domain.js` must remain byte-identical to `../public/domain.js`. Refresh it using `npm run sync:domain`; do not edit the copy.

Live account export/deletion acceptance, physical-device microphone/notifications/lock-screen testing, iPad/rotation/accessibility testing, and App Store metadata/privacy-label review remain release gates. Passing compilation and domain tests does not establish those flows passed.


Live native tests passed for sign-in/restart, profile loading, pantry create/edit, a real general AI recipe, saving/reopening, grocery creation/check/transfer, guided steps, stopwatch restart/pause, and pantry-use apply/undo. The first-week scheduling refresh regression was fixed and covered by the mobile suite. Earlier named-dish timeouts and a USDA transport failure are recorded in `../docs/reviews/2026-10-30-ios-verification.md`. The 2026-10-31 backend/API fixes and remaining acceptance gates are recorded in `../docs/reviews/2026-10-31-product-gap-audit.md`; the native USDA lookup, selection-only recommendation and skip-feedback completion have now also passed simulator UI checks documented in `../docs/reviews/2026-10-31-ios-fixes-verification.md`.
