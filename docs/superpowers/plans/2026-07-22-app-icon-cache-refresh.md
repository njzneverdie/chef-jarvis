# Chef Jarvis App Icon Cache Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Force browser, Apple touch, and installable PWA surfaces to download the approved muscular-chef artwork through a new icon URL family while preserving legacy files during the transition.

**Architecture:** Copy the already-approved PNG variants to a new `chef-jarvis-app-icon-v2-*` pathname family, then switch HTML, manifest, and Service Worker references atomically. Keep the old files unreferenced but deployed, and use the existing PWA synchronization and deployment-hash tooling to prove local and production content are identical.

**Tech Stack:** Static HTML, Web App Manifest, Service Worker, Node.js built-in test runner, Cloudflare Pages, existing deployment verification scripts.

## Global Constraints

- The artwork must remain the existing approved muscular-chef image; do not regenerate or redesign it.
- Use new `chef-jarvis-app-icon-v2-*` pathnames instead of relying only on query parameters.
- Use PWA release version `20260722-app-icon-1` across HTML, manifest, boot loader, and Service Worker.
- Keep all five legacy icon files deployed but remove them from current HTML, manifest, and Service Worker references.
- Preserve the current optimization that keeps 512 px and 1024 px installation icons out of the Service Worker core cache.
- Do not change the app name, manifest identity, branding, or runtime behavior.

---

## File Map

- `tests/ui-contracts.test.mjs`: owns browser/PWA icon reference, PNG dimension, cache-version, and legacy-compatibility contracts.
- `tests/deployment-verification.test.mjs`: declares the new icon assets as critical release files.
- `public/chef-jarvis-app-icon-v2-192.png`: new browser and PWA small-icon URL; binary-identical copy of `chef-jarvis-icon-192.png`.
- `public/chef-jarvis-app-icon-v2-512.png`: new PWA 512 px URL; binary-identical copy of `chef-jarvis-icon-512.png`.
- `public/chef-jarvis-app-icon-v2-1024.png`: new PWA 1024 px URL; binary-identical copy of `chef-jarvis-icon-1024.png`.
- `public/chef-jarvis-app-icon-v2-maskable-512.png`: new maskable PWA URL; binary-identical copy of `chef-jarvis-maskable-512.png`.
- `public/chef-jarvis-app-icon-v2-apple-180.png`: new Apple touch URL; binary-identical copy of `apple-touch-icon.png`.
- `public/index.html`: points browser, Apple, and manifest discovery at the refreshed paths/version.
- `public/manifest.webmanifest`: advertises only the new install-icon URL family.
- `public/sw.js`: precaches only the new 192 px and Apple icons and recognizes the new icon family for network-first refresh.
- `public/boot.js`: receives the synchronized PWA release version.

---

### Task 1: Add a failing icon-refresh release contract

**Files:**
- Modify: `tests/ui-contracts.test.mjs`
- Modify: `tests/deployment-verification.test.mjs`

**Interfaces:**
- Consumes: existing public files through `publicUrl` and `discoverReleasePublicFiles()`.
- Produces: a contract requiring the five new icon paths, their exact dimensions, synchronized version, absence of legacy references, and presence of legacy compatibility files.

- [ ] **Step 1: Replace the broad icon test with the cache-refresh contract**

Replace `the install experience includes translated servings and native PNG icons` in `tests/ui-contracts.test.mjs` with:

