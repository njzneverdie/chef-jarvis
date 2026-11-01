export function parseMealConstraints(value) {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid meal constraints");
  if (![1, 2, 3, 4, 6].includes(value.servings)) throw new Error("Invalid meal servings");
  if (value.max_minutes !== null && ![15, 30, 45, 60].includes(value.max_minutes)) throw new Error("Invalid meal time limit");
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

// Allowlist of selection-first picks; must match ChefDomain.mealPlanningGroups.
export const mealPreferenceOptions = Object.freeze({
  meal: { multi: false, values: ["breakfast", "lunch", "dinner", "snack", "late_night"] },
  cuisine: { multi: true, values: ["taiwanese", "chinese_home", "sichuan_hunan", "cantonese", "japanese", "korean", "thai", "vietnamese", "southeast_asian", "indian", "italian", "french", "american", "mexican", "mediterranean", "middle_eastern"] },
  goals: { multi: true, values: ["high_protein", "low_carb", "low_fat", "high_fiber", "low_sodium", "fat_loss", "muscle_gain", "light"] },
  practical: { multi: true, values: ["use_pantry", "expiring_first", "few_dishes", "one_pot", "lunchbox", "freezer", "budget", "beginner"] },
  protein: { multi: true, values: ["chicken", "pork", "beef", "seafood", "fish", "egg", "tofu", "plant"] },
  staple: { multi: false, values: ["any", "rice", "noodles", "no_starch"] },
  method: { multi: true, values: ["stir_fry", "soup", "steam", "oven", "air_fryer", "braise", "cold_dish", "rice_cooker"] },
  spice: { multi: false, values: ["any", "none", "mild", "medium", "hot"] },
  mood: { multi: true, values: ["warming", "refreshing", "rice_friendly", "party"] },
});

// Returns only allowlisted ids (never free text), dropping "no preference".
export function parseMealPreferences(value) {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid meal preferences");
  const parsed = {};
  for (const [key, raw] of Object.entries(value)) {
    const option = mealPreferenceOptions[key];
    if (!option) throw new Error("Invalid meal preferences");
    if (option.multi) {
      if (!Array.isArray(raw) || raw.length > option.values.length || raw.some((item) => !option.values.includes(item)))
        throw new Error("Invalid meal preferences");
      const picks = option.values.filter((item) => raw.includes(item));
      if (picks.length) parsed[key] = picks;
    } else {
      if (!option.values.includes(raw)) throw new Error("Invalid meal preferences");
      if (raw !== "any") parsed[key] = raw;
    }
  }
  return parsed;
}
