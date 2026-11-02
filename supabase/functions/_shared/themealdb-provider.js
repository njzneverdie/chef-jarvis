import { dishSearchTerms } from "./dish-resolver.js";
import {
  normalizeTheMealDbRecipe,
  scoreSourceCandidate,
  selectSourceCandidate,
} from "./recipe-source.js";

export async function fetchTheMealDbRecipe({
  apiKey,
  resolution,
  fetchImpl = fetch,
  timeoutMs = 4000,
  persistencePolicy = "session_only",
}) {
  if (!apiKey) {
    return { outcome: "provider_unavailable", recipe: null };
  }

  const signal = AbortSignal.timeout(timeoutMs);
  let sawIncompleteSource = false;
  try {
    for (const term of dishSearchTerms(resolution)) {
      const url =
        `https://www.themealdb.com/api/json/v1/${encodeURIComponent(apiKey)}` +
        `/search.php?s=${encodeURIComponent(term)}`;
      const response = await fetchImpl(url, { signal });
      if (!response.ok) {
        return { outcome: "provider_unavailable", recipe: null };
      }
      const payload = await response.json();
      if (!payload || typeof payload !== "object" || !Object.hasOwn(payload, "meals")
        || (payload.meals !== null && !Array.isArray(payload.meals))) {
        return { outcome: "provider_unavailable", recipe: null };
      }
      const hasMatchingCandidate = Array.isArray(payload.meals) && payload.meals.some((meal) =>
        scoreSourceCandidate(meal?.strMeal, resolution) >= 0.82
      );
      const selected = selectSourceCandidate(payload.meals, resolution);
      if (selected) {
        const recipe = normalizeTheMealDbRecipe(selected, persistencePolicy);
        if (recipe) {
          return { outcome: "external_recipe", recipe };
        }
      }
      sawIncompleteSource ||= hasMatchingCandidate;
    }
    return {
      outcome: sawIncompleteSource ? "provider_recipe_incomplete" : "provider_miss",
      recipe: null,
    };
  } catch (error) {
    return {
      outcome: "provider_unavailable",
      recipe: null,
      reason: error instanceof Error ? error.message : "unknown",
    };
  }
}