```js
test("the install experience uses the cache-refreshed app icon family", async () => {
  const [translations, index, manifestText, worker] = await Promise.all([
    readFile(new URL("i18n.js", publicUrl), "utf8"),
    readFile(new URL("index.html", publicUrl), "utf8"),
    readFile(new URL("manifest.webmanifest", publicUrl), "utf8"),
    readFile(new URL("sw.js", publicUrl), "utf8"),
  ]);
  const version = "20260722-app-icon-1";
  const expected = [
    ["chef-jarvis-app-icon-v2-192.png", 192, "any"],
    ["chef-jarvis-app-icon-v2-1024.png", 1024, "any"],
    ["chef-jarvis-app-icon-v2-512.png", 512, "any"],
    ["chef-jarvis-app-icon-v2-maskable-512.png", 512, "maskable"],
  ];

  assert.match(translations, /"Servings eaten": "實際食用份數"/);
  assert.match(index, new RegExp(`rel="icon"[^>]+chef-jarvis-app-icon-v2-192\\.png\\?v=${version}`));
  assert.match(index, new RegExp(`rel="apple-touch-icon"[^>]+chef-jarvis-app-icon-v2-apple-180\\.png\\?v=${version}`));

  const manifest = JSON.parse(manifestText);
  assert.deepEqual(
    manifest.icons.map((icon) => [icon.src, icon.sizes, icon.type, icon.purpose]),
    expected.map(([name, size, purpose]) => [
      `/${name}?v=${version}`,
      `${size}x${size}`,
      "image/png",
      purpose,
    ]),
  );

  for (const [name, size] of [
    ...expected.map(([name, size]) => [name, size]),
    ["chef-jarvis-app-icon-v2-apple-180.png", 180],
  ]) {
    const png = await readFile(new URL(name, publicUrl));
    assert.equal(png.toString("ascii", 1, 4), "PNG");
    assert.equal(png.readUInt32BE(16), size, `${name} width`);
    assert.equal(png.readUInt32BE(20), size, `${name} height`);
  }

  const references = `${index}\n${manifestText}\n${worker}`;
  assert.doesNotMatch(
    references,
    /(?:chef-jarvis-icon-(?:192|512|1024)|chef-jarvis-maskable-512|apple-touch-icon)\\.png/,
  );

  for (const legacy of [
    "chef-jarvis-icon-192.png",
    "chef-jarvis-icon-512.png",
    "chef-jarvis-icon-1024.png",
    "chef-jarvis-maskable-512.png",
    "apple-touch-icon.png",
  ]) {
    assert.ok((await stat(new URL(legacy, publicUrl))).isFile());
  }
});
```

- [ ] **Step 2: Make the release-discovery test require the new files**

Add these entries to the critical-file array in `tests/deployment-verification.test.mjs`:

```js
"chef-jarvis-app-icon-v2-192.png",
"chef-jarvis-app-icon-v2-512.png",
"chef-jarvis-app-icon-v2-1024.png",
"chef-jarvis-app-icon-v2-maskable-512.png",
"chef-jarvis-app-icon-v2-apple-180.png",
```

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```bash
node --test --test-name-pattern="cache-refreshed app icon family|release asset discovery" tests/ui-contracts.test.mjs tests/deployment-verification.test.mjs
```

Expected: FAIL because `index.html` still references `chef-jarvis-icon-192.png` and the new files do not exist. The failure must be an assertion or missing-file error tied to the new icon family.

---

### Task 2: Publish the approved artwork under new paths

**Files:**
- Create: `public/chef-jarvis-app-icon-v2-192.png`
- Create: `public/chef-jarvis-app-icon-v2-512.png`
- Create: `public/chef-jarvis-app-icon-v2-1024.png`
- Create: `public/chef-jarvis-app-icon-v2-maskable-512.png`
- Create: `public/chef-jarvis-app-icon-v2-apple-180.png`
- Modify: `public/index.html`
- Modify: `public/manifest.webmanifest`
- Modify: `public/sw.js`
- Modify: `public/boot.js`

**Interfaces:**
- Consumes: the five approved legacy PNGs as immutable source artwork and `scripts/sync-pwa-assets.mjs` as the version synchronizer.
- Produces: five new public URLs and one synchronized PWA release version consumed by browsers, installers, and Task 3 verification.

- [ ] **Step 1: Copy the approved PNG variants without re-encoding**

Run:

```bash
cp public/chef-jarvis-icon-192.png public/chef-jarvis-app-icon-v2-192.png
cp public/chef-jarvis-icon-512.png public/chef-jarvis-app-icon-v2-512.png
cp public/chef-jarvis-icon-1024.png public/chef-jarvis-app-icon-v2-1024.png
cp public/chef-jarvis-maskable-512.png public/chef-jarvis-app-icon-v2-maskable-512.png
cp public/apple-touch-icon.png public/chef-jarvis-app-icon-v2-apple-180.png
```

Expected: each source/destination pair has the same SHA-256 digest.

- [ ] **Step 2: Switch HTML and manifest icon references to the new paths**

In `public/index.html`, use:

```html
<link rel="icon" href="/chef-jarvis-app-icon-v2-192.png?v=20260722-named-recipe-3" type="image/png" sizes="192x192" />
<link rel="apple-touch-icon" sizes="180x180" href="/chef-jarvis-app-icon-v2-apple-180.png?v=20260722-named-recipe-3" />
```

In `public/manifest.webmanifest`, preserve the current icon order and replace only each `src` basename:

```json
"/chef-jarvis-app-icon-v2-192.png?v=20260722-named-recipe-3"
"/chef-jarvis-app-icon-v2-1024.png?v=20260722-named-recipe-3"
"/chef-jarvis-app-icon-v2-512.png?v=20260722-named-recipe-3"
"/chef-jarvis-app-icon-v2-maskable-512.png?v=20260722-named-recipe-3"
```

