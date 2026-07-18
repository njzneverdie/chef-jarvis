import assert from "node:assert/strict";
import test from "node:test";
import {
  baselineDishResolution,
  classifyMealRequest,
  dishSearchTerms,
  normalizeDishResolution,
} from "../supabase/functions/_shared/dish-resolver.js";

test("classifies recognizable dish names separately from broad requests", () => {
  assert.equal(classifyMealRequest("肉燥飯"), "named_dish");
  assert.equal(classifyMealRequest("Beef Bourguignon"), "named_dish");
  assert.equal(classifyMealRequest("推薦一份高蛋白晚餐"), "broad_request");
});

test("normalizes approved aliases while preserving the original request", () => {
  const resolution = baselineDishResolution("魯肉飯");
  assert.equal(resolution.originalRequest, "魯肉飯");
  assert.equal(resolution.displayName, "魯肉飯");
  assert.equal(resolution.canonicalName, "肉燥飯");
  assert.ok(resolution.aliases.includes("lu rou fan"));
  assert.ok(resolution.aliases.includes("minced pork rice"));
});

test("accepts a high-confidence typo resolution from the model", () => {
  const resolution = normalizeDishResolution("肉躁飯", {
    canonical_name: "肉燥飯",
    aliases: ["lu rou fan", "minced pork rice"],
    confidence: 0.98,
    candidates: [],
  });
  assert.equal(resolution.needsClarification, false);
  assert.equal(resolution.displayName, "肉躁飯");
  assert.equal(resolution.canonicalName, "肉燥飯");
});

test("requires clarification for a low-confidence dish resolution", () => {
  const resolution = normalizeDishResolution("紅燒飯", {
    canonical_name: "",
    aliases: [],
    confidence: 0.55,
    candidates: ["紅燒肉飯", "紅燒牛肉飯"],
  });
  assert.equal(resolution.needsClarification, true);
  assert.deepEqual(resolution.clarificationCandidates, [
    "紅燒肉飯",
    "紅燒牛肉飯",
  ]);
});

test("requires a description for an unrecognized custom dish name", () => {
  const resolution = normalizeDishResolution("Daniel 特製宇宙飯", {
    canonical_name: "",
    aliases: [],
    confidence: 0.2,
    candidates: [],
  });
  assert.equal(resolution.needsClarification, true);
  assert.equal(resolution.needsDescription, true);
  assert.deepEqual(resolution.clarificationCandidates, []);
});
