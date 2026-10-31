import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
test("generated iOS configuration permits a Personal Team while keeping local notifications", () => {
  const cwd = fileURLToPath(new URL("..", import.meta.url));
  const config = JSON.parse(
    execFileSync(
      process.execPath,
      ["node_modules/expo/bin/cli", "config", "--type", "introspect", "--json"],
      { cwd, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
    ),
  );
  const ios = config._internal.modResults.ios;
  assert.equal(
    ios.entitlements["aps-environment"],
    undefined,
    "local timers must not require APNs provisioning",
  );
  assert.equal(
    ios.infoPlist.NSFaceIDUsageDescription,
    undefined,
    "do not request unused biometric access",
  );
  assert.ok(!ios.infoPlist.UIBackgroundModes?.includes("remote-notification"));
  assert.ok(ios.infoPlist.NSMicrophoneUsageDescription);
  assert.ok(ios.infoPlist.UIApplicationSceneManifest);
  assert.ok(
    config.plugins.some(
      (p) => (Array.isArray(p) ? p[0] : p) === "expo-notifications",
    ),
  );
});
