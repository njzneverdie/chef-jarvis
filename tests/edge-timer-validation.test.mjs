import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  instructionHasAmbiguousDuration,
  instructionIncludesDuration,
  instructionRequiresTimer,
  recipeStepTimerIssues,
  recipeTimersFromInstruction,
  recipeTimerRejectionReason,
} from "../supabase/functions/_shared/recipe-timer.js";

test("timer preflight reports every invalid cooking step at once", () => {
  assert.deepEqual(
    recipeStepTimerIssues([
      { instruction: "以中火炒香蒜末。" },
      { instruction: "轉小火燉煮 20–30 分鐘。" },
      { instruction: "將煮好的白飯盛入碗中。" },
      { instruction: "小火燉煮 20 分鐘。" },
    ]),
    [
      "steps[0].instruction must state an exact duration for its cooking action",
      "steps[1].instruction must use one exact duration, not a range",
    ],
  );
});

test("recipe timer accepts matching English and Chinese durations", () => {
  assert.equal(instructionIncludesDuration("Bake for 18 minutes.", 1080), true);
  assert.equal(instructionIncludesDuration("以中火煮 2 分鐘。", 120), true);
  assert.equal(instructionIncludesDuration("煎 20 秒後翻面。", 20), true);
});

test("Chinese aromatic frying steps create actionable timers", () => {
  const instruction = "放入紅蔥頭末爆香至金黃，耗時 3 分鐘。";
  assert.equal(instructionRequiresTimer(instruction), true);
  assert.deepEqual(
    recipeTimersFromInstruction(instruction).map(({ kind, duration_seconds }) => ({
      kind,
      duration_seconds,
    })),
    [{ kind: "cook", duration_seconds: 180 }],
  );
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
      instruction: "Take 5 minutes to read the recipe before cooking.",
      label: "5-minute overview",
      durationSeconds: 300,
    }),
    "timer is not a cooking timer",
  );
  assert.equal(
    recipeTimerRejectionReason({
      instruction: "給你 5 分鐘閱讀 Recipe，再開始下廚。",
      label: "閱讀準備",
      durationSeconds: 300,
    }),
    "timer is not a cooking timer",
  );
});

test("material salmon searing steps require exact recipe timers", () => {
  assert.equal(
    instructionRequiresTimer(
      "熱鍋倒入橄欖油，放入鮭魚菲力，以中火煎至兩面金黃熟透。",
    ),
    true,
  );
  assert.equal(
    instructionHasAmbiguousDuration("鮭魚皮面朝下煎 3–4 分鐘。"),
    true,
  );
  assert.deepEqual(
    recipeTimersFromInstruction(
      "鮭魚皮面朝下煎 4 分鐘，翻面後再煎 3 分鐘。",
    ).map(({ kind, duration_seconds }) => ({ kind, duration_seconds })),
    [
      { kind: "cook", duration_seconds: 240 },
      { kind: "cook", duration_seconds: 180 },
    ],
  );
});

test("completed Chinese cooking adjectives do not create fake timer requirements", () => {
  assert.equal(
    instructionRequiresTimer("將煮好的白飯盛入碗中，淋上肉燥後上桌。"),
    false,
  );
  assert.equal(
    instructionRequiresTimer("把已煮熟的雞蛋切半後擺盤。"),
    false,
  );
  assert.equal(
    instructionRequiresTimer("以小火煮至醬汁濃稠。"),
    true,
  );
});

test("the Edge validator drops one invalid timer instead of rejecting a plan", async () => {
  const source = await readFile(
    new URL("../supabase/functions/chef-meal-plan/index.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /Dropping invalid recipe timer/);
  assert.match(source, /each timer needs its own explicit duration occurrence/);
  assert.match(
    source,
    /instruction must state an exact duration for its cooking action/,
  );
  assert.match(source, /recipeTimersFromInstruction\(instruction\)/);
  assert.match(source, /recipeStepTimerIssues\(plan\.steps\)/);
  assert.match(source, /return \{ instruction, timers \};/);
});
