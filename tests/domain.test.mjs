import assert from "node:assert/strict";
import test from "node:test";

await import("../public/domain.js");

const {
  calculateTarget,
  tickTimers,
  normalizeRecipeSteps,
  buildRecipeTimers,
  normalizeIngredient,
  normalizeGroceryItem,
  applyIngredientSubstitution,
  ingredientPreparation,
  ingredientDetails,
  convertQuantity,
  mergeGroceryItems,
  groceryDisplayMeasurement,
  ingredientWeightInGrams,
  calculateUsdaMealNutrition,
  localDateKey,
  safeExternalUrl,
} = globalThis.ChefDomain;

test("custom nutrition targets reject missing and non-finite values", () => {
  assert.throws(
    () =>
      calculateTarget({
        mode: "custom",
        kcal: "",
        protein: "",
        carbs: "",
        fat: "",
      }),
    /valid kcal/,
  );
  assert.throws(
    () =>
      calculateTarget({
        mode: "custom",
        kcal: "NaN",
        protein: 100,
        carbs: 100,
        fat: 50,
      }),
    /valid kcal/,
  );
});

test("calculated nutrition targets never produce negative carbs", () => {
  const target = calculateTarget({
    mode: "calculated",
    weight: 30,
    height: 100,
    age: 100,
    sex: "female",
    activity: "low",
    goal: "fat_loss",
  });
  assert.equal(target.kcal, 1200);
  assert.ok(Number.isFinite(target.carbs));
  assert.ok(target.carbs >= 0);
});

test("one tick updates countdowns and stopwatches by mode", () => {
  const countdown = {
    mode: "countdown",
    sec: 1,
    running: true,
    completed: false,
  };
  const stopwatch = {
    mode: "stopwatch",
    sec: 0,
    running: true,
    completed: false,
  };
  const result = tickTimers([countdown, stopwatch], 1);
  assert.equal(countdown.sec, 0);
  assert.equal(countdown.running, false);
  assert.equal(countdown.completed, true);
  assert.equal(stopwatch.sec, 1);
  assert.equal(stopwatch.running, true);
  assert.deepEqual(result.completed, [countdown]);
});

test("recipe timers keep their own step and duration", () => {
  const timers = buildRecipeTimers([
    {
      instruction: "Preheat the oven for 2 minutes.",
      timer: {
        label: "Preheat oven",
        kind: "preheat",
        duration_seconds: 120,
      },
    },
    { instruction: "Season the chicken.", timer: null },
    {
      instruction: "Bake until cooked through, about 18 minutes.",
      timer: { label: "Bake chicken", kind: "bake", duration_seconds: 1080 },
    },
  ]);

  assert.deepEqual(
    timers.map(({ name, duration, stepNumber }) => ({
      name,
      duration,
      stepNumber,
    })),
    [
      { name: "Preheat oven", duration: 120, stepNumber: 1 },
      { name: "Bake chicken", duration: 1080, stepNumber: 3 },
    ],
  );
});

test("recipe steps never create timers for reading menus or untimed prep", () => {
  const steps = normalizeRecipeSteps([
    {
      instruction: "Read the recipe before cooking.",
      timer: {
        label: "Read recipe",
        kind: "cook",
        duration_seconds: 300,
      },
    },
    { instruction: "Dice the onion.", timer: null },
    {
      instruction: "Bake until browned for 12 minutes.",
      timer: {
        label: "Bake casserole",
        kind: "bake",
        duration_seconds: 300,
      },
    },
    {
      instruction: "Simmer the sauce for 8 minutes.",
      timer: {
        label: "Simmer sauce",
        kind: "simmer",
        duration_seconds: 480,
      },
    },
  ]);

  assert.equal(steps[0].timer, null);
  assert.equal(steps[1].timer, null);
  assert.equal(steps[2].timer, null);
  assert.equal(buildRecipeTimers(steps).length, 1);
  assert.equal(buildRecipeTimers(steps)[0].name, "Simmer sauce");
});

test("recipe steps are not truncated to an arbitrary fixed count", () => {
  const steps = normalizeRecipeSteps(
    Array.from({ length: 14 }, (_, index) => ({
      instruction: `Cook the requested component in step ${index + 1}.`,
      timer: null,
    })),
  );

  assert.equal(steps.length, 14);
  assert.equal(
    steps.at(-1).instruction,
    "Cook the requested component in step 14.",
  );
});

test("structured ingredients retain an exact quantity, unit, and preparation", () => {
  const ingredient = normalizeIngredient({
    name: "Boneless skinless chicken breast",
    usda_query: "boneless skinless chicken breast",
    quantity: 400,
    unit: "g",
    preparation: "cut into 2 cm cubes",
    category: "protein",
  });
  assert.equal(ingredient.amount, "400 g");
  assert.equal(ingredientDetails(ingredient), "400 g · cut into 2 cm cubes");
  assert.equal(ingredient.quantity, 400);
  assert.equal(ingredient.category, "protein");
  assert.equal(ingredient.usda_query, "boneless skinless chicken breast");
});

test("legacy saved ingredients remain readable", () => {
  const ingredient = normalizeIngredient({
    name: "Rice vinegar",
    amount: "1 tbsp",
  });
  assert.equal(ingredient.amount, "1 tbsp");
  assert.equal(ingredient.quantity, null);
  assert.equal(ingredientDetails(ingredient), "1 tbsp");
});

