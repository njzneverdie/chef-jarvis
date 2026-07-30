import assert from "node:assert/strict";
import test from "node:test";
import {
  isBroadMealRequest,
  mealTitleSimilarity,
  recipeVarietyRejectionReason,
  selectLeastRecentFallback,
} from "../supabase/functions/_shared/recipe-variety.js";

test("recognizes broad meal requests without treating exact dishes as broad", () => {
  assert.equal(isBroadMealRequest("High-protein dinner for two"), true);
  assert.equal(isBroadMealRequest("推薦一份健康晚餐"), true);
  assert.equal(isBroadMealRequest("pan-seared salmon"), false);
  assert.equal(isBroadMealRequest("排骨蛋炒飯"), false);
});

test("detects near-duplicate recipe titles", () => {
  assert.ok(
    mealTitleSimilarity(
      "Pan-Seared Lemon Herb Salmon with Quinoa",
      "Pan-Seared Lemon Herb Salmon with Asparagus",
    ) >= 0.56,
  );
});

test("rejects recent duplicates for broad requests", () => {
  const reason = recipeVarietyRejectionReason(
    {
      title: "Pan-Seared Garlic Salmon with Broccoli",
      ingredients: [
        { name: "Salmon fillet", usda_query: "salmon", category: "protein" },
      ],
      steps: [{ instruction: "Pan-sear the salmon for 4 minutes." }],
    },
    [{
      title: "Pan-Seared Lemon Salmon with Asparagus",
      primary_protein: "salmon",
      cooking_style: "pan_seared",
    }],
    "high protein dinner",
  );
  assert.match(reason, /recent|repeats/i);
});

test("does not block an explicitly requested repeat", () => {
  assert.equal(
    recipeVarietyRejectionReason(
      { title: "Pan-Seared Salmon", ingredients: [], steps: [] },
      [{ title: "Pan-Seared Salmon" }],
      "pan-seared salmon",
    ),
    "",
  );
});

test("rotates fallback recipes away from recently used titles", () => {
  const variants = [
    { id: "chicken", title: "Lemon paprika chicken quinoa skillet" },
    { id: "beef", title: "Ginger beef broccoli skillet" },
    { id: "turkey", title: "Turkey white bean tomato skillet" },
  ];
  const selected = selectLeastRecentFallback(
    variants,
    [
      { title: variants[0].title },
      { title: variants[1].title },
    ],
    "high protein dinner",
  );
  assert.equal(selected.id, "turkey");
});

test("fallback rotation recognizes localized title aliases", () => {
  const variants = [
    {
      id: "chicken",
      title: "Lemon paprika chicken quinoa skillet",
      aliases: ["檸檬紅椒雞肉藜麥鍋"],
    },
    {
      id: "beef",
      title: "Ginger beef broccoli skillet",
      aliases: ["薑香牛肉青花菜鍋"],
    },
  ];
  assert.equal(
    selectLeastRecentFallback(
      variants,
      [{ title: "檸檬紅椒雞肉藜麥鍋" }],
      "高蛋白晚餐",
    ).id,
    "beef",
  );
});
