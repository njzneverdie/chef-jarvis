import test from "node:test";
import assert from "node:assert/strict";
import {
  remainingSeconds,
  toggleDeadline,
  persistableCooking,
  validateMeasuredRecipe,
} from "../src/mobile-domain.mjs";
test("deadline survives a suspended JS runtime and pause keeps exact remaining time", () => {
  const started = toggleDeadline({ remaining: 120, deadline: null }, 1000);
  assert.equal(remainingSeconds(started, 91000), 30);
  const paused = toggleDeadline(started, 91000);
  assert.equal(remainingSeconds(paused, 999000), 30);
  assert.equal(remainingSeconds(started, 151000), 0);
});
test("session-only content is never serialized, even in nested cooking state", () => {
  assert.equal(
    persistableCooking({
      recipe: { source_persistence: "session_only", title: "restricted" },
      timers: [],
    }),
    null,
  );
  assert.equal(
    persistableCooking({ recipe: { title: "original" }, timers: [] }).recipe
      .title,
    "original",
  );
});
test("legacy recipes cannot cook with missing quantities or steps", () => {
  assert.equal(
    validateMeasuredRecipe({ ingredients: ["chicken"], steps: [] }),
    false,
  );
  assert.equal(
    validateMeasuredRecipe({
      ingredients: [{ name: "chicken breast", quantity: 150, unit: "g" }],
      steps: [{ instruction: "Cook thoroughly.", timers: [] }],
    }),
    true,
  );
  assert.equal(
    validateMeasuredRecipe({
      ingredients: [{ name: "chicken", quantity: NaN, unit: "g" }],
      steps: [{ instruction: "Cook" }],
    }),
    false,
  );
});
import { applyRecipeSwap, recipeNutrition } from "../src/mobile-domain.mjs";
test("swapping ingredients invalidates nutrition and the saved recipe identity", () => {
  const changed = applyRecipeSwap(
    {
      title: "Chicken",
      saved_recipe_id: "old",
      kcal: 600,
      protein_g: 40,
      usda_nutrition: { kcal: 500 },
      ingredients: [{ name: "cream", quantity: 30, unit: "g" }],
      steps: [{ instruction: "Add cream", timers: [] }],
      substitutions: [],
    },
    {
      from: "cream",
      to: "yogurt",
      quantity: 50,
      unit: "g",
      step_updates: [{ step_index: 0, instruction: "Add yogurt", timers: [] }],
    },
  );
  assert.equal(changed.saved_recipe_id, undefined);
  assert.equal(changed.usda_nutrition, undefined);
  assert.equal(recipeNutrition(changed), null);
  assert.equal(changed.steps[0].instruction, "Add yogurt");
});
test("a stopwatch resumes accumulated elapsed time across suspension", () => {
  const running = toggleDeadline(
    { mode: "stopwatch", remaining: 15, deadline: null },
    1000,
  );
  assert.equal(remainingSeconds(running, 11000), 25);
  const paused = toggleDeadline(running, 11000);
  assert.equal(remainingSeconds(paused, 99000), 25);
});
import "../src/shared-domain.js";
test("generic ingredient placeholders cannot start guided cooking", () => {
  assert.equal(
    validateMeasuredRecipe({
      ingredients: [{ name: "ingredients", quantity: 1, unit: "g" }],
      steps: [{ instruction: "Cook", timers: [] }],
    }),
    false,
  );
});
test("weekly grocery quantities scale to planned servings rather than inverse", () => {
  const scaled = globalThis.ChefDomain.scaleIngredientsForServings(
    [{ name: "chicken breast", quantity: 200, unit: "g" }],
    6,
    2,
  );
  assert.equal(scaled[0].quantity, 600);
});
import { scheduleMeal } from "../src/mobile-domain.mjs";
test("first weekly slot reloads the newly created plan, after the slot is saved", async () => {
  const events = [];
  const rows = await scheduleMeal(
    {
      plan: null,
      createPlan: async () => ({ id: "new-plan" }),
      saveSlot: async (payload) => {
        assert.equal(payload.meal_plan_id, "new-plan");
        events.push("saved");
      },
      loadSlots: async (id) => {
        assert.equal(id, "new-plan");
        assert.deepEqual(events, ["saved"]);
        return [{ id: "new-slot" }];
      },
    },
    {
      scheduled_for: "2026-10-30",
      recipe_id: "test-recipe",
      meal_type: "dinner",
      servings: 2,
    },
  );
  assert.deepEqual(rows, [{ id: "new-slot" }]);
});
test('partial USDA reference never replaces the nutrition used to log a whole meal',()=>{
 const recipe={kcal:500,protein_g:35,carbs_g:50,fat_g:10,usda_nutrition:{kcal:0,protein_g:20,carbs_g:0,fat_g:1,complete:false,coverage_percent:50}};
 assert.equal(recipeNutrition(recipe).kcal,500);
 assert.equal(recipeNutrition({...recipe,nutrition_stale:true}),null);
 const total={kcal:450,protein_g:40,carbs_g:40,fat_g:12,complete:true,coverage_percent:100};
 assert.deepEqual(recipeNutrition({...recipe,usda_nutrition:total}),total);
});

