import assert from "node:assert/strict";
import test from "node:test";
import { parseMealConstraints, mealConstraintRejectionReason } from "../supabase/functions/_shared/meal-planning-constraints.js";
test("selected serving and time limits are validated independently of model output", () => {
  const constraints = parseMealConstraints({ servings: 1, max_minutes: 15 });
  assert.match(mealConstraintRejectionReason({ servings: 2, minutes: 10 }, constraints), /exactly 1/);
  assert.match(mealConstraintRejectionReason({ servings: 1, minutes: 45 }, constraints), /at most 15/);
  assert.equal(mealConstraintRejectionReason({ servings: 1, minutes: 15 }, constraints), "");
  assert.equal(mealConstraintRejectionReason({ servings: 4, minutes: 90 }, parseMealConstraints({ servings: 4, max_minutes: null })), "");
  assert.equal(parseMealConstraints(undefined), null);
  for (const value of [{ servings: 0, max_minutes: 15 }, { servings: "1", max_minutes: 15 }, { servings: 1, max_minutes: "15" }, { servings: 1 }, []]) assert.throws(() => parseMealConstraints(value), /Invalid/);
});

test("serving/time mismatches are repairable without weakening their validation", async () => {
  const { recipeValidationDisposition } = await import("../supabase/functions/_shared/named-recipe-integrity.js");
  const constraints = { servings: 1, max_minutes: 15 };
  for (const plan of [{ servings: 2, minutes: 10 }, { servings: 1, minutes: 45 }]) {
    assert.equal(recipeValidationDisposition(new Error(mealConstraintRejectionReason(plan, constraints))), "repairable");
  }
});

test("selection fallback meets every offered serving/time combination without inventing cook times", async () => {
  const { selectionFallbackPlan } = await import("../supabase/functions/_shared/selection-fallback.js");
  for (const language of ["en", "zh-TW"]) for (const servings of [1, 2, 3, 4, 6]) for (const max_minutes of [15, 30, 45, null]) {
    const constraints = { servings, max_minutes };
    const plan = selectionFallbackPlan(constraints, { allergies: ["fish"], dietary_preferences: ["Vegan", "Gluten-free"] }, language);
    assert.ok(plan);
    assert.equal(mealConstraintRejectionReason(plan, constraints), "");
    assert.equal(plan.ingredients[0].quantity, 150 * servings);
    assert.equal(plan.fallback, true);
    assert.ok(plan.steps.every(step => step.timers.length === 0));
  }
});
test("selection fallback still fails closed for incompatible allergies/dislikes", async () => {
  const { selectionFallbackPlan } = await import("../supabase/functions/_shared/selection-fallback.js");
  const constraints = { servings: 1, max_minutes: 15 };
  assert.equal(selectionFallbackPlan(constraints, { allergies: ["tomato"] }), null);
  assert.equal(selectionFallbackPlan(constraints, { dislikes: ["cucumber"] }), null);
  const plan = selectionFallbackPlan(constraints, { allergies: ["chickpea", "white beans"] });
  assert.ok(plan?.ingredients[0].name.includes("tuna"));
});

test("every fixed fallback ingredient is screened across interface languages", async () => {
  const { selectionFallbackPlan } = await import("../supabase/functions/_shared/selection-fallback.js");
  const constraints = { servings: 1, max_minutes: 15 };
  for (const language of ["en", "zh-TW"]) for (const field of ["allergies", "dislikes"]) {
    for (const term of ["番茄", "西红柿", "tomato", "小黃瓜", "黄瓜", "cucumber", "橄欖油", "olive oil", "檸檬", "柠檬汁", "lemon juice", "食鹽", "salt"]) {
      assert.equal(selectionFallbackPlan(constraints, { [field]: [term] }, language), null, `${language}/${field}/${term}`);
    }
    for (const term of ["鷹嘴豆", "鹰嘴豆", "chickpea"]) {
      const plan = selectionFallbackPlan(constraints, { [field]: [term] }, language);
      assert.ok(plan);
      assert.ok(!plan.ingredients[0].usda_query.includes("chickpea"));
    }
    const plan = selectionFallbackPlan(constraints, { [field]: ["豆類", "鮪魚"] }, language);
    assert.equal(plan, null);
  }
});

test("Try another titles are bounded data that join the variety history first", async () => {
  const { parseAvoidTitles, withAvoidedTitles } = await import("../supabase/functions/_shared/meal-planning-constraints.js");
  const { recipeVarietyRejectionReason } = await import("../supabase/functions/_shared/recipe-variety.js");
  assert.deepEqual(parseAvoidTitles(undefined), []);
  assert.deepEqual(parseAvoidTitles(["  薑絲牛肉拌飯 ", "薑絲牛肉拌飯", "", "A\nB"]), ["薑絲牛肉拌飯", "A B"]);
  assert.equal(parseAvoidTitles(Array.from({ length: 9 }, (_, i) => `Dish ${i}`)).length, 5);
  assert.equal(parseAvoidTitles(["x".repeat(400)])[0].length, 160);
  for (const value of ["Dish", [1], {}]) assert.throws(() => parseAvoidTitles(value), /Invalid/);
  const recent = withAvoidedTitles([{ title: "Old", primary_protein: "", cooking_style: "", user_request: "", fallback: false }], ["薑絲牛肉拌飯"]);
  assert.equal(recent[0].title, "薑絲牛肉拌飯");
  assert.equal(recent.length, 2);
  assert.match(recipeVarietyRejectionReason({ title: "薑絲牛肉拌飯" }, recent, "請推薦一道適合我的晚餐"), /too similar/);
  assert.equal(recipeVarietyRejectionReason({ title: "番茄炒蛋" }, recent, "請推薦一道適合我的晚餐"), "");
});
