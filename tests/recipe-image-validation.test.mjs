import assert from "node:assert/strict";
import test from "node:test";

import {
  curatedRecipeImage,
  dishImageFamily,
  imageCandidateLooksPhotographic,
  imageCandidateMatchesFamily,
  recipeImageQueryPlan,
} from "../supabase/functions/_shared/recipe-image.js";

test("dish image families distinguish fried rice from pasta", () => {
  assert.equal(dishImageFamily("排骨蛋炒飯"), "fried_rice");
  assert.equal(dishImageFamily("Taiwanese pork chop egg fried rice"), "fried_rice");
  assert.equal(dishImageFamily("Bolognese lasagna"), "pasta");
  assert.equal(dishImageFamily("Exact vegetable rice bowl"), "grain_bowl");
  assert.equal(
    imageCandidateMatchesFamily(
      "fried_rice",
      "File:Chicken and egg fried rice.jpg",
    ),
    true,
  );
  assert.equal(
    imageCandidateMatchesFamily(
      "fried_rice",
      "Creamy chicken penne pasta on a plate",
    ),
    false,
  );
});

test("generic grain-bowl recommendations use an appetizing attributed photo", () => {
  const image = curatedRecipeImage({
    title: "Exact vegetable rice bowl",
    imageQuery: "vegetable chickpea rice bowl",
  });
  assert.match(image.url, /BuddhaBowlLot\.jpg/);
  assert.equal(image.creator, "PizzaMan");
  assert.equal(image.license, "CC BY-SA 4.0");
  const salmon = curatedRecipeImage({ title: "Pan-seared salmon" });
  assert.match(salmon.url, /Salmon%2C_pan-seared_and_glazed/);
  assert.equal(salmon.creator, "Daderot");
  assert.equal(salmon.license, "CC0 1.0");
});

test("image search rejects clip art and other non-photographic results", () => {
  assert.equal(
    imageCandidateLooksPhotographic("File:Cooked fish clip art.png"),
    false,
  );
  assert.equal(
    imageCandidateLooksPhotographic("Salmon cooking illustration vector"),
    false,
  );
  assert.equal(
    imageCandidateLooksPhotographic(
      "Pan-seared salmon with Brussels sprouts photograph",
    ),
    true,
  );
});

test("a dish request overrides a conflicting AI image query", () => {
  const plan = recipeImageQueryPlan({
    request: "排骨蛋炒飯",
    title: "排骨蛋炒飯",
    imageQuery: "creamy Italian pasta",
  });
  assert.equal(plan.family, "fried_rice");
  assert.deepEqual(plan.queries, ["creamy Italian pasta", "egg fried rice"]);
});

test("fried rice image search always includes a safe broad fallback", () => {
  const plan = recipeImageQueryPlan({
    request: "排骨蛋炒飯",
    title: "Taiwanese pork chop egg fried rice",
    imageQuery: "Taiwanese pork chop egg fried rice",
  });
  assert.equal(plan.family, "fried_rice");
  assert.equal(plan.queries.at(-1), "egg fried rice");
});

test("image candidates disclose exact, representative, and curated matches", () => {
  const plan = recipeImageQueryPlan({
    request: "Taiwanese pork chop egg fried rice",
    title: "Taiwanese pork chop egg fried rice",
    imageQuery: "Taiwanese pork chop egg fried rice",
  });
  assert.equal(plan.candidates[0].match_kind, "exact");
  assert.equal(plan.candidates.at(-1).match_kind, "representative");

  const curated = curatedRecipeImage({ title: "Pan-seared salmon" });
  assert.equal(curated.match_kind, "curated");
});
