import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  instructionIncludesDuration,
  recipeTimerRejectionReason,
} from "../supabase/functions/_shared/recipe-timer.js";

test("recipe timer accepts matching English and Chinese durations", () => {
  assert.equal(instructionIncludesDuration("Bake for 18 minutes.", 1080), true);
  assert.equal(instructionIncludesDuration("以中火煮 2 分鐘。", 120), true);
});

test("recipe timer rejects mismatched and non-cooking timers", () => {
  assert.equal(
    recipeTimerRejectionReason({
      instruction: "Bake for 18 minutes.",
      label: "Bake chicken",
      durationSeconds: 1200,
    }),
    "timer must match its instruction",
  );
  assert.equal(
    recipeTimerRejectionReason({
      instruction: "Read the recipe.",
      label: "Read recipe",
      durationSeconds: 300,
    }),
    "timer is not a cooking timer",
  );
});

test("the Edge validator drops one invalid timer instead of rejecting a plan", async () => {
  const source = await readFile(
    new URL("../supabase/functions/chef-meal-plan/index.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /Dropping invalid recipe timer/);
  assert.match(source, /catch \(error\)[\s\S]*return \{ instruction, timer: null \};/);
});
