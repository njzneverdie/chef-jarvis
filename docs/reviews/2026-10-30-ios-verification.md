# iOS rebuild verification — 2026-10-30

## Architecture and review

Independent baseline review recommended a React Native rebuild, reusing tested domain code and Supabase contracts. The existing Expo app only contained fixed demo values and alert placeholders. The new client lives in `mobile/`; the older prototype is retained. Existing dirty web changes were preserved; the public privacy policy was extended for native voice/local storage and redeployed.

Independent implementation review found auth-transition, timer-permission, old-notification, cloud-hydration and finish/sync races; these were corrected with account epochs, functional identity-checked updates, invalidation, reactive hydration and an ending lock. Food swaps now invalidate nutrition, remaining full-step swap proposals, saved identity and image exactness. USDA references propagate into the cooking recipe and log metadata. Pantry deduction uses per-item journals and conditional quantity/name/unit updates, with individual undo and six-decimal quantity precision.

## Verified

- Production website redeployed: https://4f88809e.chef-jarvis.pages.dev (primary https://chef-jarvis.pages.dev).
- Supabase project was INACTIVE, restoration requested, then all three deployed Edge function versions matched local expectations.
- All public-file SHA-256 deployment comparisons passed.
- Web Node tests: 231 passed.
- Public/mocked browser suite: 8 passed; 6 credential-required tests initially skipped.
- Mobile TypeScript check passed; 8 domain/build-path tests passed; shared domain byte parity passed.
- iOS Release build succeeded with Xcode 27.2 for iPhone 17e / iOS 27.2.
- Real native launch verified after official SDK57 Scene support and simulator-only Keychain entitlement configuration. Simulator builds need local ad-hoc signing; compiling unsigned does not establish Keychain works.
- Native bilingual switch, restart language persistence and invalid login validation passed.
- User-supplied test account signed in successfully; restart retained session through Keychain and reloaded existing cloud food profile.
- Pantry test record `QA RICE`: inserted at 100 g; edited to 125 g and confirmed in UI.

No test credentials are saved in source or this report. The iOS password-save prompt was not accepted; restarting the app dismissed it. Account deletion is not tested against this user account.

## Remaining release gates

- Complete native live recipe/save/grocery/week/cooking acceptance and record outcomes below.
- Real iPhone microphone permission denial, recognition, notifications/lock screen, suspension and relaunch tests.
- iPad/rotation, large text and VoiceOver checks across signed-in forms.
- Confirm stable bundle identifier/ownership, privacy labels, screenshots, age rating, review demo account and license evidence before App Store submission.
- No paid Apple membership or App Store submission attempted. No payments, HealthKit or camera-recognition feature included.
- npm audit currently reports 7 low-severity transitive development-tool findings; no moderate/high/critical findings. Zod was pinned to patched 4.6.7.

## Live-account follow-up

- Real native sign-in/session persistence/profile fetch passed.
- Pantry insert/edit passed (`QA RICE`, 100 → 125 g).
- Native general meal request returned an actual AI recipe: 清蒸檸檬鯛魚佐藜麥, 2 servings, measured ingredients and four cooking steps.
- Recipe save and grocery-list creation passed in native UI; six measured grocery rows displayed. New list's ginger checkbox update passed.
- Exact-dish request `Chicken and Rice` first asked for clarification, then returned a bounded 503. Function logs identify generation timeout and unavailable external provider. This limitation remains; no unrelated substitute recipe was shown and no server model change was made without a confirmed cause.
- Credential-enabled web E2E initially exposed duplicate profile boot/navigation replacement (13 pass, 1 fail). A new regression caught two profile fetches per sign-in, then passed after profile boot was deduplicated. All 15 browser tests now pass with credentials. 231 Node tests pass after updating source-contract boundaries to the extracted loader.
- Test credentials were supplied only to the running native app and ephemeral test process environment; never written to project source or this report.

- Native grocery-to-pantry transfer passed: selected ginger became a 10 g pantry entry; the original `QA RICE` remained 125 g.
- Native current-week schedule persisted but did not refresh immediately on the first new plan. Extracted ordered schedule orchestration, added a failing regression, then fixed it to reload the created plan ID after writing the slot. Mobile suite now has 9 passing tests.
- Native saved-recipe reopen and guided cooking navigation passed; step advanced from 1/4 to 2/4. Stopwatch started without requiring notification permissions.
- USDA native lookup encountered a transport/network-connection-lost error; no matching function invocation was visible in the queried log window. Successful USDA end-to-end acceptance remains unproven.
- Latest web deployment after auth race fix: https://9d8bd779.chef-jarvis.pages.dev, cache version `20261030-ios-auth-boot-fix`; all deployed file hashes and three Edge versions match.

- Updated Release app installed without losing test-account session. Guided cooking restored step 2/4 and the stopwatch correctly advanced to 00:57 across termination/update/relaunch; paused at 01:02.
- Pantry-use preview matched ginger 10 → 0 g, per-item apply changed to Undo, and Undo returned to the Deduct state. No meal-consumption or account-deletion action was executed. The test cooking session is left paused for user inspection.
- Final gates: 231 web tests, 15 credential-enabled browser tests, 9 mobile tests, TypeScript, whitespace, shared-domain parity and production deployment identity all pass. Physical-device and unresolved external-service cases above remain outside the passing claim.
