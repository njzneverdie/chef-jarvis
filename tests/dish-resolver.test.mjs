import assert from "node:assert/strict";
import test from "node:test";
import {
  baselineDishResolution,
  classifyMealRequest,
  dishSearchTerms,
  normalizeDishResolution,
} from "../supabase/functions/_shared/dish-resolver.js";
import { parseMenuRequest } from "../supabase/functions/_shared/menu-request.js";
import {
  namedDishCoreIdentityRejectionReason,
  namedDishRejectionReason,
} from "../supabase/functions/_shared/named-recipe-integrity.js";

test("classifies recognizable dish names separately from broad requests", () => {
  assert.equal(classifyMealRequest("肉燥飯"), "named_dish");
  assert.equal(classifyMealRequest("Beef Bourguignon"), "named_dish");
  assert.equal(classifyMealRequest("推薦一份高蛋白晚餐"), "broad_request");
});

test("routes a full menu into independent single-dish resolutions", () => {
  const menu = parseMenuRequest("宮保雞丁、排骨蛋炒飯、炒高麗菜");
  assert.equal(menu.kind, "menu");
  assert.deepEqual(
    menu.dishes.map((dish) => baselineDishResolution(dish).canonicalName),
    ["宮保雞丁", "排骨蛋炒飯", "炒高麗菜"],
  );
});

test("keeps explicit dish names named when recommendation or nutrition modifiers are present", () => {
  for (const request of [
    "推薦肉燥飯",
    "請推薦 Beef Bourguignon",
    "高蛋白肉燥飯",
    "Please recommend beef bourguignon",
    "high-protein beef bourguignon",
    "幫我做一道低脂麻婆豆腐",
    "推薦肉燥飯食譜",
    "高蛋白肉燥飯做法",
    "Recipe for Beef Bourguignon",
  ]) {
    assert.equal(classifyMealRequest(request), "named_dish", request);
  }
});

test("keeps genuinely broad recommendation targets broad", () => {
  for (const request of [
    "推薦一份高蛋白晚餐",
    "請推薦健康晚餐",
    "高蛋白晚餐",
    "Recommend a healthy dinner",
    "Please suggest a quick meal",
    "推薦低脂雞肉料理",
  ]) {
    assert.equal(classifyMealRequest(request), "broad_request", request);
  }
});

test("uses the explicit dish target as canonical seed while preserving the original label", () => {
  const chinese = baselineDishResolution("請推薦高蛋白肉燥飯");
  const english = baselineDishResolution("Please recommend Beef Bourguignon");

  assert.equal(chinese.originalRequest, "請推薦高蛋白肉燥飯");
  assert.equal(chinese.displayName, "請推薦高蛋白肉燥飯");
  assert.equal(chinese.canonicalName, "肉燥飯");
  assert.equal(english.originalRequest, "Please recommend Beef Bourguignon");
  assert.equal(english.canonicalName, "Beef Bourguignon");
  assert.equal(
    baselineDishResolution("推薦肉燥飯食譜").canonicalName,
    "肉燥飯",
  );
  assert.equal(
    baselineDishResolution("Recipe for Beef Bourguignon").canonicalName,
    "Beef Bourguignon",
  );
});

test("extracts bounded Chinese and English recipe request frames", () => {
  const cases = [
    {
      request: "  給我一份麻婆豆腐的食譜！  ",
      originalRequest: "給我一份麻婆豆腐的食譜!",
      canonicalName: "麻婆豆腐",
    },
    {
      request: "我想請你推薦肉燥飯。",
      originalRequest: "我想請你推薦肉燥飯。",
      canonicalName: "肉燥飯",
    },
    {
      request: "  GIVE   me a recipe for chicken tikka masala. ",
      originalRequest: "GIVE me a recipe for chicken tikka masala.",
      canonicalName: "chicken tikka masala",
    },
    {
      request: "I would like a beef bourguignon recipe",
      originalRequest: "I would like a beef bourguignon recipe",
      canonicalName: "beef bourguignon",
    },
    {
      request: "Recommend ahi tuna",
      originalRequest: "Recommend ahi tuna",
      canonicalName: "ahi tuna",
    },
    {
      request: "Ahi tuna",
      originalRequest: "Ahi tuna",
      canonicalName: "Ahi tuna",
    },
  ];

  for (const { request, originalRequest, canonicalName } of cases) {
    const resolution = baselineDishResolution(request);
    assert.equal(resolution.requestType, "named_dish", request);
    assert.equal(resolution.originalRequest, originalRequest, request);
    assert.equal(resolution.displayName, originalRequest, request);
    assert.equal(resolution.canonicalName, canonicalName, request);
  }
});