import { resetKitchenTimer, validateMealCompletion } from "../src/mobile-domain.mjs";
test("timer reset restores its original duration rather than its paused remainder", () => {
  const timer = { id: "timer", duration: 120, remaining: 20, deadline: 5000 };
  assert.deepEqual(resetKitchenTimer(timer), { ...timer, remaining: 120, deadline: null });
  assert.equal(resetKitchenTimer({ mode: "stopwatch", remaining: 62, deadline: 5000 }).remaining, 0);
  assert.throws(() => resetKitchenTimer({ remaining: 20, deadline: null }), /recreate/);
});
test("a skipped rating still permits valid nutrition logging", () => {
  assert.deepEqual(validateMealCompletion("1", ""), { amount: 1, rating: null });
  assert.deepEqual(validateMealCompletion("0.25", "4"), { amount: 0.25, rating: 4 });
  for (const [servings, rating] of [["0", ""], ["13", "5"], ["NaN", ""], ["1", "6"]]) assert.throws(() => validateMealCompletion(servings, rating));
});
test("errors are shown in the interface language", async () => {
  const { localizeErrorMessage } = await import("../src/mobile-domain.mjs");
  assert.equal(localizeErrorMessage("Invalid login credentials", "zh-TW"), "電子郵件或密碼不正確。");
  assert.equal(localizeErrorMessage("Invalid login credentials", "en"), "Email or password is incorrect.");
  assert.equal(localizeErrorMessage("TypeError: Network request failed", "zh-TW"), "網路連線有問題，請確認連線後再試。");
  assert.equal(localizeErrorMessage("duplicate key value violates unique constraint", "zh-TW"), "發生問題，請再試一次。");
  assert.equal(localizeErrorMessage("請先完成飲食設定。", "zh-TW"), "請先完成飲食設定。");
  assert.equal(localizeErrorMessage("Complete your food profile first.", "en"), "Complete your food profile first.");
});
test("bought items get a sensible storage zone and default expiry", async () => {
  const { pantryDefaultsForCategory, expiryAfterDays } = await import("../src/mobile-domain.mjs");
  const today = new Date(2026, 10, 1, 12);
  assert.deepEqual(pantryDefaultsForCategory("protein", today), { storage_zone: "fridge", expires_on: "2026-11-03" });
  assert.deepEqual(pantryDefaultsForCategory("produce", today), { storage_zone: "fridge", expires_on: "2026-11-06" });
  assert.deepEqual(pantryDefaultsForCategory("grain", today), { storage_zone: "pantry", expires_on: null });
  assert.equal(expiryAfterDays(30, today), "2026-12-01");
});
