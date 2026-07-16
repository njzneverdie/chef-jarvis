import assert from "node:assert/strict";
import test from "node:test";

await import("../public/domain.js");

const {
  calculateTarget,
  tickTimers,
  normalizeRecipeSteps,
  buildRecipeTimers,
  normalizeIngredient,
  ingredientPreparation,
  ingredientDetails,
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

test("structured ingredients retain an exact quantity, unit, and preparation", () => {
  const ingredient = normalizeIngredient({
    name: "Boneless skinless chicken breast",
    quantity: 400,
    unit: "g",
    preparation: "cut into 2 cm cubes",
    category: "protein",
  });
  assert.equal(ingredient.amount, "400 g");
  assert.equal(ingredientDetails(ingredient), "400 g · cut into 2 cm cubes");
  assert.equal(ingredient.quantity, 400);
  assert.equal(ingredient.category, "protein");
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