test("keeps established broad-intent phrases broad after target extraction", () => {
  for (const request of [
    "Surprise me!",
    "  USE   MY PANTRY  ",
    "用我的庫存。",
    "晚餐建議",
    "  HIGH   PROTEIN  ",
    "推薦今晚吃什麼？",
    "今晚吃什麼？",
    "What should I eat for dinner?",
    "What should I cook tonight?",
  ]) {
    assert.equal(classifyMealRequest(request), "broad_request", request);
  }
});

test("classifies generic English meal questions with a meal and daypart as broad", () => {
  for (const request of [
    "What should I eat for dinner tonight?",
    "What should we cook for dinner tonight?",
    "What should I cook for dinner today?",
  ]) {
    assert.equal(classifyMealRequest(request), "broad_request", request);
  }
});

test("classifies bounded conversational dinner questions as broad requests", () => {
  for (const request of [
    "What's for dinner?",
    "晚餐吃什麼？",
    "今晚想吃什麼？",
  ]) {
    assert.equal(classifyMealRequest(request), "broad_request", request);
  }

  for (const request of [
    "What's in Beef Bourguignon?",
    "晚餐吃麻婆豆腐",
    "今晚想吃肉燥飯",
  ]) {
    assert.equal(classifyMealRequest(request), "named_dish", request);
  }
});

test("normalizes approved aliases while preserving the original request", () => {
  const resolution = baselineDishResolution("魯肉飯");
  assert.equal(resolution.originalRequest, "魯肉飯");
  assert.equal(resolution.displayName, "魯肉飯");
  assert.equal(resolution.canonicalName, "肉燥飯");
  assert.ok(resolution.aliases.includes("lu rou fan"));
  assert.ok(resolution.aliases.includes("minced pork rice"));
  assert.ok(resolution.identityAliases.includes("魯肉飯"));
  assert.ok(resolution.identityAliases.includes("lu rou fan"));
  assert.ok(resolution.coreIngredientGroups.some((group) =>
    group.includes("ground pork") && group.includes("minced pork"),
  ));
  assert.ok(resolution.coreTechniqueTerms.includes("braise"));
});

test("normalizes Bolognese lasagna aliases into one curated dish identity", () => {
  for (const request of [
    "波隆那千層麵",
    "波隆那肉醬千層麵",
    "Bolognese lasagna",
    "Lasagna alla Bolognese",
  ]) {
    const resolution = baselineDishResolution(request);
    assert.equal(resolution.requestType, "named_dish", request);
    assert.equal(resolution.canonicalName, "波隆那千層麵", request);
    assert.equal(resolution.coreEvidenceSource, "curated", request);
    assert.ok(resolution.identityAliases.includes("Bolognese lasagna"), request);
    assert.ok(resolution.identityAliases.includes("Lasagna alla Bolognese"), request);
    assert.equal(
      namedDishCoreIdentityRejectionReason({
        title: request,
        ingredients: [{ name: "千層麵片", usda_query: "dry lasagna noodles" }],
        steps: [{ instruction: "將肉醬、麵片與起司分層鋪好後烘烤 35 分鐘。" }],
      }, resolution),
      "",
      request,
    );
  }
});

