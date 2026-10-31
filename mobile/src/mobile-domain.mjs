import "./shared-domain.js";
export function remainingSeconds(timer, now = Date.now()) {
  if (timer.mode === "stopwatch")
    return timer.deadline == null
      ? timer.remaining
      : Math.max(
          0,
          timer.remaining + Math.floor((now - timer.deadline) / 1000),
        );
  return timer.deadline == null
    ? Math.max(0, timer.remaining)
    : Math.max(0, Math.ceil((timer.deadline - now) / 1000));
}
export function toggleDeadline(timer, now = Date.now()) {
  if (timer.mode === "stopwatch")
    return timer.deadline == null
      ? { ...timer, deadline: now }
      : { ...timer, remaining: remainingSeconds(timer, now), deadline: null };
  return timer.deadline == null
    ? { ...timer, deadline: now + Math.max(0, timer.remaining) * 1000 }
    : { ...timer, remaining: remainingSeconds(timer, now), deadline: null };
}
export function persistableCooking(state) {
  return !state || state.recipe?.source_persistence === "session_only"
    ? null
    : state;
}
export function validateMeasuredRecipe(recipe) {
  if (!globalThis.ChefDomain.recipeIntegrityReport(recipe).safe) return false;
  return (
    Array.isArray(recipe?.ingredients) &&
    recipe.ingredients.length > 0 &&
    recipe.ingredients.every(
      (i) =>
        i &&
        typeof i === "object" &&
        String(i.name || "").trim() &&
        Number.isFinite(i.quantity) &&
        i.quantity > 0 &&
        String(i.unit || "").trim(),
    ) &&
    Array.isArray(recipe.steps) &&
    recipe.steps.length > 0 &&
    recipe.steps.every(
      (s) => typeof s.instruction === "string" && s.instruction.trim(),
    )
  );
}
export function applyRecipeSwap(
  recipe,
  sub,
  apply = (item, s) => ({
    ...item,
    name: s.to,
    quantity: s.quantity,
    unit: s.unit,
  }),
) {
  return {
    ...recipe,
    nutrition_stale: true,
    saved_recipe_id: undefined,
    usda_nutrition: undefined,
    ingredients: recipe.ingredients.map((i) =>
      i.name === sub.from ? apply(i, sub) : i,
    ),
    steps: recipe.steps.map((step, index) => {
      const update = (sub.step_updates || []).find(
        (u) => u.step_index === index,
      );
      return update
        ? { instruction: update.instruction, timers: update.timers || [] }
        : step;
    }),
    substitutions: [],
  };
}
export function recipeNutrition(recipe) {
  if (globalThis.ChefDomain.hasCompleteUsdaNutrition(recipe.usda_nutrition))
    return recipe.usda_nutrition;
  return recipe.nutrition_stale ? null : recipe;
}
export async function scheduleMeal(
  { plan, createPlan, saveSlot, loadSlots },
  slot,
) {
  const target = plan || (await createPlan());
  await saveSlot({ ...slot, meal_plan_id: target.id });
  return await loadSlots(target.id);
}

export function resetKitchenTimer(timer) {
  if (
    timer.mode !== "stopwatch" &&
    !(Number.isFinite(timer.duration) && timer.duration > 0)
  )
    throw new Error(
      "Original timer duration is unavailable; recreate this older timer.",
    );
  return {
    ...timer,
    remaining: timer.mode === "stopwatch" ? 0 : timer.duration,
    deadline: null,
  };
}
export function validateMealCompletion(servings, rating) {
  const amount = Number(servings);
  if (!Number.isFinite(amount) || amount < 0.25 || amount > 12)
    throw new Error("Choose between 0.25 and 12 servings.");
  if (
    rating !== "" &&
    (!Number.isInteger(Number(rating)) ||
      Number(rating) < 1 ||
      Number(rating) > 5)
  )
    throw new Error("Choose a rating from 1 to 5, or skip it.");
  return { amount, rating: rating === "" ? null : Number(rating) };
}
