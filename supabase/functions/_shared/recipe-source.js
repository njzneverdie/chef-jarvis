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

function hasCjkCharacters(value) {
  return /[\u3400-\u9fff]/u.test(value);
}

function isSafeAlias(name) {
  return hasCjkCharacters(name) || name.split(" ").filter(Boolean).length >= 2;
}

function ingredientLinesFor(meal) {
  return Array.from({ length: 20 }, (_, index) => {
    const ingredient = String(meal?.[`strIngredient${index + 1}`] || "").trim();
    const measure = String(meal?.[`strMeasure${index + 1}`] || "").trim();
    return [measure, ingredient].filter(Boolean).join(" ");
  }).filter(Boolean);
}

function hasRequiredSourceCompleteness({
  sourceTitle,
  ingredientLines,
  instructionsText,
}) {
  return Boolean(sourceTitle) && ingredientLines.length >= 2 && Boolean(instructionsText);
}

function sourceCompletenessDescriptor({
  sourceTitle,
  ingredientLines,
  instructionsText,
  sourceUrl,
  sourceImageUrl,
}) {
  const hasInstructions = Boolean(instructionsText);
  return {
    ingredient_count: ingredientLines.length,
    has_instructions: hasInstructions,
    has_image: Boolean(sourceImageUrl),
    has_source_url: Boolean(sourceUrl),
    is_complete: hasRequiredSourceCompleteness({
      sourceTitle,
      ingredientLines,
      instructionsText,
    }),
  };
}

export function scoreSourceCandidate(title, resolution) {
  const candidate = normalize(title);
  const canonicalName = normalize(resolution.canonicalName);
  const names = [canonicalName, ...(resolution.aliases || [])
    .map(normalize)
    .filter((name) => name && isSafeAlias(name))];
  return Math.max(0, ...names.map((name) => {
    if (candidate === name) return 1;
    if (candidate.includes(name)) return 0.9;
    return tokenScore(candidate, name);
  }));
}

export function selectSourceCandidate(meals, resolution) {
  const ranked = (Array.isArray(meals) ? meals : [])
    .map((meal) => ({
      meal,
      score: scoreSourceCandidate(meal?.strMeal, resolution),
      isComplete: hasRequiredSourceCompleteness({
        sourceTitle: String(meal?.strMeal || "").trim(),
        ingredientLines: ingredientLinesFor(meal),
        instructionsText: String(meal?.strInstructions || "").trim(),
      }),
      metadata: Number(Boolean(String(meal?.strSource || "").trim()))
        + Number(Boolean(String(meal?.strMealThumb || "").trim())),
    }))
    .filter(({ score, isComplete }) => score >= 0.82 && isComplete)
    .sort((left, right) => right.score - left.score || right.metadata - left.metadata);
  return ranked[0]?.meal || null;
}

export function normalizeTheMealDbRecipe(meal, persistencePolicy) {
  const ingredientLines = ingredientLinesFor(meal);
  const sourceTitle = String(meal?.strMeal || "").trim();
  const instructionsText = String(meal?.strInstructions || "").trim();
  const sourceUrl = String(meal?.strSource || "").trim();
  const sourceImageUrl = String(meal?.strMealThumb || "").trim();
  const completeness = sourceCompletenessDescriptor({
    sourceTitle,
    ingredientLines,
    instructionsText,
    sourceUrl,
    sourceImageUrl,
  });

  if (!completeness.is_complete) {
    return null;
  }

  return {
    provider_id: String(meal.idMeal),
    source_provider: "themealdb",
    source_title: sourceTitle,
    source_url: sourceUrl,
    source_image_url: sourceImageUrl,
    source_completeness: completeness,
    source_persistence: persistencePolicy,
    ingredient_lines: ingredientLines,
    instructions_text: instructionsText,
  };
}
