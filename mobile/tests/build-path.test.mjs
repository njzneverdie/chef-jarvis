import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
const { patchShell } = createRequire(import.meta.url)(
  "../plugins/with-spaces-safe-bundle.cjs",
);
test("Xcode executes a bundle script under a project path containing spaces", async () => {
  const dir = await mkdtemp(join(tmpdir(), "chef path "));
  try {
    const script = join(dir, "react-native-xcode.sh");
    await writeFile(script, "printf bundle-ok");
    const source =
      '`"$NODE_BINARY" --print "process.env.TEST_SCRIPT /* react-native-xcode.sh */"`';
    const patched = patchShell(source);
    assert.equal(patchShell(patched), patched);
    assert.equal(
      execFileSync("/bin/bash", ["-c", patched], {
        env: {
          ...process.env,
          NODE_BINARY: process.execPath,
          TEST_SCRIPT: script,
        },
        encoding: "utf8",
      }),
      "bundle-ok",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
