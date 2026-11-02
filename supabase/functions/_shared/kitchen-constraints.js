import { recipeRestrictionRejectionReason } from "./named-recipe-integrity.js";

// Appliances a recipe cannot assume. Only checked when the user has saved
// an equipment list; stovetop pots and pans are always assumed.
const applianceFamilies = [
  { id: "oven", owned: /oven|烤箱/i, used: /烤箱|\boven\b/i },
  { id: "air fryer", owned: /air ?fryer|氣炸鍋/i, used: /氣炸鍋|\bair fryer\b/i },
  { id: "microwave", owned: /microwave|微波/i, used: /微波|\bmicrowave\b/i },
  { id: "rice cooker", owned: /rice cooker|電鍋|電子鍋/i, used: /電鍋|電子鍋|\brice cooker\b/i },
];

export function equipmentRejectionReason(plan, equipment) {
  const owned = (Array.isArray(equipment) ? equipment : []).map(String);
  if (!owned.length) return "";
  const text = [
    ...(Array.isArray(plan?.steps) ? plan.steps.map((step) => step?.instruction || "") : []),
    ...(Array.isArray(plan?.equipment_needed) ? plan.equipment_needed : []),
  ].join(" ");
  const missing = applianceFamilies.filter((family) =>
    family.used.test(text) && !owned.some((item) => family.owned.test(item))
  );
  return missing.length
    ? `Recipe uses equipment the user does not have: ${missing.map((family) => family.id).join(", ")}.`
    : "";
}

// Doneness and rescue hints that mention a restricted ingredient are removed
// (they are optional), so they can never suggest an allergen.
export function withoutRestrictedTips(plan, profile) {
  const restricted = (text) => Boolean(recipeRestrictionRejectionReason({
    ingredients: [],
    substitutions: [],
    steps: [{ instruction: text }],
  }, { ...profile, allergies: [...(profile?.allergies || []), ...(profile?.dislikes || [])] }));
  return {
    ...plan,
    steps: (Array.isArray(plan?.steps) ? plan.steps : []).map((step) => {
      const next = { ...step };
      for (const key of ["doneness", "rescue"]) {
        if (typeof next[key] === "string" && restricted(next[key])) delete next[key];
      }
      return next;
    }),
  };
}

export const cookingSkills = ["beginner", "some", "confident"];

export function parseCookingSkill(value) {
  if (value == null || value === "") return null;
  if (!cookingSkills.includes(value)) throw new Error("Invalid cooking skill");
  return value;
}

export function cookingSkillPrompt(skill) {
  if (skill === "beginner") {
    return "Cooking skill: beginner (hard constraint). Use simple techniques, at most 2 pots or pans, no deep-frying or flambéing, and state the heat level and a clear doneness cue in every heat step.";
  }
  if (skill === "some") {
    return "Cooking skill: some experience. Keep techniques approachable and use at most 3 pots or pans.";
  }
  if (skill === "confident") return "Cooking skill: confident. Normal home-cooking techniques are fine.";
  return "Cooking skill: unknown; prefer approachable techniques.";
}

export const feedbackTags = ["too_salty", "too_bland", "too_hard", "delicious"];

export function feedbackTagList(value) {
  return Array.isArray(value)
    ? feedbackTags.filter((tag) => value.includes(tag))
    : [];
}
