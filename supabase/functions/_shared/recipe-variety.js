const titleStopWords = new Set([
  "a",
  "an",
  "and",
  "bowl",
  "dinner",
  "for",
  "high",
  "meal",
  "of",
  "protein",
  "the",
  "with",
  "佐",
  "和",
  "的",
  "高蛋白",
  "晚餐",
  "料理",
]);

const proteinPatterns = [
  ["salmon", /\b(salmon)\b|鮭魚|鲑鱼/i],
  ["white_fish", /\b(cod|tilapia|halibut|haddock|white fish)\b|鱈魚|鳕鱼|白身魚/i],
  ["tuna", /\btuna\b|鮪魚|金槍魚|金枪鱼/i],
  ["chicken", /\b(chicken|poultry)\b|雞|鸡/i],
  ["turkey", /\bturkey\b|火雞|火鸡/i],
  ["beef", /\b(beef|steak|sirloin)\b|牛肉|牛排/i],
  ["pork", /\b(pork|pork chop|tenderloin)\b|豬|猪|排骨/i],
  ["tofu", /\b(tofu|tempeh|edamame)\b|豆腐|豆干|毛豆/i],
  ["legume", /\b(chickpea|lentil|bean|legume)\b|鷹嘴豆|鹰嘴豆|扁豆|豆類|豆类/i],
  ["egg", /\b(egg|eggs)\b|雞蛋|鸡蛋|蛋/i],
];

const methodPatterns = [
  ["pan_seared", /\b(pan[ -]?seared|seared)\b|香煎|乾煎|干煎/i],
  ["stir_fried", /\b(stir[ -]?fried|stir fry)\b|快炒|炒/i],
  ["grilled", /\b(grilled|chargrilled)\b|炙烤|燒烤|烧烤/i],
  ["roasted", /\b(roasted|oven roasted)\b|烘烤|烤製|烤制/i],
  ["baked", /\bbaked\b|焗烤|焗/i],
  ["braised", /\b(braised|stewed)\b|紅燒|红烧|燉|炖/i],
  ["curry", /\bcurry\b|咖哩|咖喱/i],
  ["poached", /\bpoached\b|水煮|汆燙|汆烫/i],
  ["skillet", /\bskillet\b|一鍋|一锅/i],
];

function normalize(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[_–—-]+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleTokens(value) {
  return new Set(
    normalize(value)
      .split(" ")
      .filter((token) => token.length > 1 && !titleStopWords.has(token)),
  );
}

export function isBroadMealRequest(request) {
  const value = normalize(request);
  return /(high protein|healthy (meal|dinner)|quick (meal|dinner)|dinner (idea|for)|meal (idea|recommendation)|recommend|surprise me|use my pantry|高蛋白|健康晚餐|快速晚餐|晚餐建議|晚餐建议|推薦|推荐|用我的庫存|用我的库存)/i.test(
    value,
  );
}

export function mealTitleSimilarity(left, right) {
  const leftTokens = titleTokens(left);
  const rightTokens = titleTokens(right);
  if (!leftTokens.size || !rightTokens.size) return 0;
  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1;
  }
  return intersection / new Set([...leftTokens, ...rightTokens]).size;
}

export function proteinFamily(value) {
  const normalized = normalize(value);
  return proteinPatterns.find(([, pattern]) => pattern.test(normalized))?.[0] ||
    "";
}

export function cookingStyle(value) {
  const normalized = normalize(value);
  return methodPatterns.find(([, pattern]) => pattern.test(normalized))?.[0] ||
    "";
}

export function primaryProteinName(plan) {
  const ingredients = Array.isArray(plan?.ingredients) ? plan.ingredients : [];
  const primary = ingredients.find((ingredient) =>
    ingredient?.category === "protein"
  );
  return String(primary?.usda_query || primary?.name || "");
}

export function cookingStyleForPlan(plan) {
  const instructions = Array.isArray(plan?.steps)
    ? plan.steps.map((step) => step?.instruction || "").join(" ")
    : "";
  return cookingStyle(`${plan?.title || ""} ${instructions}`);
}

export function recipeVarietyRejectionReason(plan, recentMeals, request) {
  if (!isBroadMealRequest(request)) return "";
  const recent = Array.isArray(recentMeals) ? recentMeals.slice(0, 8) : [];
  const candidateTitle = String(plan?.title || "");
  const candidateNormalized = normalize(candidateTitle);
  if (!candidateNormalized) return "";

  for (const meal of recent) {
    const recentTitle = String(meal?.title || "");
    if (
      normalize(recentTitle) === candidateNormalized ||
      mealTitleSimilarity(candidateTitle, recentTitle) >= 0.56
    ) {
      return `Meal is too similar to the recent recipe "${recentTitle}".`;
    }
  }

  const candidateProtein = proteinFamily(
    `${primaryProteinName(plan)} ${candidateTitle}`,
  );
  const candidateStyle = cookingStyleForPlan(plan);
  if (candidateProtein && candidateStyle) {
    const duplicatePair = recent.slice(0, 4).find((meal) => {
      const recentProtein = proteinFamily(
        `${meal?.primary_protein || ""} ${meal?.title || ""}`,
      );
      const recentStyle =
        cookingStyle(meal?.cooking_style || meal?.title || "");
      return recentProtein === candidateProtein && recentStyle === candidateStyle;
    });
    if (duplicatePair) {
      return `Meal repeats the recent ${candidateProtein}/${candidateStyle} combination.`;
    }
  }
  return "";
}

function stableHash(value) {
  let hash = 2166136261;
  for (const character of String(value || "")) {
    hash ^= character.codePointAt(0) || 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function selectLeastRecentFallback(variants, recentMeals, seed = "") {
  if (!Array.isArray(variants) || !variants.length) return null;
  const recentTitles = (Array.isArray(recentMeals) ? recentMeals : []).map(
    (meal) => String(meal?.title || ""),
  );
  const scored = variants.map((variant) => ({
    variant,
    recentIndex: recentTitles.findIndex((title) => {
      const names = [variant.title, ...(variant.aliases || [])];
      return names.some((name) =>
        mealTitleSimilarity(name, title) >= 0.56 ||
        normalize(name) === normalize(title)
      );
    }),
  }));
  const unseen = scored.filter(({ recentIndex }) => recentIndex === -1);
  if (unseen.length) {
    return unseen[stableHash(`${seed}:${recentTitles.length}`) % unseen.length]
      .variant;
  }
  return scored.sort((left, right) => right.recentIndex - left.recentIndex)[0]
    .variant;
}