test("normalizes small trusted core markers while keeping model aliases search-only", () => {
  const resolution = normalizeDishResolution("Beef Bourguignon", {
    canonical_name: "Beef Bourguignon",
    aliases: ["French stew"],
    core_ingredient_groups: [
      ["beef chuck", "beef stew meat"],
      ["red wine", "burgundy wine"],
      "not-an-array",
      ["this value is deliberately too long to be accepted because bounded core identity evidence must remain compact"],
    ],
    core_techniques: ["braise", "simmer", ""],
    confidence: 0.98,
  });

  assert.deepEqual(resolution.coreIngredientGroups, [
    ["beef chuck", "beef stew meat"],
    ["red wine", "burgundy wine"],
  ]);
  assert.deepEqual(resolution.coreTechniqueTerms, ["braise", "simmer"]);
  assert.ok(resolution.aliases.includes("French stew"));
  assert.ok(!resolution.identityAliases.includes("French stew"));
});

test("accepts a high-confidence typo resolution from the model", () => {
  const resolution = normalizeDishResolution("肉躁飯", {
    canonical_name: "肉燥飯",
    aliases: ["lu rou fan", "minced pork rice"],
    confidence: 0.98,
    candidates: [],
  });
  assert.equal(resolution.needsClarification, false);
  assert.equal(resolution.displayName, "肉躁飯");
  assert.equal(resolution.canonicalName, "肉燥飯");
});

test("only auto-remaps curated identity aliases", () => {
  const chinese = normalizeDishResolution("肉躁飯", {
    canonical_name: "肉燥飯",
    confidence: 0.98,
  });
  const curatedAlias = normalizeDishResolution("肉燥飯", {
    canonical_name: "魯肉飯",
    confidence: 0.98,
  });

  assert.equal(chinese.needsClarification, false);
  assert.equal(chinese.canonicalName, "肉燥飯");
  assert.equal(curatedAlias.needsClarification, false);
  assert.equal(curatedAlias.canonicalName, "肉燥飯");
});

test("trusts canonical same-name comparisons across NFKC, whitespace, and case", () => {
  const caseOnly = normalizeDishResolution("beef bourguignon", {
    canonical_name: "Beef Bourguignon",
    confidence: 0.99,
  });
  const normalizedWidth = normalizeDishResolution("beef   bourguignon", {
    canonical_name: "Ｂｅｅｆ　Ｂｏｕｒｇｕｉｇｎｏｎ",
    confidence: 0.99,
  });

  assert.equal(caseOnly.needsClarification, false);
  assert.equal(caseOnly.canonicalName, "Beef Bourguignon");
  assert.equal(normalizedWidth.needsClarification, false);
  assert.equal(normalizedWidth.canonicalName, "Beef Bourguignon");
});

test("rejects semantic substitutions and only accepts curated Han corrections", () => {
  for (const [request, canonical] of [
    ["豬肉飯", "牛肉飯"],
    ["Chicken soup", "Chicken stew"],
    ["Pork rice", "Beef rice"],
  ]) {
    const resolution = normalizeDishResolution(request, {
      canonical_name: canonical,
      confidence: 0.99,
    });
    assert.equal(resolution.needsClarification, true, request);
  }

  const curated = normalizeDishResolution("肉躁飯", {
    canonical_name: "肉燥飯",
    confidence: 0.99,
  });
  const carbonara = normalizeDishResolution("Carbonarra", {
    canonical_name: "Carbonara",
    confidence: 0.99,
  });
  assert.equal(curated.needsClarification, false);
  assert.equal(carbonara.needsClarification, true);
  assert.equal(carbonara.needsDescription, false);
  assert.equal(carbonara.canonicalName, "Carbonarra");
  assert.deepEqual(carbonara.clarificationCandidates, ["Carbonara"]);
});

test("requires clarification before trusting similarly spelled Latin dish names", () => {
  const resolution = normalizeDishResolution("Carbonara", {
    canonical_name: "Carbonada",
    confidence: 0.99,
    candidates: ["Chicken soup", "Carbonada", "Carbonara"],
  });

  assert.equal(resolution.needsClarification, true);
  assert.equal(resolution.needsDescription, false);
  assert.equal(resolution.canonicalName, "Carbonara");
  assert.deepEqual(resolution.clarificationCandidates, ["Carbonada", "Carbonara"]);
});