- [ ] **Step 3: Update Service Worker icon references and network-first matching**

Replace the two icon entries in `CORE` with:

```js
"/chef-jarvis-app-icon-v2-192.png?v=20260722-named-recipe-3",
"/chef-jarvis-app-icon-v2-apple-180.png?v=20260722-named-recipe-3",
```

Replace the `isAppIcon` pathname expression with:

```js
/^\/chef-jarvis-app-icon-v2-(?:192|512|1024|maskable-512|apple-180)\.png$/.test(
  url.pathname,
);
```

- [ ] **Step 4: Synchronize the release version**

Run:

```bash
npm run pwa:version -- 20260722-app-icon-1
```

Expected: `index.html`, `manifest.webmanifest`, `sw.js`, and `boot.js` all use `20260722-app-icon-1`; the synchronizer reports 15 synchronized files.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
node --test --test-name-pattern="cache-refreshed app icon family|release asset discovery|PWA install keeps large icons|PWA version sync" tests/ui-contracts.test.mjs tests/deployment-verification.test.mjs
```

Expected: all selected tests PASS. Confirm `CORE` contains the new 192 px and Apple files but not the new 512 px, 1024 px, or maskable files.

- [ ] **Step 6: Commit the implementation**

```bash
git add public tests
git commit -m "fix: refresh app icon cache paths"
```

---

### Task 3: Verify, push, and redeploy

**Files:**
- Verify: all tracked files and production assets

**Interfaces:**
- Consumes: the committed icon assets and references from Task 2.
- Produces: a clean, pushed Git branch and a production Cloudflare Pages deployment whose hashes match the local commit.

- [ ] **Step 1: Run the full pre-release verification**

Run:

```bash
npm test
npm run check
npx -y deno check --node-modules-dir=auto supabase/functions/chef-meal-plan/index.ts supabase/functions/chef-usda-nutrition/index.ts supabase/functions/chef-delete-account/index.ts
npm run test:e2e
git diff --check
```

Expected: 183 or more Node tests pass, syntax/PWA checks pass, all three Edge Functions type-check, public E2E tests pass, authenticated E2E tests may be reported as skipped only when the dedicated credentials are absent, and `git diff --check` prints nothing.

- [ ] **Step 2: Push the branch and update the existing PR**

```bash
git push origin agent/optimize-startup-and-chef-mode
```

Expected: GitHub reports the branch updated and existing PR #14 points to the new HEAD.

- [ ] **Step 3: Deploy the committed public directory**

```bash
npx wrangler pages deploy public --project-name chef-jarvis --branch main --commit-dirty=false
```

Expected: Cloudflare reports `Deployment complete` and returns a deployment URL.

- [ ] **Step 4: Verify production hashes and availability**

Run:

```bash
npm run verify:deployment
for file in \
  chef-jarvis-app-icon-v2-192.png \
  chef-jarvis-app-icon-v2-512.png \
  chef-jarvis-app-icon-v2-1024.png \
  chef-jarvis-app-icon-v2-maskable-512.png \
  chef-jarvis-app-icon-v2-apple-180.png; do
  local_hash=$(shasum -a 256 "public/$file" | awk '{print $1}')
  live_hash=$(curl --fail --silent --show-error "https://chef-jarvis.pages.dev/$file?verify=$(date +%s)" | shasum -a 256 | awk '{print $1}')
  test "$local_hash" = "$live_hash"
  printf '%s %s\n' "$file" "$local_hash"
done
curl --fail --silent --show-error --location --output /dev/null --write-out 'production_status=%{http_code}\n' https://chef-jarvis.pages.dev/
```

Expected: all public asset and Edge version checks pass, every local/live icon hash pair matches, and `production_status=200`.

- [ ] **Step 5: Confirm repository and PR state**

```bash
git fetch origin agent/optimize-startup-and-chef-mode
test "$(git rev-parse HEAD)" = "$(git rev-parse @{upstream})"
git status -sb
gh pr view 14 --json number,state,isDraft,url,headRefOid
```

Expected: local HEAD equals upstream, the worktree is clean, and open draft PR #14 points at the committed HEAD.

---

## Rollback

If the production verification fails, do not delete the new or legacy files. Restore `index.html`, `manifest.webmanifest`, `sw.js`, and `boot.js` to the last verified commit, redeploy `public`, and re-run `npm run verify:deployment`. Because the legacy icon files remain available throughout the change, rollback does not require recovering binary assets.
