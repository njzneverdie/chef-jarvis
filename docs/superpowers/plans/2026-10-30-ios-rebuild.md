# Chef Jarvis iOS Rebuild Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans; user delegated implementation decisions and requested Xcode testing.

**Goal:** Replace the demonstration with a bilingual native iOS client of the current Chef Jarvis product.
**Architecture:** Expo React Native native screens; shared tested JS domain; Supabase SDK with Keychain session storage; user-scoped local cooking deadlines and OS notifications.
**Tech Stack:** Expo SDK 57, React Native 0.86, TypeScript, Supabase, Expo Notifications/SecureStore/FileSystem/Sharing/Speech.
**Spec:** ../..//reviews/2026-10-30-ios-baseline.md

## Global Constraints
- Keep the old prototype and existing dirty web changes intact.
- No service-role/AI key in the client; existing publishable key only.
- Session-only sourced content never persists or enters USDA lookups, saved plans or cloud sessions.
- Account changes invalidate in-flight work and clear local memory; timers have persisted wall-clock deadlines.
- Local Xcode simulator build first; no paid membership or store submission.

## Review Focus
- Auth switch during an async mutation must not publish another account's data.
- Timers must reconcile after suspension and cancel native alarms on pause/exit.
- Legacy unmeasured recipes remain readable but cannot cook/save groceries.
- Failed fetch is an error, never a false successful empty inventory.
- Source-only recipe content cannot leak into persistent state.

### Task 1: Client contracts, storage and domain
- [x] Write/run failing Node tests for timer deadlines, session-only serialization and recipe safety.
- [x] Implement pure mobile domain and copy upstream domain with synchronization check.
- [x] Install compatible native dependencies and configure app identity, icons, auth callback.
- [x] Implement SDK client, secure sessions, guarded user requests and feature table operations.

### Task 2: Native product screens
- [x] Build shared accessible form/card/button system and bilingual copy.
- [x] Implement auth/reset, dashboard, meal generation/clarification, source attribution/swaps, saved recipes.
- [x] Implement editable profile, pantry CRUD, shopping lists, weekly planning, nutrition log and feedback.
- [x] Implement guided cook, native notification scheduling, speech, wake lock, persistence, export/delete.
- [x] Run typecheck, domain tests and JS bundle export.

### Task 3: Xcode and release verification
- [x] Generate iOS workspace/install Pods and build for booted simulator.
- [x] Install/launch and inspect native UI; verify tests or record precise untested flows.
- [x] Fresh independent review, fix important findings, rerun relevant checks.
- [x] Document Xcode entry point, remaining backend/physical-device/store acceptance gates.

## Ledger
- Baseline: 231 web Node tests pass; 8 browser tests pass; 6 real-account tests skipped.
- Ruling: user explicitly delegated decision and asked to proceed; no extra design approval round.

- Native credential acceptance added after user supplied a test account: sign-in/restart, pantry create/edit, AI generic generation, save/reopen, grocery creation/check/transfer, week insertion and guided-cook/stopwatch tested. Named-dish timeout and USDA transport failure remain documented release concerns. Destructive account deletion and physical-device tests were intentionally not performed.
