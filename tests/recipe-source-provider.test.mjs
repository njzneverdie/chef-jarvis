import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  baselineDishResolution,
  normalizeDishResolution,
} from "../supabase/functions/_shared/dish-resolver.js";
import {
  normalizeTheMealDbRecipe,
  selectSourceCandidate,
} from "../supabase/functions/_shared/recipe-source.js";
import { fetchTheMealDbRecipe } from "../supabase/functions/_shared/themealdb-provider.js";

const hitFixture = JSON.parse(await readFile(
  new URL("./fixtures/themealdb-beef-bourguignon.json", import.meta.url),
  "utf8",
));
const missFixture = JSON.parse(await readFile(
  new URL("./fixtures/themealdb-empty.json", import.meta.url),
  "utf8",
));

test("rejects a merely ingredient-related meal title", () => {
  const resolution = baselineDishResolution("肉燥飯");
  assert.equal(
    selectSourceCandidate(
      [{ strMeal: "Vegetable Pork Rice Bowl" }],
      resolution,
    ),
    null,
  );
});

test("selects an exact external recipe and keeps provenance", () => {
  const selected = selectSourceCandidate(
    hitFixture.meals,
    baselineDishResolution("Beef Bourguignon"),
  );
  const recipe = normalizeTheMealDbRecipe(selected, "session_only");
  assert.equal(recipe.source_provider, "themealdb");
  assert.equal(recipe.source_title, "Beef Bourguignon");
  assert.equal(recipe.source_persistence, "session_only");
  assert.deepEqual(recipe.ingredient_lines, ["1 kg Beef", "750 ml Red Wine"]);
  assert.deepEqual(recipe.source_completeness, {
    ingredient_count: 2,
    has_instructions: true,
    has_image: true,
    has_source_url: true,
    is_complete: true,
  });
});

test("normalizes stable completeness details for an incomplete recipe", () => {
  const recipe = normalizeTheMealDbRecipe({
    idMeal: "incomplete-1",
    strMeal: "Beef Bourguignon",
    strInstructions: "",
    strIngredient1: "Beef",
  }, "session_only");

  assert.equal(recipe, null);
});

for (const sourceUrl of [
  "",
  "/recipes/beef-bourguignon",
  "http://example.com/beef-bourguignon",
  "javascript:alert(1)",
  "https://",
]) {
  test(`rejects a provider recipe without a safely renderable HTTPS source URL: ${sourceUrl || "missing"}`, () => {
    const recipe = normalizeTheMealDbRecipe({
      idMeal: "invalid-source-url",
      strMeal: "Beef Bourguignon",
      strInstructions: "Brown and braise the beef.",
      strIngredient1: "Beef",
      strIngredient2: "Red Wine",
      strSource: sourceUrl,
    }, "session_only");

    assert.equal(recipe, null);
  });
}

test("rejects truncated titles and one-word aliases for a multi-word dish", () => {
  const resolution = baselineDishResolution("Beef Bourguignon");
  resolution.aliases.push("Beef");

  assert.equal(selectSourceCandidate([{
    strMeal: "Beef",
    strInstructions: "Brown and braise the beef.",
    strIngredient1: "Beef",
    strIngredient2: "Red Wine",
    strSource: "https://example.com/beef-bourguignon-stew",
  }], resolution), null);
  assert.equal(
    selectSourceCandidate([{
      strMeal: "Beef Bourguignon Stew",
      strInstructions: "Brown and braise the beef.",
      strIngredient1: "Beef",
      strIngredient2: "Red Wine",
      strSource: "https://example.com/beef-bourguignon-stew",
    }], resolution)?.strMeal,
    "Beef Bourguignon Stew",
  );
});

test("does not select provider candidates that match only untrusted model aliases", () => {
  const resolution = normalizeDishResolution("肉躁飯", {
    canonical_name: "肉燥飯",
    aliases: ["French stew", "白飯"],
    confidence: 0.98,
  });
  const completeMeal = (strMeal) => ({
    strMeal,
    strInstructions: "Cook until ready.",
    strIngredient1: "Pork",
    strIngredient2: "Rice",
    strSource: "https://example.com/recipe",
  });

  assert.equal(selectSourceCandidate([
    completeMeal("Classic French Stew"),
    completeMeal("家常白飯"),
  ], resolution), null);
  assert.equal(
    selectSourceCandidate([completeMeal("經典魯肉飯")], resolution)?.strMeal,
    "經典魯肉飯",
  );
});

