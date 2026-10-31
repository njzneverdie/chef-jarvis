export function parseMealConstraints(value) {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid meal constraints");
  if (![1, 2, 3, 4, 6].includes(value.servings)) throw new Error("Invalid meal servings");
  if (value.max_minutes !== null && ![15, 30, 45].includes(value.max_minutes)) throw new Error("Invalid meal time limit");
  return { servings: value.servings, max_minutes: value.max_minutes };
}
export function mealConstraintRejectionReason(plan, constraints) {
  if (!constraints) return "";
  if (plan?.servings !== constraints.servings) return `Recipe must make exactly ${constraints.servings} servings.`;
  if (constraints.max_minutes !== null && (!Number.isFinite(plan?.minutes) || plan.minutes > constraints.max_minutes)) return `Recipe total preparation and cooking time must be at most ${constraints.max_minutes} minutes.`;
  return "";
}

// Titles the user just skipped with "Try another". Data only: they extend the
// server-side recent-meal history used for variety checks, never the prompt rules.
export function parseAvoidTitles(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error("Invalid avoided titles");
  const titles = [];
  for (const item of value) {
    if (typeof item !== "string") throw new Error("Invalid avoided titles");
    const title = item.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
    if (title && !titles.includes(title)) titles.push(title);
  }
  return titles.slice(0, 5);
}
export function withAvoidedTitles(recentMeals, avoidTitles) {
  const recent = Array.isArray(recentMeals) ? recentMeals : [];
  const skipped = (avoidTitles || []).map((title) => ({
    title,
    primary_protein: "",
    cooking_style: "",
    user_request: "",
    fallback: false,
  }));
  return [...skipped, ...recent];
}