test("grocery items recover legacy quantities and always include a unit", () => {
  const counted = normalizeGroceryItem({ name: "Eggs", amount: "3" });
  assert.equal(counted.name, "Eggs");
  assert.equal(counted.quantity, 3);
  assert.equal(counted.unit, "piece");
  assert.equal(counted.amount, "3 pieces");

  const embedded = normalizeGroceryItem({
    name: "500g Chicken breast, diced",
  });
  assert.equal(embedded.name, "Chicken breast, diced");
  assert.equal(embedded.quantity, 500);
  assert.equal(embedded.unit, "g");
});

test("ingredient substitutions update the final grocery quantity and unit", () => {
  const replacement = applyIngredientSubstitution(
    { name: "Large eggs", quantity: 3, unit: "piece", category: "protein" },
    {
      to: "Extra-firm tofu",
      usda_query: "extra firm tofu",
      quantity: 200,
      unit: "g",
      preparation: "pressed and crumbled",
      category: "protein",
    },
  );
  assert.equal(replacement.name, "Extra-firm tofu");
  assert.equal(replacement.quantity, 200);
  assert.equal(replacement.unit, "g");
  assert.equal(replacement.amount, "200 g");
  assert.equal(replacement.preparation, "pressed and crumbled");
  assert.equal(replacement.usda_query, "extra firm tofu");
});

test("Chinese ingredients use readable units and hide no-op preparation text", () => {
  const ingredient = normalizeIngredient({
    name: "低鈉醬油",
    quantity: 2,
    unit: "tbsp",
    preparation: "無需處理",
    category: "seasoning",
  });
  assert.equal(ingredient.amount, "2 湯匙");
  assert.equal(ingredientPreparation(ingredient), "");
  assert.equal(ingredientDetails(ingredient), "2 湯匙");
});

test("recipe image URLs only allow HTTPS on approved hosts", () => {
  assert.equal(
    safeExternalUrl("https://upload.wikimedia.org/wikipedia/commons/dish.jpg", [
      "wikimedia.org",
    ]),
    "https://upload.wikimedia.org/wikipedia/commons/dish.jpg",
  );
  assert.equal(
    safeExternalUrl("https://wikimedia.org.evil.example/dish.jpg", [
      "wikimedia.org",
    ]),
    "",
  );
  assert.equal(safeExternalUrl("javascript:alert(1)", ["wikimedia.org"]), "");
});

test("compatible grocery units merge into stable base units", () => {
  const merged = mergeGroceryItems([
    { name: "Chicken breast", quantity: 1, unit: "kg" },
    { name: "chicken breast", quantity: 250, unit: "g" },
    { name: "Soy sauce", quantity: 1, unit: "tbsp" },
    { name: "soy sauce", quantity: 5, unit: "ml" },
  ]);
  assert.equal(merged.length, 2);
  assert.equal(merged.find((item) => item.unit === "g").quantity, 1250);
  assert.equal(merged.find((item) => item.unit === "ml").quantity, 20);
  assert.equal(convertQuantity(1, "kg", "g"), 1000);
  assert.equal(convertQuantity(2, "tbsp", "ml"), 30);
  assert.equal(convertQuantity(1, "piece", "g"), null);
});

test("small merged liquid quantities display as store-friendly spoons", () => {
  assert.deepEqual(
    groceryDisplayMeasurement({
      name: "Soy sauce",
      quantity: 22.5,
      unit: "ml",
    }),
    { quantity: 1.5, unit: "tbsp" },
  );
  assert.deepEqual(
    groceryDisplayMeasurement({ name: "Vinegar", quantity: 10, unit: "ml" }),
    { quantity: 2, unit: "tsp" },
  );
  assert.deepEqual(
    groceryDisplayMeasurement({ name: "Stock", quantity: 250, unit: "ml" }),
    { quantity: 250, unit: "ml" },
  );
});

test("nutrition log dates use the user's local calendar day", () => {
  const localHalfPastMidnight = new Date(2026, 6, 16, 0, 30, 0);
  assert.equal(localDateKey(localHalfPastMidnight), "2026-07-16");
});

test("USDA meal totals use quantities and disclose match coverage", () => {
  const ingredients = [
    { name: "Chicken breast", quantity: 200, unit: "g" },
    { name: "Olive oil", quantity: 1, unit: "tbsp", category: "oil" },
    { name: "Mystery package", quantity: 1, unit: "pack" },
  ];
  const foods = [
    {
      ingredient: "Chicken breast",
      found: true,
      per100g: { kcal: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6 },
    },
    {
      ingredient: "Olive oil",
      found: true,
      per100g: { kcal: 884, protein_g: 0, carbs_g: 0, fat_g: 100 },
    },
  ];
  const totals = calculateUsdaMealNutrition(ingredients, foods);
  assert.equal(totals.coverage_percent, 67);
  assert.equal(totals.matched_ingredients, 2);
  assert.equal(totals.estimated_conversions, 1);
  assert.equal(totals.protein_g, 62);
  assert.ok(totals.kcal > 451 && totals.kcal < 453);
  assert.deepEqual(ingredientWeightInGrams(ingredients[0]), {
    grams: 200,
    estimated: false,
  });
});
