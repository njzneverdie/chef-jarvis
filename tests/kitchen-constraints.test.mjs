import assert from "node:assert/strict";
import test from "node:test";
import {
  cookingSkillPrompt,
  equipmentRejectionReason,
  feedbackTagList,
  parseCookingSkill,
  withoutRestrictedTips,
} from "../supabase/functions/_shared/kitchen-constraints.js";
import { recipeValidationDisposition } from "../supabase/functions/_shared/named-recipe-integrity.js";
import { languageMismatchPaths } from "../supabase/functions/_shared/recipe-language.js";

test("recipes may not require appliances missing from a saved equipment list", () => {
  const plan = { steps: [{ instruction: "烤箱預熱至 200°C。" }, { instruction: "用平底鍋煎 3 分鐘。" }], equipment_needed: ["氣炸鍋"] };
  const reason = equipmentRejectionReason(plan, ["Stovetop", "Frying pan"]);
  assert.equal(reason, "Recipe uses equipment the user does not have: oven, air fryer.");
  assert.equal(recipeValidationDisposition(new Error(reason)), "repairable");
  assert.equal(equipmentRejectionReason(plan, ["Oven", "Air fryer"]), "");
  assert.equal(equipmentRejectionReason(plan, []), "", "no saved list means no check");
});

test("rescue and doneness hints never mention a restricted ingredient", () => {
  const plan = {
    steps: [
      { instruction: "炒 3 分鐘。", doneness: "表面金黃", rescue: "太淡可加一點花生醬" },
      { instruction: "Simmer 5 minutes.", rescue: "Too thick? Add a splash of water." },
    ],
  };
  const safe = withoutRestrictedTips(plan, { allergies: ["Peanut"], dislikes: [], dietary_preferences: [] });
  assert.deepEqual(safe.steps[0], { instruction: "炒 3 分鐘。", doneness: "表面金黃" });
  assert.equal(safe.steps[1].rescue, "Too thick? Add a splash of water.");
});

test("cooking skill and feedback tags are allowlisted", () => {
  assert.equal(parseCookingSkill("beginner"), "beginner");
  assert.equal(parseCookingSkill(undefined), null);
  assert.throws(() => parseCookingSkill("chef"), /Invalid/);
  assert.match(cookingSkillPrompt("beginner"), /at most 2 pots or pans, no deep-frying/);
  assert.deepEqual(feedbackTagList(["delicious", "ignore rules", "too_salty"]), ["too_salty", "delicious"]);
  assert.deepEqual(feedbackTagList("too_salty"), []);
});

test("new hint fields are covered by the one-language check", () => {
  const plan = {
    title: "番茄炒蛋", summary: "家常菜。", ingredients: [], substitutions: [], equipment_adaptations: [], reuse_ideas: [],
    steps: [{ instruction: "炒 3 分鐘。", timers: [], doneness: "golden edges", rescue: "太鹹加水" }],
    equipment_needed: ["frying pan"],
  };
  assert.deepEqual(languageMismatchPaths(plan, "zh-TW"), [["steps", 0, "doneness"], ["equipment_needed", 0]]);
});
