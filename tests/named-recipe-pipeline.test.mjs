import assert from "node:assert/strict";
import test from "node:test";
import { baselineDishResolution } from "../supabase/functions/_shared/dish-resolver.js";
import {
  buildRecipeRepairPrompt,
  namedDishRejectionReason,
  recipeValidationDisposition,
  remainingTimeout,
} from "../supabase/functions/_shared/named-recipe-integrity.js";

test("accepts the same named dish with a descriptive title", () => {
  const resolution = baselineDishResolution("肉燥飯");
  assert.equal(
    namedDishRejectionReason({ title: "家常台式肉燥飯" }, resolution),
    "",
  );
});

test("rejects an unrelated fallback title for a named dish", () => {
  const reason = namedDishRejectionReason(
    { title: "精準蔬菜鷹嘴豆飯碗" },
    baselineDishResolution("肉燥飯"),
  );
  assert.match(reason, /does not match/i);
});

test("rejects a one-character generated title that only appears in a fuller dish name", () => {
  const reason = namedDishRejectionReason(
    { title: "飯" },
    baselineDishResolution("肉燥飯"),
  );
  assert.match(reason, /does not match/i);
});

test("uses canonical name only for legacy resolutions without trusted aliases", () => {
  const reason = namedDishRejectionReason(
    { title: "Classic French stew" },
    {
      requestType: "named_dish",
      canonicalName: "肉燥飯",
      aliases: ["French stew", "白飯"],
    },
  );
  assert.match(reason, /does not match/i);
});

test("only structural timer and field failures are repairable", () => {
  assert.equal(
    recipeValidationDisposition(
      new Error(
        "steps[0].instruction must state an exact duration for its cooking action",
      ),
    ),
    "repairable",
  );
  assert.equal(
    recipeValidationDisposition(new Error("named dish does not match request")),
    "fatal",
  );
  assert.equal(
    recipeValidationDisposition(new Error("recipe contains an allergen")), "fatal");
});

test("builds a repair prompt that preserves dish identity", () => {
  const prompt = buildRecipeRepairPrompt({
    canonicalName: "肉燥飯",
    rawText: '{"title":"飯"}',
    validationMessage: "steps[0].instruction must use one exact duration",
    schemaText: "{ title: string }",
  });
  assert.match(prompt, /requested dish is exactly: 肉燥飯/i);
  assert.match(prompt, /Repair only the rejected fields; do not change the dish identity/);
  assert.match(prompt, /Invalid JSON to repair:\n\n\{"title":"飯"\}/);
});

test("all attempts share the remaining deadline", () => {
  assert.equal(remainingTimeout(42_000, 20_000, 10_000), 20_000);
  assert.equal(remainingTimeout(42_000, 20_000, 37_500), 4_500);
  assert.equal(remainingTimeout(42_000, 20_000, 42_000), 0);
});
