import { recipeRestrictionRejectionReason } from "./named-recipe-integrity.js";
import { mealConstraintRejectionReason } from "./meal-planning-constraints.js";

// Fully cooked, ready-to-eat ingredients: no guessed cooking times or raw-meat
// substitutions. Quantities/macros scale together; instructions refer to them.
export function selectionFallbackPlan(constraints, profile, language = "en", recentMeals = []) {
  if (!constraints) return null;
  const zh = language === "zh-TW", n = constraints.servings;
  const restrictions = { ...profile, allergies: [...(profile?.allergies || []), ...(profile?.dislikes || [])] };
  const proteins = [
    { en: "Canned chickpeas", zh: "罐裝熟鷹嘴豆", query: "chickpeas canned drained", kcal: 208, p: 11, c: 34, f: 4 },
    { en: "Canned white beans", zh: "罐裝熟白豆", query: "white beans canned drained", kcal: 209, p: 12, c: 38, f: 1 },
    { en: "Canned light tuna in water", zh: "水煮鮪魚罐頭", query: "tuna light canned in water drained", kcal: 174, p: 38, c: 0, f: 2 },
  ];
  const aliases = {
    "Canned chickpeas": "chickpea chickpeas garbanzo beans legumes 鷹嘴豆 鹰嘴豆 雪蓮子 雪莲子 豆類 豆类",
    "Canned white beans": "white beans cannellini legumes 白豆 白芸豆 豆類 豆类",
    "Canned light tuna in water": "tuna fish 鮪魚 鲔鱼 金槍魚 金枪鱼 吞拿魚 吞拿鱼 魚 鱼",
    "Cucumber": "cucumber 小黃瓜 小黄瓜 黃瓜 黄瓜",
    "Tomato": "tomato tomatoes 番茄 西紅柿 西红柿",
    "Olive oil": "olive oil olives 橄欖油 橄榄油 橄欖 橄榄",
    "Lemon juice": "lemon juice citrus 檸檬汁 柠檬汁 檸檬 柠檬 柑橘",
    "Table salt": "salt table 食鹽 食盐 鹽 盐",
  };
  const candidates = proteins.map(protein => {
    const ingredient = (en, name, query, quantity, unit, preparation, category) => ({ name: zh ? name : en, usda_query: query, quantity: quantity * n, unit, preparation, category, safety_aliases: aliases[en] });
    const name = zh ? protein.zh : protein.en;
    return {
      title: zh ? `${name}番茄小黃瓜沙拉` : `${protein.en} tomato cucumber salad`,
      image_query: `${protein.en} tomato cucumber salad`,
      summary: zh ? "使用即食熟食材的免開火備援餐點。份量依所選人數調整；營養為估算，風味與庫存偏好可能未完全符合。" : "A no-cook backup meal using ready-to-eat ingredients. Quantities match your servings; nutrition is estimated and cuisine/pantry preferences may differ.",
      minutes: 10, servings: n,
      kcal: (protein.kcal + 91) * n, protein_g: (protein.p + 2) * n,
      carbs_g: (protein.c + 10) * n, fat_g: (protein.f + 5) * n,
      ingredients: [
        ingredient(protein.en, protein.zh, protein.query, 150, "g", zh ? "確認標示已煮熟可即食，瀝乾後秤重" : "check label: fully cooked and ready to eat; drained weight", "protein"),
        ingredient("Cucumber", "小黃瓜", "cucumber raw with peel", 100, "g", zh ? "洗淨切丁" : "washed and diced", "produce"),
        ingredient("Tomato", "番茄", "tomato red raw", 100, "g", zh ? "洗淨切丁" : "washed and diced", "produce"),
        ingredient("Olive oil", "橄欖油", "olive oil", 5, "ml", zh ? "無需處理" : "no preparation", "oil"),
        ingredient("Lemon juice", "檸檬汁", "lemon juice raw", 10, "ml", zh ? "榨汁" : "squeezed", "seasoning"),
        ingredient("Table salt", "食鹽", "salt table", 1, "g", zh ? "無需處理" : "no preparation", "seasoning"),
      ],
      steps: (zh ? [
        `確認${name}包裝標示為已煮熟可即食；不要使用生鮮替代品。依食材清單的總用量瀝乾並秤重。`,
        "清洗小黃瓜與番茄，依食材清單用量切丁，放入乾淨的大碗。",
        `加入${name}、橄欖油、檸檬汁及食鹽，拌勻後依所選份數均分，立即食用。未食用部分及時冷藏。`,
      ] : [
        `Check the ${name} label says fully cooked and ready to eat; never substitute raw food. Drain and weigh the total quantity listed.`,
        "Wash and dice the cucumber and tomato using the listed quantities; place in a clean large bowl.",
        `Add the ${name}, olive oil, lemon juice and table salt. Toss, divide into the selected servings and serve immediately. Refrigerate leftovers promptly.`,
      ]).map(instruction => ({ instruction, timers: [] })),
      substitutions: [], equipment_adaptations: [], reuse_ideas: [], fallback: true,
    };
  }).filter(plan => {
    const safetyPlan = { ...plan, ingredients: plan.ingredients.map(item => ({ ...item, name: item.safety_aliases })) };
    return !recipeRestrictionRejectionReason(safetyPlan, restrictions) && !mealConstraintRejectionReason(plan, constraints);
  }).map(plan => ({ ...plan, ingredients: plan.ingredients.map(({ safety_aliases, ...item }) => item) }));
  // Prefer a previously unseen safe template. Safety takes precedence over variety.
  return candidates.find(plan => !recentMeals.some(recent => recent.title === plan.title)) || candidates[0] || null;
}
