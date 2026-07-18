function normalize(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenScore(left, right) {
  const leftTokens = new Set(normalize(left).split(" ").filter(Boolean));
  const rightTokens = new Set(normalize(right).split(" ").filter(Boolean));
  if (!leftTokens.size || !rightTokens.size) return 0;
  const common = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return common / new Set([...leftTokens, ...rightTokens]).size;
}

export function scoreSourceCandidate(title, resolution) {
  const candidate = normalize(title);
  const names = [
    resolution.canonicalName,
    ...(resolution.aliases || []),
  ].map(normalize).filter(Boolean);
  return Math.max(0, ...names.map((name) => {
    if (candidate === name) return 1;
    if (candidate.includes(name) || name.includes(candidate)) return 0.9;
    return tokenScore(candidate, name);
  }));
}

export function selectSourceCandidate(meals, resolution) {
  const ranked = (Array.isArray(meals) ? meals : [])
    .map((meal) => ({
      meal,
      score: scoreSourceCandidate(meal?.strMeal, resolution),
    }))
    .filter(({ score }) => score >= 0.82)
    .sort((left, right) => right.score - left.score);
  return ranked[0]?.meal || null;
}

export function normalizeTheMealDbRecipe(meal, persistencePolicy) {
  const ingredientLines = Array.from({ length: 20 }, (_, index) => {
    const ingredient = String(meal?.[`strIngredient${index + 1}`] || "").trim();
    const measure = String(meal?.[`strMeasure${index + 1}`] || "").trim();
    return [measure, ingredient].filter(Boolean).join(" ");
  }).filter(Boolean);
  const sourceTitle = String(meal?.strMeal || "").trim();
  const instructionsText = String(meal?.strInstructions || "").trim();

  if (!sourceTitle || ingredientLines.length < 2 || !instructionsText) {
    return null;
  }

  return {
    provider_id: String(meal.idMeal),
    source_provider: "themealdb",
    source_title: sourceTitle,
    source_url: String(meal.strSource || ""),
    source_image_url: String(meal.strMealThumb || ""),
    source_persistence: persistencePolicy,
    ingredient_lines: ingredientLines,
    instructions_text: instructionsText,
  };
}
