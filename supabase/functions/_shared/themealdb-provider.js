import { dishSearchTerms } from "./dish-resolver.js";
import {
  normalizeTheMealDbRecipe,
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
  try {
    for (const term of dishSearchTerms(resolution)) {
      const url =
        `https://www.themealdb.com/api/json/v1/${encodeURIComponent(apiKey)}` +
        `/search.php?s=${encodeURIComponent(term)}`;
      const response = await fetchImpl(url, { signal });
      if (!response.ok) continue;
      const payload = await response.json();
      const selected = selectSourceCandidate(payload.meals, resolution);
      if (selected) {
        const recipe = normalizeTheMealDbRecipe(selected, persistencePolicy);
        if (recipe) {
          return { outcome: "external_recipe", recipe };
        }
      }
    }
    return { outcome: "provider_miss", recipe: null };
  } catch (error) {
    return {
      outcome: "provider_unavailable",
      recipe: null,
      reason: error instanceof Error ? error.message : "unknown",
    };
  }
}
