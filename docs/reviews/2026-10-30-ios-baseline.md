# iOS baseline review — 2026-10-30

Reviewed web, Supabase migrations/functions, and separate Expo prototype. Independent reviewer found no confirmed P0. Findings:

- P1: Expo App.tsx:38–42 substitutes fixed data/alerts for generation, pantry, profile and notifications. It is not a functional client.
- P1: App.tsx:21–23 starts sample timers immediately; suspension/relaunch loses time and no OS alarm is scheduled.
- P1 wrapper risk: Edge origin checks and browser auth redirects need deliberate mobile handling.
- P2: Web timers only issue a browser notification once JS wakes; native scheduled notifications are needed.
- P2: Historical 20260718090000 migration deletes unmatched legacy profiles/cards. Do not rerun/import blindly.
- P2: Expo bundle ID and App Store Connect configuration are placeholders.

## Decision

User delegated architecture and scope decisions after review. Rebuild native screens in Expo React Native and reuse existing tested domain rules/Supabase. SwiftUI adds a full domain rewrite; a WebView retains browser lifecycle limitations. Start free; no billing or unimplemented camera/HealthKit promises. Keep all current production feature areas, including bilingual profile, planning, pantry, shopping, week planning, cooking, nutrition, export/deletion. Add genuine auth, isolated storage and native deadline notifications. Existing prototype remains untouched as reference.

## Live checks

Cloudflare production deployment completed at https://72ed8b86.chef-jarvis.pages.dev. Supabase connector confirmed INACTIVE; project restoration was requested successfully. Live acceptance must be repeated after ACTIVE. Xcode 27.2 and booted iPhone 17e simulator available; command-line tools need DEVELOPER_DIR override. No developer membership required for simulator builds. Real-device signing is user-owned.