test("prefers a complete close match over an incomplete exact title", () => {
  const selected = selectSourceCandidate([
    {
      strMeal: "Beef Bourguignon",
      strIngredient1: "Beef",
      strIngredient2: "Red Wine",
      strSource: "https://example.com/beef-bourguignon",
      strMealThumb: "https://example.com/beef-bourguignon.jpg",
    },
    {
      strMeal: "Beef Bourguignon Stew",
      strInstructions: "Brown the beef, then braise until tender.",
      strIngredient1: "Beef",
      strIngredient2: "Red Wine",
      strSource: "https://example.com/beef-bourguignon-stew",
    },
  ], baselineDishResolution("Beef Bourguignon"));

  assert.equal(selected?.strMeal, "Beef Bourguignon Stew");
});

test("returns provider_miss without choosing a nearby dish", async () => {
  const result = await fetchTheMealDbRecipe({
    apiKey: "test-key",
    resolution: baselineDishResolution("肉燥飯"),
    fetchImpl: async () => new Response(JSON.stringify(missFixture)),
    timeoutMs: 4000,
  });
  assert.equal(result.outcome, "provider_miss");
  assert.equal(result.recipe, null);
});

test("maps aborts to provider_unavailable", async () => {
  const result = await fetchTheMealDbRecipe({
    apiKey: "test-key",
    resolution: baselineDishResolution("Beef Bourguignon"),
    fetchImpl: async () => {
      throw new DOMException("Timed out", "AbortError");
    },
    timeoutMs: 10,
  });
  assert.equal(result.outcome, "provider_unavailable");
});

test("maps HTTP 429 to provider_unavailable", async () => {
  const result = await fetchTheMealDbRecipe({
    apiKey: "test-key",
    resolution: baselineDishResolution("Beef Bourguignon"),
    fetchImpl: async () => new Response("rate limited", { status: 429 }),
  });

  assert.equal(result.outcome, "provider_unavailable");
});

test("maps malformed provider payloads to provider_unavailable", async () => {
  const result = await fetchTheMealDbRecipe({
    apiKey: "test-key",
    resolution: baselineDishResolution("Beef Bourguignon"),
    fetchImpl: async () => new Response(JSON.stringify({ unexpected: [] })),
  });

  assert.equal(result.outcome, "provider_unavailable");
});

test("reports a matching incomplete source", async () => {
  const result = await fetchTheMealDbRecipe({
    apiKey: "test-key",
    resolution: baselineDishResolution("Beef Bourguignon"),
    fetchImpl: async () => new Response(JSON.stringify({
      meals: [{ strMeal: "Beef Bourguignon", strIngredient1: "Beef" }],
    })),
  });

  assert.equal(result.outcome, "provider_recipe_incomplete");
  assert.equal(result.recipe, null);
});

test("reports a matching recipe with an unsafe source URL as incomplete", async () => {
  const result = await fetchTheMealDbRecipe({
    apiKey: "test-key",
    resolution: baselineDishResolution("Beef Bourguignon"),
    fetchImpl: async () => new Response(JSON.stringify({
      meals: [{
        strMeal: "Beef Bourguignon",
        strInstructions: "Brown and braise the beef.",
        strIngredient1: "Beef",
        strIngredient2: "Red Wine",
        strSource: "javascript:alert(1)",
      }],
    })),
  });

  assert.equal(result.outcome, "provider_recipe_incomplete");
  assert.equal(result.recipe, null);
});

test("aborts a genuinely pending fetch through its supplied signal", async () => {
  let receivedSignal;
  const result = await fetchTheMealDbRecipe({
    apiKey: "test-key",
    resolution: baselineDishResolution("Beef Bourguignon"),
    timeoutMs: 20,
    fetchImpl: async (_url, { signal }) => new Promise((_, reject) => {
      receivedSignal = signal;
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }),
  });

  assert.ok(receivedSignal instanceof AbortSignal);
  assert.equal(receivedSignal.aborted, true);
  assert.equal(result.outcome, "provider_unavailable");
});
