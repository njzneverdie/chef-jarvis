# Chef Jarvis App Icon Cache Refresh Design

Date: 2026-07-22
Status: Approved approach; awaiting written-spec review

## Problem

The desired muscular-chef artwork is already present locally and on the production server. The live icon response has the same SHA-256 digest as the local file, and Cloudflare returns it with revalidation headers. However, browser tabs and installed PWA surfaces can continue showing the older artwork because the old and new artwork reused the same icon filenames.

## Goal

Make every Chef Jarvis icon entry point reference a new URL so browsers and PWA installers fetch the approved muscular-chef artwork instead of reusing an older cached image.

## Scope

- Keep the existing approved artwork unchanged.
- Add newly named icon assets for 192 px, 512 px, 1024 px, maskable 512 px, and Apple touch 180 px variants.
- Update the HTML favicon and Apple touch icon references.
- Update every icon URL in `manifest.webmanifest`.
- Update the Service Worker icon references and PWA release version.
- Keep the old icon files temporarily so older Service Workers and installations do not receive 404 responses during the transition.
- Update automated contracts and deployment verification so all new icon URLs and contents are checked.
- Commit, push, and redeploy the verified result.

Changing the artwork, branding, application name, manifest identity, or application behavior is outside this change.

## Asset and Reference Design

The approved image remains the single visual source. Its rendered variants will use a new `chef-jarvis-app-icon-v2-*` filename family. Using new pathnames, rather than only changing query parameters, creates a different cache identity at the browser, Service Worker, manifest, and operating-system download boundaries.

`index.html` will use the new 192 px icon as the browser icon and the new 180 px image as the Apple touch icon. `manifest.webmanifest` will reference the new 192 px, 512 px, 1024 px, and maskable 512 px paths. `sw.js` will precache only the small shell icon variants and continue fetching large installation icons on demand, preserving the current startup-performance behavior.

The PWA release version will change to `20260722-app-icon-1` through the existing synchronization script so HTML, manifest, Service Worker, and dynamic asset references remain consistent.

## Compatibility and Failure Handling

The old files remain deployed but are no longer referenced by the current application. This allows clients running an older cached Service Worker to finish updating without broken requests.

Browsers should display the new tab icon after a normal reload because the pathname changes. Chrome and other PWA platforms can refresh the installed icon after processing the new manifest. Existing iOS home-screen installations may still require removal and re-adding because iOS does not reliably replace an already-installed home-screen icon; this platform limitation will be disclosed after deployment.

Deployment must stop if any new icon is missing, has the wrong dimensions, differs from the approved artwork variant, is absent from the manifest or HTML, or is not available from production.

## Test Strategy

Before changing production references, add a contract test that fails while HTML, manifest, or Service Worker still points to the legacy filename family. The test will require:

- the new filename family in HTML and manifest;
- the expected dimensions and PNG type for every manifest icon;
- the new PWA release version across synchronized assets;
- large installation icons to remain outside the Service Worker core cache;
- old icon files to remain present for compatibility.

After implementation, run unit and contract tests, syntax/PWA synchronization checks, and deployment verification. After release, compare local and live icon hashes for every new icon URL and confirm the main site returns HTTP 200.

## Acceptance Criteria

1. The browser icon, Apple touch icon, and all installable PWA icon entries use new pathnames.
2. Every new pathname serves the approved muscular-chef artwork at its declared dimensions.
3. The old filenames remain accessible but are absent from all current HTML, manifest, and Service Worker references.
4. The Service Worker and all public references share PWA version `20260722-app-icon-1`.
5. Automated tests and deployment verification pass.
6. The production site and every new icon URL return HTTP 200, and live icon hashes match local files.
7. No unrelated application behavior or visual design changes.