test("filters each clarification candidate to an independently related dish", () => {
  const resolution = normalizeDishResolution("pizza", {
    canonical_name: "Chicken soup",
    confidence: 0.2,
    candidates: ["Margherita pizza", "Chicken soup", "Pizza"],
  });
  assert.deepEqual(resolution.clarificationCandidates, ["Margherita pizza", "Pizza"]);
});

test("marks resolver core markers as untrusted model hints", () => {
  const resolution = normalizeDishResolution("Beef Bourguignon", {
    canonical_name: "Beef Bourguignon",
    core_ingredient_groups: [["beef"]],
    core_techniques: ["braise"],
    confidence: 0.99,
  });
  assert.equal(resolution.coreEvidenceSource, "model_hint");
  assert.equal(baselineDishResolution("肉燥飯").coreEvidenceSource, "curated");
});

test("fails closed when a high-confidence model remap is unrelated", () => {
  const resolution = normalizeDishResolution("Beef Bourguignon", {
    canonical_name: "Chicken soup",
    aliases: ["Beef Bourguignon"],
    confidence: 0.99,
    candidates: ["Chicken soup", "Beef Bourguignon", "Salad"],
  });

  assert.equal(resolution.needsClarification, true);
  assert.equal(resolution.needsDescription, false);
  assert.equal(resolution.canonicalName, "Beef Bourguignon");
  assert.deepEqual(resolution.clarificationCandidates, ["Beef Bourguignon"]);
  assert.ok(!resolution.identityAliases.includes("Chicken soup"));
});

test("keeps model aliases searchable without trusting them as dish identity", () => {
  const resolution = normalizeDishResolution("肉躁飯", {
    canonical_name: "肉燥飯",
    aliases: ["French stew", "白飯"],
    confidence: 0.98,
    candidates: [],
  });

  assert.equal(resolution.canonicalName, "肉燥飯");
  assert.ok(resolution.aliases.includes("French stew"));
  assert.ok(resolution.aliases.includes("白飯"));
  assert.ok(dishSearchTerms(resolution).includes("French stew"));
  assert.ok(dishSearchTerms(resolution).includes("白飯"));
  assert.ok(!resolution.identityAliases.includes("French stew"));
  assert.ok(!resolution.identityAliases.includes("白飯"));
  assert.ok(resolution.identityAliases.includes("魯肉飯"));
  assert.ok(resolution.identityAliases.includes("lu rou fan"));
  assert.match(
    namedDishRejectionReason({ title: "Classic French stew" }, resolution),
    /does not match/i,
  );
  assert.match(
    namedDishRejectionReason({ title: "家常白飯" }, resolution),
    /does not match/i,
  );
  assert.equal(namedDishRejectionReason({ title: "家常肉燥飯" }, resolution), "");
  assert.equal(namedDishRejectionReason({ title: "classic lu rou fan" }, resolution), "");
});

test("requires clarification for a low-confidence dish resolution", () => {
  const resolution = normalizeDishResolution("紅燒飯", {
    canonical_name: "",
    aliases: [],
    confidence: 0.55,
    candidates: ["紅燒肉飯", "紅燒牛肉飯"],
  });
  assert.equal(resolution.needsClarification, true);
  assert.deepEqual(resolution.clarificationCandidates, [
    "紅燒肉飯",
    "紅燒牛肉飯",
  ]);
});

test("requires a description for an unrecognized custom dish name", () => {
  const resolution = normalizeDishResolution("Daniel 特製宇宙飯", {
    canonical_name: "",
    aliases: [],
    confidence: 0.2,
    candidates: [],
  });
  assert.equal(resolution.needsClarification, true);
  assert.equal(resolution.needsDescription, true);
  assert.deepEqual(resolution.clarificationCandidates, []);
});
