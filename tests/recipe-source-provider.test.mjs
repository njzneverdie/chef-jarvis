import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { baselineDishResolution } from "../supabase/functions/_shared/dish-resolver.js";
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
