import { createClient } from "npm:@supabase/supabase-js@2.110.5";

type Profile = {
  calorie_target?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  body_composition_goal?: string;
  dietary_preferences?: string[];
  allergies?: string[];
  dislikes?: string[];
  equipment?: string[];
};

type PantryItem = {
  name: string;
  quantity?: number | null;
  unit?: string | null;
  expires_on?: string | null;
};
const ingredientUnits = [
  "g",
  "kg",
  "ml",
  "L",
  "tsp",
  "tbsp",
  "cup",
  "piece",
  "clove",
  "slice",
  "can",
  "pack",
] as const;
const ingredientCategories = [
  "protein",
  "produce",
  "grain",
  "dairy",
  "seasoning",
  "oil",
  "other",
] as const;
type IngredientUnit = (typeof ingredientUnits)[number];
type IngredientCategory = (typeof ingredientCategories)[number];
type Ingredient = {
  name: string;
  usda_query: string;
  quantity: number;
  unit: IngredientUnit;
  preparation: string;
  category: IngredientCategory;
};
type Substitution = {
  from: string;
  to: string;
  usda_query: string;
  quantity: number;
  unit: IngredientUnit;
  preparation: string;
  category: IngredientCategory;
  reason: string;
};
type EquipmentAdaptation = {
  original: string;
  alternative: string;
  instructions: string;
  why: string;
};
type ReuseIdea = { title: string; uses: string[]; why: string };
const recipeTimerKinds = [
  "preheat",
  "cook",
  "bake",
  "simmer",
  "boil",
  "steam",
  "rest",
  "marinate",
  "chill",
  "proof",
  "cool",
] as const;
type RecipeTimerKind = (typeof recipeTimerKinds)[number];
type RecipeTimer = {
  label: string;
  kind: RecipeTimerKind;
  duration_seconds: number;
};
type RecipeStep = { instruction: string; timer: RecipeTimer | null };
type RecipeImage = {
  url: string;
  description_url: string;
  creator: string;
  license: string;
  source: "Wikimedia Commons";
};
type MealPlan = {
  title: string;
  image_query: string;
  summary: string;
  minutes: number;
  servings: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  ingredients: Ingredient[];
  steps: RecipeStep[];
  substitutions: Substitution[];
  equipment_adaptations: EquipmentAdaptation[];
  reuse_ideas: ReuseIdea[];
  image?: RecipeImage | null;
  fallback?: boolean;
};

const defaultOrigins = [
  "https://chef-jarvis.pages.dev",
  "http://localhost:3000",
  "http://localhost:4173",
  "http://localhost:5173",
];
const allowedOrigins = new Set([
  ...defaultOrigins,
  ...(Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
]);

function corsHeaders(request: Request) {
  const origin = request.headers.get("Origin");
  const allowedOrigin =
    origin && allowedOrigins.has(origin) ? origin : defaultOrigins[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
}

function respond(
  request: Request,
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), ...extraHeaders },
  });
}

function text(value: unknown, name: string, maximum = 240): string {
  if (typeof value !== "string") throw new Error(`${name} must be text`);
  const clean = value.trim();
  if (!clean || clean.length > maximum) throw new Error(`${name} is invalid`);
  return clean;
}

function number(
  value: unknown,
  name: string,
  minimum: number,
  maximum: number,
): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum)
    throw new Error(`${name} is invalid`);
  return Math.round(parsed * 10) / 10;
}

function array<T>(
  value: unknown,
  name: string,
  maximum: number,
  parse: (item: unknown, index: number) => T,
): T[] {
  if (!Array.isArray(value) || value.length > maximum)
    throw new Error(`${name} is invalid`);
  return value.map(parse);
}

function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${name} is invalid`);
  return value as Record<string, unknown>;
}

function enumeration<T extends readonly string[]>(
  value: unknown,
  name: string,
  options: T,
): T[number] {
  if (
    typeof value !== "string" ||
    !(options as readonly string[]).includes(value)
  )
    throw new Error(`${name} is invalid`);
  return value as T[number];
}

function preciseNumber(
  value: unknown,
  name: string,
  minimum: number,
  maximum: number,
) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum)
    throw new Error(`${name} is invalid`);
  return Math.round(parsed * 100) / 100;
}

function specificIngredientName(value: unknown, name: string) {
  const ingredient = text(value, name, 140);
  const lower = ingredient.toLowerCase();
  const genericNames = new Set([
    "chicken",
    "meat",
    "protein",
    "vegetable",
    "vegetables",
    "aromatics",
    "seasoning",
    "seasonings",
    "sauce",
    "oil",
    "ingredient",
    "poultry",
    "雞肉",
    "肉類",
    "蔬菜",
    "調味料",
    "醬料",
    "食材",
  ]);
  if (genericNames.has(lower)) throw new Error(`${name} is too vague`);
  if (/[,/、]|\s(?:and|or)\s/i.test(ingredient))
    throw new Error(`${name} must describe one purchasable item`);
  if (
    /\bchicken\b/i.test(ingredient) &&
    !/\b(breast|thigh|wing|drumstick|whole|ground|tenderloin)\b/i.test(
      ingredient,
    )
  )
    throw new Error(`${name} must identify the chicken cut`);
  return ingredient;
}

function instructionIncludesDuration(
  instruction: string,
  durationSeconds: number,
) {
  const matches = instruction.matchAll(
    /(\d+(?:\.\d+)?)\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?|小時|分鐘|秒鐘?|秒)/gi,
  );
  for (const match of matches) {
    const value = Number(match[1]);
    const unit = match[2].toLowerCase();
    const multiplier = /^(?:hours?|hrs?|小時)$/.test(unit)
      ? 3600
      : /^(?:minutes?|mins?|分鐘)$/.test(unit)
        ? 60
        : 1;
    if (Math.round(value * multiplier) === durationSeconds) return true;
  }
  return false;
}

function recipeStep(value: unknown, index: number): RecipeStep {
  const step = object(value, `steps[${index}]`);
  const instruction = text(
    step.instruction,
    `steps[${index}].instruction`,
    500,
  );
  if (step.timer === null) return { instruction, timer: null };
  const timer = object(step.timer, `steps[${index}].timer`);
  const label = text(timer.label, `steps[${index}].timer.label`, 100);
  if (
    /^(?:read|review|look at|check)\b|^(?:閱讀|朗讀|查看|看|檢查)(?:食譜|菜單|步驟)/i.test(
      label,
    )
  )
    throw new Error(`steps[${index}].timer is not a cooking timer`);
  const durationSeconds = Math.round(
    number(
      timer.duration_seconds,
      `steps[${index}].timer.duration_seconds`,
      30,
      14400,
    ),
  );
  if (!instructionIncludesDuration(instruction, durationSeconds))
    throw new Error(`steps[${index}].timer must match its instruction`);
  return {
    instruction,
    timer: {
      label,
      kind: enumeration(
        timer.kind,
        `steps[${index}].timer.kind`,
        recipeTimerKinds,
      ),
      duration_seconds: durationSeconds,
    },
  };
}

function validatePlan(value: unknown): MealPlan {
  const plan = object(value, "plan");
  if (!Array.isArray(plan.ingredients) || plan.ingredients.length < 2)
    throw new Error("ingredients must contain at least two exact items");
  if (!Array.isArray(plan.substitutions) || plan.substitutions.length < 1)
    throw new Error(
      "substitutions must contain at least one actionable option",
    );
  // This is an abuse guard, not a target. Recipes should use however many
  // steps their requested dishes genuinely require.
  const steps = array(plan.steps, "steps", 40, recipeStep);
  if (!steps.length) throw new Error("steps must contain cooking instructions");
  const ingredients = array(
    plan.ingredients,
    "ingredients",
    60,
    (item, index) => {
      const ingredient = object(item, `ingredients[${index}]`);
      const name = specificIngredientName(
        ingredient.name,
        `ingredients[${index}].name`,
      );
      const suppliedUsdaQuery =
        typeof ingredient.usda_query === "string"
          ? ingredient.usda_query.trim()
          : "";
      return {
        name,
        usda_query: suppliedUsdaQuery
          ? text(suppliedUsdaQuery, `ingredients[${index}].usda_query`, 140)
          : /^[\x00-\x7f]+$/.test(name)
            ? name
            : "",
        quantity: preciseNumber(
          ingredient.quantity,
          `ingredients[${index}].quantity`,
          0.01,
          50000,
        ),
        unit: enumeration(
          ingredient.unit,
          `ingredients[${index}].unit`,
          ingredientUnits,
        ),
        preparation: text(
          ingredient.preparation,
          `ingredients[${index}].preparation`,
          160,
        ),
        category: enumeration(
          ingredient.category,
          `ingredients[${index}].category`,
          ingredientCategories,
        ),
      };
    },
  );
  const substitutions = array(
    plan.substitutions ?? [],
    "substitutions",
    8,
    (item, index) => {
      const swap = object(item, `substitutions[${index}]`);
      const from = text(swap.from, `substitutions[${index}].from`, 160);
      if (
        !ingredients.some(
          (ingredient) =>
            ingredient.name.toLocaleLowerCase() === from.toLocaleLowerCase(),
        )
      ) {
        throw new Error(
          `substitutions[${index}].from must exactly match an ingredient name`,
        );
      }
      const to = specificIngredientName(swap.to, `substitutions[${index}].to`);
      const suppliedUsdaQuery =
        typeof swap.usda_query === "string" ? swap.usda_query.trim() : "";
      return {
        from,
        to,
        usda_query: suppliedUsdaQuery
          ? text(suppliedUsdaQuery, `substitutions[${index}].usda_query`, 140)
          : /^[\x00-\x7f]+$/.test(to)
            ? to
            : "",
        quantity: preciseNumber(
          swap.quantity,
          `substitutions[${index}].quantity`,
          0.01,
          50000,
        ),
        unit: enumeration(
          swap.unit,
          `substitutions[${index}].unit`,
          ingredientUnits,
        ),
        preparation: text(
          swap.preparation,
          `substitutions[${index}].preparation`,
          160,
        ),
        category: enumeration(
          swap.category,
          `substitutions[${index}].category`,
          ingredientCategories,
        ),
        reason: text(swap.reason, `substitutions[${index}].reason`, 300),
      };
    },
  );
  return {
    title: text(plan.title, "title", 120),
    image_query: text(plan.image_query, "image_query", 120),
    summary: text(plan.summary, "summary", 600),
    minutes: number(plan.minutes, "minutes", 1, 480),
    servings: number(plan.servings, "servings", 1, 24),
    kcal: number(plan.kcal, "kcal", 0, 20000),
    protein_g: number(plan.protein_g, "protein_g", 0, 1000),
    carbs_g: number(plan.carbs_g, "carbs_g", 0, 2000),
    fat_g: number(plan.fat_g, "fat_g", 0, 1000),
    ingredients,
    steps,
    substitutions,
    equipment_adaptations: array(
      plan.equipment_adaptations ?? [],
      "equipment_adaptations",
      4,
      (item, index) => {
        const adaptation = object(item, `equipment_adaptations[${index}]`);
        return {
          original: text(adaptation.original, "adaptation.original", 120),
          alternative: text(
            adaptation.alternative,
            "adaptation.alternative",
            120,
          ),
          instructions: text(
            adaptation.instructions,
            "adaptation.instructions",
            400,
          ),
          why: text(adaptation.why, "adaptation.why", 300),
        };
      },
    ),
    reuse_ideas: array(
      plan.reuse_ideas ?? [],
      "reuse_ideas",
      4,
      (item, index) => {
        const idea = object(item, `reuse_ideas[${index}]`);
        return {
          title: text(idea.title, "reuse.title", 120),
          uses: array(idea.uses ?? [], "reuse.uses", 8, (use) =>
            text(use, "reuse.use", 100),
          ),
          why: text(idea.why, "reuse.why", 300),
        };
      },
    ),
  };
}

function fallbackPlan(
  request: string,
  profile: Profile,
  pantry: PantryItem[],
  language: "en" | "zh-TW" = "en",
): MealPlan {
  const restrictions = [
    ...(profile.allergies || []),
    ...(profile.dietary_preferences || []),
  ]
    .join(" ")
    .toLowerCase();
  const isVegan =
    restrictions.includes("vegan") || restrictions.includes("純素");
  const isVegetarian =
    isVegan ||
    restrictions.includes("vegetarian") ||
    restrictions.includes("素食");
  const avoidsSoy =
    restrictions.includes("soy") || restrictions.includes("大豆");
  const wantsKungPao = /宮保雞丁|宫保鸡丁|kung.?pao/i.test(request);
  const wantsFriedRice = /蛋炒飯|蛋炒饭|fried rice/i.test(request);
  const wantsCabbage = /高麗菜|高丽菜|cabbage/i.test(request);
  const requestedDishCount = [
    wantsKungPao,
    wantsFriedRice,
    wantsCabbage,
  ].filter(Boolean).length;
  const fallbackZh: Record<string, string> = {
    "Exact vegetable rice bowl": "精準蔬菜鷹嘴豆飯碗",
    "Boneless skinless chicken breast": "去骨去皮雞胸肉",
    "Extra-firm tofu": "板豆腐",
    "Cauliflower florets": "白花椰菜小朵",
    Cornstarch: "玉米澱粉",
    "Gluten-free tamari": "無麩質日式醬油",
    "Low-sodium soy sauce": "低鈉醬油",
    "Coconut aminos": "椰子胺基調味醬",
    "Rice vinegar": "米醋",
    "Granulated sugar": "砂糖",
    "Toasted sesame oil": "焙煎芝麻油",
    "Neutral cooking oil": "中性食用油",
    "Dried red chilies": "乾紅辣椒",
    "Sichuan peppercorns": "四川花椒",
    "Red bell pepper": "紅甜椒",
    Scallions: "青蔥",
    "Garlic cloves": "蒜瓣",
    "Fresh ginger": "新鮮薑",
    "Roasted pumpkin seeds": "烘烤南瓜子",
    "Roasted peanuts": "烘烤花生",
    Water: "水",
    "Cooked jasmine rice": "煮熟的茉莉香米飯",
    "Large eggs": "大型雞蛋",
    "Canned chickpeas": "罐裝鷹嘴豆",
    "Cooked green lentils": "煮熟綠扁豆",
    "Frozen green peas": "冷凍青豆仁",
    Carrot: "胡蘿蔔",
    "Ground white pepper": "白胡椒粉",
    "Fine salt": "細鹽",
    "Long-grain white rice": "長粒白米",
    Zucchini: "櫛瓜",
    "Extra-virgin olive oil": "特級初榨橄欖油",
    "Fresh lemon juice": "新鮮檸檬汁",
    "Ground cumin": "孜然粉",
    "Smoked paprika": "煙燻紅椒粉",
    "Ground black pepper": "黑胡椒粉",
    "Taiwanese cabbage": "高麗菜",
    divided: "分次使用",
    "no preparation": "無需處理",
    "cut into 2 cm cubes": "切成 2 公分丁",
    "pressed and cut into 2 cm cubes": "壓乾後切成 2 公分丁",
    "cut into 3 cm florets": "切成 3 公分小朵",
    "stems removed": "去蒂",
    "lightly crushed": "稍微壓碎",
    "cut into 2 cm pieces": "切成 2 公分塊",
    "cut into 3 cm pieces": "切成 3 公分段",
    "finely chopped": "切末",
    "peeled and finely chopped": "去皮後切末",
    unsalted: "無鹽",
    "room temperature": "室溫",
    "chilled overnight": "冷藏隔夜",
    "pressed and crumbled": "壓乾後捏碎",
    "drained, rinsed, and lightly mashed": "瀝乾、沖洗後稍微壓碎",
    beaten: "打散",
    thawed: "解凍",
    "peeled and cut into 5 mm cubes": "去皮後切成 5 公釐丁",
    "thinly sliced": "切薄片",
    "rinsed until water runs clear": "洗至水清",
    "drained and rinsed": "瀝乾後沖洗",
    "pressed and cut to match the recipe": "壓乾後依食譜切成適當大小",
    "cut to match the recipe": "依食譜切成適當大小",
    "peeled and thinly sliced": "去皮後切薄片",
    "cut into 4 cm pieces": "切成 4 公分片",
  };
  const localized = (value: string) =>
    language === "zh-TW" ? fallbackZh[value] || value : value;
  const exact = (
    name: string,
    quantity: number,
    unit: IngredientUnit,
    preparation: string,
    category: IngredientCategory,
  ): Ingredient => ({
    name: localized(name),
    usda_query: name,
    quantity,
    unit,
    preparation: localized(preparation),
    category,
  });
  let ingredients: Ingredient[] = [];
  const addOrMergeIngredient = (item: Ingredient) => {
    const existing = ingredients.find(
      (ingredient) =>
        ingredient.name.toLocaleLowerCase() === item.name.toLocaleLowerCase() &&
        ingredient.unit === item.unit,
    );
    if (existing) {
      existing.quantity =
        Math.round((existing.quantity + item.quantity) * 100) / 100;
      existing.preparation =
        existing.preparation === item.preparation
          ? existing.preparation
          : localized("divided");
      return;
    }
    ingredients.push(item);
  };
  const untimedStep = (instruction: string): RecipeStep => ({
    instruction,
    timer: null,
  });
  const timedStep = (
    instruction: string,
    label: string,
    kind: RecipeTimerKind,
    durationSeconds: number,
  ): RecipeStep => ({
    instruction,
    timer: { label, kind, duration_seconds: durationSeconds },
  });
  let title = localized("Exact vegetable rice bowl");
  let imageQuery = "vegetable chickpea rice bowl";
  if (wantsKungPao) {
    const mainIngredient = isVegetarian
      ? avoidsSoy
        ? "Cauliflower florets"
        : "Extra-firm tofu"
      : "Boneless skinless chicken breast";
    imageQuery = isVegetarian
      ? avoidsSoy
        ? "Kung Pao cauliflower"
        : "Kung Pao tofu"
      : "Kung Pao chicken";
    title =
      language === "zh-TW"
        ? isVegetarian
          ? avoidsSoy
            ? "宮保花椰菜"
            : "宮保豆腐"
          : "宮保雞丁"
        : imageQuery;
    ingredients = [
      exact(
        mainIngredient,
        400,
        "g",
        mainIngredient === "Extra-firm tofu"
          ? "pressed and cut into 2 cm cubes"
          : mainIngredient === "Cauliflower florets"
            ? "cut into 3 cm florets"
            : "cut into 2 cm cubes",
        mainIngredient === "Cauliflower florets" ? "produce" : "protein",
      ),
      exact("Cornstarch", 2, "tbsp", "divided", "seasoning"),
      exact(
        avoidsSoy
          ? "Coconut aminos"
          : restrictions.includes("gluten")
            ? "Gluten-free tamari"
            : "Low-sodium soy sauce",
        2,
        "tbsp",
        "no preparation",
        "seasoning",
      ),
      exact("Rice vinegar", 1, "tbsp", "no preparation", "seasoning"),
      exact("Granulated sugar", 2, "tsp", "no preparation", "seasoning"),
      exact("Toasted sesame oil", 1, "tsp", "no preparation", "oil"),
      exact("Neutral cooking oil", 2, "tbsp", "divided", "oil"),
      exact("Dried red chilies", 8, "piece", "stems removed", "seasoning"),
      exact("Sichuan peppercorns", 1, "tsp", "lightly crushed", "seasoning"),
      exact("Red bell pepper", 150, "g", "cut into 2 cm pieces", "produce"),
      exact("Scallions", 3, "piece", "cut into 3 cm pieces", "produce"),
      exact("Garlic cloves", 3, "clove", "finely chopped", "produce"),
      exact("Fresh ginger", 15, "g", "peeled and finely chopped", "produce"),
      exact(
        restrictions.includes("nut")
          ? "Roasted pumpkin seeds"
          : "Roasted peanuts",
        60,
        "g",
        "unsalted",
        "other",
      ),
      exact("Water", 60, "ml", "room temperature", "other"),
    ];
  } else if (wantsFriedRice) {
    imageQuery = isVegan
      ? avoidsSoy
        ? "chickpea vegetable fried rice"
        : "tofu vegetable fried rice"
      : "Chinese egg fried rice";
    title =
      language === "zh-TW"
        ? isVegan
          ? avoidsSoy
            ? "鷹嘴豆蔬菜炒飯"
            : "豆腐蔬菜炒飯"
          : "蔬菜蛋炒飯"
        : imageQuery;
    ingredients = [
      exact("Cooked jasmine rice", 500, "g", "chilled overnight", "grain"),
      exact(
        isVegan
          ? avoidsSoy
            ? "Canned chickpeas"
            : "Extra-firm tofu"
          : "Large eggs",
        isVegan ? 200 : 3,
        isVegan ? "g" : "piece",
        isVegan
          ? avoidsSoy
            ? "drained, rinsed, and lightly mashed"
            : "pressed and crumbled"
          : "beaten",
        "protein",
      ),
      exact("Frozen green peas", 100, "g", "thawed", "produce"),
      exact("Carrot", 100, "g", "peeled and cut into 5 mm cubes", "produce"),
      exact("Scallions", 3, "piece", "thinly sliced", "produce"),
      exact("Garlic cloves", 2, "clove", "finely chopped", "produce"),
      exact(
        avoidsSoy
          ? "Coconut aminos"
          : restrictions.includes("gluten")
            ? "Gluten-free tamari"
            : "Low-sodium soy sauce",
        2,
        "tbsp",
        "no preparation",
        "seasoning",
      ),
      exact("Toasted sesame oil", 1, "tsp", "no preparation", "oil"),
      exact("Neutral cooking oil", 1, "tbsp", "no preparation", "oil"),
      exact("Ground white pepper", 0.25, "tsp", "no preparation", "seasoning"),
      exact("Fine salt", 0.5, "tsp", "no preparation", "seasoning"),
    ];
  } else if (wantsCabbage) {
    imageQuery = "Taiwanese stir-fried cabbage";
    title = language === "zh-TW" ? "蒜炒高麗菜" : "Garlic stir-fried cabbage";
    ingredients = [
      exact("Taiwanese cabbage", 500, "g", "cut into 4 cm pieces", "produce"),
      exact("Garlic cloves", 3, "clove", "finely chopped", "produce"),
      exact("Neutral cooking oil", 1, "tbsp", "no preparation", "oil"),
      exact("Fine salt", 0.5, "tsp", "no preparation", "seasoning"),
      exact("Water", 2, "tbsp", "no preparation", "other"),
    ];
  } else {
    ingredients = [
      exact(
        "Long-grain white rice",
        180,
        "g",
        "rinsed until water runs clear",
        "grain",
      ),
      exact("Water", 360, "ml", "no preparation", "other"),
      exact("Canned chickpeas", 240, "g", "drained and rinsed", "protein"),
      exact("Zucchini", 200, "g", "cut into 2 cm pieces", "produce"),
      exact("Red bell pepper", 150, "g", "cut into 2 cm pieces", "produce"),
      exact("Carrot", 120, "g", "peeled and thinly sliced", "produce"),
      exact("Garlic cloves", 2, "clove", "finely chopped", "produce"),
      exact("Extra-virgin olive oil", 2, "tbsp", "divided", "oil"),
      exact("Fresh lemon juice", 2, "tbsp", "no preparation", "seasoning"),
      exact("Ground cumin", 1, "tsp", "no preparation", "seasoning"),
      exact("Smoked paprika", 1, "tsp", "no preparation", "seasoning"),
      exact("Fine salt", 1, "tsp", "divided", "seasoning"),
      exact("Ground black pepper", 0.5, "tsp", "no preparation", "seasoning"),
    ];
  }
  const primaryTitle = title;
  const primaryImageQuery = imageQuery;
  const friedRiceTitle =
    language === "zh-TW"
      ? isVegan
        ? avoidsSoy
          ? "鷹嘴豆蔬菜炒飯"
          : "豆腐蔬菜炒飯"
        : "蔬菜蛋炒飯"
      : isVegan
        ? avoidsSoy
          ? "Chickpea vegetable fried rice"
          : "Tofu vegetable fried rice"
        : "Chinese egg fried rice";
  const friedRiceImageQuery = isVegan
    ? avoidsSoy
      ? "chickpea vegetable fried rice"
      : "tofu vegetable fried rice"
    : "Chinese egg fried rice";
  const cabbageTitle =
    language === "zh-TW" ? "蒜炒高麗菜" : "Garlic stir-fried cabbage";

  if (wantsFriedRice && !/fried rice/i.test(primaryImageQuery)) {
    addOrMergeIngredient(
      exact("Cooked jasmine rice", 500, "g", "chilled overnight", "grain"),
    );
    addOrMergeIngredient(
      exact(
        isVegan
          ? avoidsSoy
            ? "Canned chickpeas"
            : "Extra-firm tofu"
          : "Large eggs",
        isVegan ? 200 : 3,
        isVegan ? "g" : "piece",
        isVegan
          ? avoidsSoy
            ? "drained, rinsed, and lightly mashed"
            : "pressed and crumbled"
          : "beaten",
        "protein",
      ),
    );
    addOrMergeIngredient(
      exact("Frozen green peas", 100, "g", "thawed", "produce"),
    );
    addOrMergeIngredient(
      exact("Carrot", 100, "g", "peeled and cut into 5 mm cubes", "produce"),
    );
    addOrMergeIngredient(
      exact("Scallions", 3, "piece", "thinly sliced", "produce"),
    );
    addOrMergeIngredient(
      exact("Garlic cloves", 2, "clove", "finely chopped", "produce"),
    );
    addOrMergeIngredient(
      exact(
        avoidsSoy
          ? "Coconut aminos"
          : restrictions.includes("gluten")
            ? "Gluten-free tamari"
            : "Low-sodium soy sauce",
        2,
        "tbsp",
        "no preparation",
        "seasoning",
      ),
    );
    addOrMergeIngredient(
      exact("Toasted sesame oil", 1, "tsp", "no preparation", "oil"),
    );
    addOrMergeIngredient(
      exact("Neutral cooking oil", 1, "tbsp", "no preparation", "oil"),
    );
    addOrMergeIngredient(
      exact("Ground white pepper", 0.25, "tsp", "no preparation", "seasoning"),
    );
    addOrMergeIngredient(
      exact("Fine salt", 0.5, "tsp", "no preparation", "seasoning"),
    );
  }
  if (wantsCabbage && !/cabbage/i.test(primaryImageQuery)) {
    addOrMergeIngredient(
      exact("Taiwanese cabbage", 500, "g", "cut into 4 cm pieces", "produce"),
    );
    addOrMergeIngredient(
      exact("Garlic cloves", 3, "clove", "finely chopped", "produce"),
    );
    addOrMergeIngredient(
      exact("Neutral cooking oil", 1, "tbsp", "no preparation", "oil"),
    );
    addOrMergeIngredient(
      exact("Fine salt", 0.5, "tsp", "no preparation", "seasoning"),
    );
    addOrMergeIngredient(exact("Water", 2, "tbsp", "no preparation", "other"));
  }

  let fallbackSteps: RecipeStep[] = /kung pao/i.test(primaryImageQuery)
    ? language === "zh-TW"
      ? [
          untimedStep(
            "將醬油、米醋、砂糖、芝麻油、水與 1 湯匙玉米澱粉攪拌均勻。",
          ),
          untimedStep(
            "將切好的主食材與剩餘 1 湯匙玉米澱粉拌勻，所有配料放在爐邊備用。",
          ),
          timedStep(
            "中大火預熱炒鍋 2 分鐘，再加入 1 湯匙中性食用油。",
            "預熱炒鍋",
            "preheat",
            120,
          ),
          timedStep(
            "將主食材鋪成單層，持續翻炒 5 分鐘；雞肉版本中心溫度須達 74°C。",
            "炒熟主食材",
            "cook",
            300,
          ),
          timedStep(
            "盛出主食材，加入剩餘食用油、乾辣椒與花椒，爆香 45 秒。",
            "爆香辣椒與花椒",
            "cook",
            45,
          ),
          timedStep(
            "加入甜椒、青蔥、蒜末與薑末，再倒回主食材及醬汁，翻炒收汁 2 分鐘。",
            "宮保醬汁收汁",
            "simmer",
            120,
          ),
        ]
      : [
          untimedStep(
            "Whisk the soy sauce, rice vinegar, sugar, sesame oil, water, and 1 tbsp cornstarch until smooth.",
          ),
          untimedStep(
            "Coat the prepared main ingredient with the remaining 1 tbsp cornstarch and place every component beside the stove.",
          ),
          timedStep(
            "Preheat a wok over medium-high heat for 2 minutes, then add 1 tbsp neutral cooking oil.",
            "Preheat the wok",
            "preheat",
            120,
          ),
          timedStep(
            "Spread the main ingredient in one layer and stir-fry for 5 minutes; for chicken, verify a 74°C center temperature.",
            "Cook the main ingredient",
            "cook",
            300,
          ),
          timedStep(
            "Transfer it out, add the remaining oil, dried chilies, and Sichuan peppercorns, then cook for 45 seconds.",
            "Bloom chilies and peppercorns",
            "cook",
            45,
          ),
          timedStep(
            "Add bell pepper, scallions, garlic, and ginger; return the main ingredient, add sauce, and stir until thickened for 2 minutes.",
            "Thicken the Kung Pao sauce",
            "simmer",
            120,
          ),
        ]
    : /fried rice/i.test(primaryImageQuery)
      ? language === "zh-TW"
        ? [
            untimedStep("將冷藏米飯撥散；醬油、芝麻油與白胡椒先混合備用。"),
            timedStep(
              "中大火預熱炒鍋 2 分鐘，再加入一半中性食用油。",
              "預熱炒鍋",
              "preheat",
              120,
            ),
            timedStep(
              "加入打散雞蛋或準備好的植物性蛋白質，快速翻炒 90 秒後盛出。",
              "炒熟蛋白質",
              "cook",
              90,
            ),
            timedStep(
              "加入剩餘食用油、胡蘿蔔、青豆與蒜末，翻炒 3 分鐘。",
              "炒香蔬菜",
              "cook",
              180,
            ),
            timedStep(
              "加入米飯與調味汁，以中大火持續翻炒 4 分鐘，再拌回蛋白質與青蔥。",
              "炒乾米飯",
              "cook",
              240,
            ),
            untimedStep("試味後以細鹽調整，立即盛盤。"),
          ]
        : [
            untimedStep(
              "Break apart the chilled rice and combine the soy sauce, sesame oil, and white pepper.",
            ),
            timedStep(
              "Preheat a wok over medium-high heat for 2 minutes, then add half of the neutral oil.",
              "Preheat the wok",
              "preheat",
              120,
            ),
            timedStep(
              "Add the beaten eggs or prepared plant protein, stir quickly for 90 seconds, then transfer out.",
              "Cook the protein",
              "cook",
              90,
            ),
            timedStep(
              "Add the remaining oil, carrot, peas, and garlic, then stir-fry for 3 minutes.",
              "Cook the vegetables",
              "cook",
              180,
            ),
            timedStep(
              "Add rice and seasoning sauce, stir-fry over medium-high heat for 4 minutes, then fold in the protein and scallions.",
              "Fry the rice",
              "cook",
              240,
            ),
            untimedStep(
              "Taste, adjust with the measured salt, and serve immediately.",
            ),
          ]
      : /cabbage/i.test(primaryImageQuery)
        ? language === "zh-TW"
          ? [
              untimedStep(
                "將高麗菜切成 4 公分片、蒜瓣切末，並量好食用油、鹽和水。",
              ),
              timedStep(
                "中大火預熱炒鍋 2 分鐘，再加入中性食用油。",
                "預熱炒鍋",
                "preheat",
                120,
              ),
              timedStep(
                "加入蒜末爆香 30 秒，聞到香氣但不要燒焦。",
                "爆香蒜末",
                "cook",
                30,
              ),
              timedStep(
                "加入高麗菜，以中大火持續翻炒 4 分鐘。",
                "翻炒高麗菜",
                "cook",
                240,
              ),
              timedStep(
                "加入 2 湯匙水並蓋鍋蒸煮 2 分鐘，再以細鹽調味。",
                "蒸熟高麗菜",
                "steam",
                120,
              ),
              untimedStep("確認高麗菜熟而仍爽脆後立即盛盤。"),
            ]
          : [
              untimedStep(
                "Cut the cabbage into 4 cm pieces, mince the garlic, and measure the oil, salt, and water.",
              ),
              timedStep(
                "Preheat a wok over medium-high heat for 2 minutes, then add the neutral cooking oil.",
                "Preheat the wok",
                "preheat",
                120,
              ),
              timedStep(
                "Add the minced garlic and cook for 30 seconds until fragrant without browning.",
                "Bloom the garlic",
                "cook",
                30,
              ),
              timedStep(
                "Add the cabbage and stir-fry continuously over medium-high heat for 4 minutes.",
                "Stir-fry the cabbage",
                "cook",
                240,
              ),
              timedStep(
                "Add 2 tbsp water, cover, and steam for 2 minutes, then season with the measured salt.",
                "Steam the cabbage",
                "steam",
                120,
              ),
              untimedStep(
                "Check that the cabbage is tender-crisp and serve immediately.",
              ),
            ]
        : language === "zh-TW"
          ? [
              timedStep(
                "將 180 克長粒白米與 360 毫升水煮滾，轉小火加蓋燜煮 15 分鐘。",
                "燜煮白飯",
                "simmer",
                900,
              ),
              untimedStep("白飯烹煮時，依食材表切好櫛瓜、甜椒、胡蘿蔔與蒜末。"),
              timedStep(
                "中火預熱平底鍋 2 分鐘，再加入 1 湯匙橄欖油。",
                "預熱平底鍋",
                "preheat",
                120,
              ),
              timedStep(
                "加入櫛瓜、甜椒與胡蘿蔔，翻炒 8 分鐘至邊緣上色。",
                "炒熟蔬菜",
                "cook",
                480,
              ),
              timedStep(
                "加入鷹嘴豆、蒜末、孜然、煙燻紅椒粉與剩餘橄欖油，翻炒 5 分鐘。",
                "加熱鷹嘴豆",
                "cook",
                300,
              ),
              untimedStep("以檸檬汁、鹽與黑胡椒調味，鋪在白飯上享用。"),
            ]
          : [
              timedStep(
                "Bring 180 g long-grain rice and 360 ml water to a boil, cover, reduce to low heat, and simmer for 15 minutes.",
                "Simmer the rice",
                "simmer",
                900,
              ),
              untimedStep(
                "While the rice cooks, cut the zucchini, bell pepper, carrot, and garlic as listed.",
              ),
              timedStep(
                "Preheat a skillet over medium heat for 2 minutes, then add 1 tbsp olive oil.",
                "Preheat the skillet",
                "preheat",
                120,
              ),
              timedStep(
                "Add zucchini, bell pepper, and carrot, then cook for 8 minutes until the edges color.",
                "Cook the vegetables",
                "cook",
                480,
              ),
              timedStep(
                "Add chickpeas, garlic, cumin, smoked paprika, and the remaining oil, then cook for 5 minutes.",
                "Warm the chickpeas",
                "cook",
                300,
              ),
              untimedStep(
                "Season with lemon juice, salt, and black pepper, then serve over the rice.",
              ),
            ];

  if (requestedDishCount > 1) {
    const markDish = (dish: string, steps: RecipeStep[]) =>
      steps.map((step) => ({
        ...step,
        instruction: `【${dish}】${step.instruction}`,
      }));
    fallbackSteps = markDish(primaryTitle, fallbackSteps);

    if (wantsFriedRice && !/fried rice/i.test(primaryImageQuery)) {
      const friedRiceSteps =
        language === "zh-TW"
          ? [
              untimedStep("將冷藏米飯撥散；醬油、芝麻油與白胡椒先混合備用。"),
              timedStep(
                "中大火預熱炒鍋 2 分鐘，再加入一半中性食用油。",
                "預熱炒飯用炒鍋",
                "preheat",
                120,
              ),
              timedStep(
                "加入打散雞蛋或準備好的植物性蛋白質，快速翻炒 90 秒後盛出。",
                "炒熟炒飯蛋白質",
                "cook",
                90,
              ),
              timedStep(
                "加入剩餘食用油、胡蘿蔔、青豆與蒜末，翻炒 3 分鐘。",
                "炒香炒飯蔬菜",
                "cook",
                180,
              ),
              timedStep(
                "加入米飯與調味汁，以中大火持續翻炒 4 分鐘，再拌回蛋白質與青蔥。",
                "炒乾米飯",
                "cook",
                240,
              ),
              untimedStep("試味後以細鹽調整，立即盛盤。"),
            ]
          : [
              untimedStep(
                "Break apart the chilled rice and combine the soy sauce, sesame oil, and white pepper.",
              ),
              timedStep(
                "Preheat a wok over medium-high heat for 2 minutes, then add half of the neutral oil.",
                "Preheat the fried-rice wok",
                "preheat",
                120,
              ),
              timedStep(
                "Add the beaten eggs or prepared plant protein, stir quickly for 90 seconds, then transfer out.",
                "Cook the fried-rice protein",
                "cook",
                90,
              ),
              timedStep(
                "Add the remaining oil, carrot, peas, and garlic, then stir-fry for 3 minutes.",
                "Cook the fried-rice vegetables",
                "cook",
                180,
              ),
              timedStep(
                "Add rice and seasoning sauce, stir-fry over medium-high heat for 4 minutes, then fold in the protein and scallions.",
                "Fry the rice",
                "cook",
                240,
              ),
              untimedStep(
                "Taste, adjust with the measured salt, and serve immediately.",
              ),
            ];
      fallbackSteps.push(...markDish(friedRiceTitle, friedRiceSteps));
    }

    if (wantsCabbage && !/cabbage/i.test(primaryImageQuery)) {
      const cabbageSteps =
        language === "zh-TW"
          ? [
              untimedStep(
                "將高麗菜切成 4 公分片、蒜瓣切末，並量好食用油、鹽和水。",
              ),
              timedStep(
                "中大火預熱炒鍋 2 分鐘，再加入中性食用油。",
                "預熱高麗菜用炒鍋",
                "preheat",
                120,
              ),
              timedStep(
                "加入蒜末爆香 30 秒，聞到香氣但不要燒焦。",
                "爆香高麗菜蒜末",
                "cook",
                30,
              ),
              timedStep(
                "加入高麗菜，以中大火持續翻炒 4 分鐘。",
                "翻炒高麗菜",
                "cook",
                240,
              ),
              timedStep(
                "加入 2 湯匙水並蓋鍋蒸煮 2 分鐘，再以細鹽調味。",
                "蒸熟高麗菜",
                "steam",
                120,
              ),
              untimedStep("確認高麗菜熟而仍爽脆後立即盛盤。"),
            ]
          : [
              untimedStep(
                "Cut the cabbage into 4 cm pieces, mince the garlic, and measure the oil, salt, and water.",
              ),
              timedStep(
                "Preheat a wok over medium-high heat for 2 minutes, then add the neutral cooking oil.",
                "Preheat the cabbage wok",
                "preheat",
                120,
              ),
              timedStep(
                "Add the minced garlic and cook for 30 seconds until fragrant without browning.",
                "Bloom the cabbage garlic",
                "cook",
                30,
              ),
              timedStep(
                "Add the cabbage and stir-fry continuously over medium-high heat for 4 minutes.",
                "Stir-fry the cabbage",
                "cook",
                240,
              ),
              timedStep(
                "Add 2 tbsp water, cover, and steam for 2 minutes, then season with the measured salt.",
                "Steam the cabbage",
                "steam",
                120,
              ),
              untimedStep(
                "Check that the cabbage is tender-crisp and serve immediately.",
              ),
            ];
      fallbackSteps.push(...markDish(cabbageTitle, cabbageSteps));
    }

    const dishTitles = [
      wantsKungPao ? primaryTitle : "",
      wantsFriedRice ? friedRiceTitle : "",
      wantsCabbage ? cabbageTitle : "",
    ].filter(Boolean);
    const dishQueries = [
      wantsKungPao ? primaryImageQuery : "",
      wantsFriedRice ? friedRiceImageQuery : "",
      wantsCabbage ? "Taiwanese stir-fried cabbage" : "",
    ].filter(Boolean);
    title = dishTitles.join(language === "zh-TW" ? "＋" : " + ");
    imageQuery = dishQueries.join(" with ");
  }
  const originalProtein = ingredients.find(
    (ingredient) => ingredient.category === "protein",
  );
  const substitutions: Substitution[] = [];
  if (originalProtein) {
    const usePlantReplacement = !/tofu|chickpea|豆腐|鷹嘴豆|鹰嘴豆/i.test(
      originalProtein.name,
    );
    const replacementName = usePlantReplacement
      ? avoidsSoy
        ? "Canned chickpeas"
        : "Extra-firm tofu"
      : isVegetarian
        ? avoidsSoy
          ? "Cooked green lentils"
          : "Extra-firm tofu"
        : "Boneless skinless chicken breast";
    const localizedReplacementName = localized(replacementName);
    if (localizedReplacementName !== originalProtein.name) {
      substitutions.push({
        from: originalProtein.name,
        to: localizedReplacementName,
        usda_query: replacementName,
        quantity:
          originalProtein.unit === "piece" ? 200 : originalProtein.quantity,
        unit: originalProtein.unit === "piece" ? "g" : originalProtein.unit,
        preparation: localized(
          replacementName === "Extra-firm tofu"
            ? "pressed and cut to match the recipe"
            : replacementName === "Canned chickpeas"
              ? "drained and rinsed"
              : "cut to match the recipe",
        ),
        category: "protein",
        reason:
          language === "zh-TW"
            ? "提供另一種可直接套用的蛋白質選擇，份量與單位已同步調整。"
            : "Offers an actionable protein alternative with its quantity and unit already adjusted.",
      });
    }
  }
  return {
    title,
    image_query: imageQuery,
    summary: pantry.length
      ? language === "zh-TW"
        ? "AI 暫時無法使用，因此 Jarvis 準備了一份份量完整的備用餐點；你的庫存仍會保留供下次規劃使用。"
        : "AI is briefly unavailable, so Jarvis prepared a fully measured fallback meal. Your pantry remains saved for the next generated plan."
      : language === "zh-TW"
        ? "AI 暫時無法使用，因此 Jarvis 準備了一份份量完整、所有食材分開列出的備用餐點。"
        : "AI is briefly unavailable, so Jarvis prepared a fully measured fallback meal with every grocery item listed separately.",
    minutes: Math.min(120, Math.max(20, 15 + fallbackSteps.length * 3)),
    servings: 2,
    kcal: Math.max(350, Math.round((profile.calorie_target || 1800) / 3)),
    protein_g: Math.max(30, Math.round((profile.protein_g || 120) / 3)),
    carbs_g: Math.max(0, Math.round((profile.carbs_g || 180) / 3)),
    fat_g: Math.max(0, Math.round((profile.fat_g || 60) / 3)),
    ingredients,
    steps: fallbackSteps,
    substitutions,
    equipment_adaptations: [],
    reuse_ideas: [],
    fallback: true,
  };
}

function textFromGemini(payload: Record<string, unknown>) {
  const candidates = payload?.candidates as
    Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined;
  return (
    candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") ||
    ""
  );
}

function parsePlan(rawText: string) {
  const clean = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  const parsed = JSON.parse(
    start >= 0 && end > start ? clean.slice(start, end + 1) : clean,
  );
  return validatePlan(parsed);
}

function plainMetadata(value: unknown) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

async function findRecipeImage(query: string): Promise<RecipeImage | null> {
  try {
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      generator: "search",
      gsrsearch: `${query} dish food`,
      gsrnamespace: "6",
      gsrlimit: "6",
      prop: "imageinfo",
      iiprop: "url|mime|extmetadata",
      iiurlwidth: "1200",
      origin: "*",
    });
    const response = await fetch(
      `https://commons.wikimedia.org/w/api.php?${params}`,
      {
        headers: { "Api-User-Agent": "ChefJarvis/1.0" },
        signal: AbortSignal.timeout(3500),
      },
    );
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      query?: {
        pages?: Record<
          string,
          {
            index?: number;
            title?: string;
            imageinfo?: Array<{
              thumburl?: string;
              url?: string;
              descriptionurl?: string;
              mime?: string;
              extmetadata?: Record<string, { value?: string }>;
            }>;
          }
        >;
      };
    };
    const images = Object.values(payload.query?.pages || {})
      .map((page) => ({
        ...page.imageinfo?.[0],
        searchIndex: page.index ?? Number.MAX_SAFE_INTEGER,
        title: page.title || "",
      }))
      .filter(
        (image) =>
          image?.thumburl &&
          image?.descriptionurl &&
          /^image\/(?:jpeg|png|webp)$/i.test(image.mime || ""),
      )
      .sort((left, right) => left.searchIndex - right.searchIndex);
    const image = images[0];
    if (!image?.thumburl || !image.descriptionurl) return null;
    const metadata = image.extmetadata || {};
    return {
      url: image.thumburl,
      description_url: image.descriptionurl,
      creator: plainMetadata(
        metadata.Artist?.value ||
          metadata.Credit?.value ||
          "Commons contributor",
      ),
      license: plainMetadata(metadata.LicenseShortName?.value || "See source"),
      source: "Wikimedia Commons",
    };
  } catch {
    return null;
  }
}

async function addRecipeImage(plan: MealPlan): Promise<MealPlan> {
  return {
    ...plan,
    image: await findRecipeImage(plan.image_query || plan.title),
  };
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") {
    if (origin && !allowedOrigins.has(origin))
      return new Response(null, { status: 403 });
    return new Response("ok", { headers: corsHeaders(request) });
  }
  if (request.method !== "POST")
    return respond(request, { error: "Method not allowed." }, 405);
  if (origin && !allowedOrigins.has(origin))
    return respond(request, { error: "Origin not allowed." }, 403);

  let language: "en" | "zh-TW" = "en";
  let admin: ReturnType<typeof createClient> | null = null;
  let quotaRequestId: string | null = null;
  let quotaUserId: string | null = null;
  try {
    const body = (await request.json().catch(() => ({}))) as {
      request?: unknown;
      language?: unknown;
    };
    language = body.language === "zh-TW" ? "zh-TW" : "en";
    const meal = typeof body.request === "string" ? body.request.trim() : "";
    const authorization = request.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer "))
      return respond(
        request,
        {
          error: language === "zh-TW" ? "請先登入。" : "Please sign in first.",
        },
        401,
      );
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceRoleKey)
      return respond(
        request,
        {
          error:
            language === "zh-TW"
              ? "Chef Jarvis 目前設定不完整。"
              : "Chef Jarvis is not configured correctly.",
        },
        503,
      );

    const token = authorization.slice(7);
    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
    });
    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser(token);
    if (authError || !user)
      return respond(
        request,
        {
          error:
            language === "zh-TW"
              ? "登入工作階段已過期，請重新登入。"
              : "Your sign-in session has expired. Please sign in again.",
        },
        401,
      );

    admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    if (!meal || meal.length > 500)
      return respond(
        request,
        {
          error:
            language === "zh-TW"
              ? "請告訴 Jarvis 你想做什麼料理（最多 500 個字元）。"
              : "Tell Jarvis what you would like to cook (up to 500 characters).",
        },
        400,
      );

    const draftCutoff = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const [
      { data: profileRow },
      { data: pantryRows },
      { data: feedbackRows },
      { error: draftCleanupError },
    ] = await Promise.all([
      admin
        .from("app_profiles")
        .select(
          "calorie_target,protein_g,carbs_g,fat_g,body_composition_goal,dietary_preferences,allergies,dislikes,equipment",
        )
        .eq("app_user_id", user.id)
        .maybeSingle(),
      admin
        .from("pantry_items")
        .select("name,quantity,unit,expires_on")
        .eq("user_id", user.id)
        .order("expires_on", { ascending: true, nullsFirst: false })
        .limit(40),
      admin
        .from("recipe_feedback")
        .select("recipe_title,rating,note,created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10),
      admin
        .from("recipes")
        .delete()
        .eq("user_id", user.id)
        .eq("is_saved", false)
        .lt("created_at", draftCutoff),
    ]);
    if (draftCleanupError)
      console.warn("draft cleanup failed", draftCleanupError.message);
    const profile = (profileRow || {}) as Profile;
    const planningProfile = {
      ...profile,
      taste_feedback: (feedbackRows || []).map((item) => ({
        recipe_title: String(item.recipe_title || "").slice(0, 160),
        rating: Number(item.rating),
        note: item.note ? String(item.note).slice(0, 300) : null,
      })),
    };
    const pantry = (pantryRows || [])
      .map((item) => ({
        name: String(item.name || "").slice(0, 120),
        quantity: typeof item.quantity === "number" ? item.quantity : null,
        unit: item.unit ? String(item.unit).slice(0, 40) : null,
        expires_on: item.expires_on ? String(item.expires_on) : null,
      }))
      .filter((item) => item.name) as PantryItem[];

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey)
      return respond(request, {
        plan: await addRecipeImage(
          fallbackPlan(meal, profile, pantry, language),
        ),
        fallback: true,
        notice: "Gemini is not configured yet.",
      });
    quotaRequestId = crypto.randomUUID();
    quotaUserId = user.id;
    const { data: quota, error: quotaError } = await admin.rpc(
      "consume_chef_meal_plan_quota",
      { p_user_id: user.id, p_request_id: quotaRequestId },
    );
    if (quotaError) {
      console.error("quota error", quotaError.message);
      return respond(
        request,
        {
          error:
            language === "zh-TW"
              ? "餐點規劃配額服務暫時無法使用。"
              : "Meal planning quota is temporarily unavailable.",
        },
        503,
      );
    }
    const allowance = Array.isArray(quota) ? quota[0] : quota;
    if (!allowance?.allowed) {
      const retryAfter = String(allowance?.retry_after_seconds || 60);
      return respond(
        request,
        {
          error:
            allowance?.reason === "daily_limit"
              ? language === "zh-TW"
                ? "你今天的餐點規劃額度已用完，請稍後再試。"
                : "You reached today’s meal-plan limit. Try again later."
              : language === "zh-TW"
                ? "短時間內產生太多餐點，請等一分鐘後再試。"
                : "Too many meal plans at once. Wait a minute and try again.",
        },
        429,
        { "Retry-After": retryAfter },
      );
    }
    const prompt = `You are Chef Jarvis. Create one realistic, concise meal plan in ${language === "zh-TW" ? "Traditional Chinese" : "English"}. Respect every allergy, dislike and dietary preference; never recommend an allergen. Prefer pantry items when they fit, explicitly avoiding items that conflict with restrictions. Only suggest equipment alternatives using available equipment. image_query must be a concise English name of the exact finished dish suitable for image search.

Ingredient accuracy is mandatory:
- List every ingredient separately, including cooking oil, water, salt, spices, sauces and garnishes.
- Each name must identify one purchasable product and its exact form or cut, such as "boneless skinless chicken breast" or "low-sodium soy sauce". Never use generic names such as chicken, meat, protein, vegetables, seasonings or sauce.
- usda_query must always give the same ingredient's specific English USDA search name, even when name and the rest of the recipe are in Traditional Chinese.
- Never combine products in one entry with commas, slashes, "and" or "or".
- quantity must be one exact positive number. Never use ranges, "to taste", "as needed", "some", "a little", portions or package-dependent amounts.
- unit must be exactly one of: g, kg, ml, L, tsp, tbsp, cup, piece, clove, slice, can, pack.
- preparation must state the cut/prep precisely, or "no preparation" when none is needed.
- category must be exactly one of: protein, produce, grain, dairy, seasoning, oil, other.
- Quantities must match the stated servings, and every ingredient named in a cooking step must appear in the ingredient list.

Ingredient substitution accuracy is mandatory:
- Provide at least one directly usable substitution for this recipe.
- Every substitution.from must exactly equal one ingredients[].name. Never use a category or a vague phrase as the source.
- substitution.to must name one specific purchasable replacement, never multiple alternatives joined with "or".
- substitution.usda_query must give that replacement's specific English USDA search name.
- Every replacement must include its own exact quantity, unit, preparation and category. Do not assume the original ingredient's measurement is valid for the replacement.
- Substitutions are decisions made before the grocery list, so each option must be directly usable as the final ingredient entry.

Cooking-step timer accuracy is mandatory:
- Cover every distinct dish explicitly requested by the user. Never collapse several requested dishes into one generic recipe.
- Use exactly as many steps as the requested dishes genuinely need. There is no preferred or fixed step count: do not stop at six or eight, and never pad a simple dish to reach a target.
- When the request contains multiple dishes, name the relevant dish or component in every instruction and include the complete preparation and cooking flow for each dish.
- Split materially different actions into separate steps. A step must remain clear enough for the cook to perform without guessing which dish it belongs to.
- Every steps item must contain one instruction and either one genuinely useful cooking timer or null.
- Set timer to null for reading the recipe, gathering or measuring ingredients, chopping, plating, serving, tasting, cleaning, or any other task that does not require a clock.
- Add a timer only when the cook must track a real heat or waiting interval: preheating, cooking, baking, simmering, boiling, steaming, resting, marinating, chilling, proofing, or cooling.
- The instruction must state the same exact duration as timer.duration_seconds. Never invent a default duration and never add a timer merely so every step has one.
- If a procedure needs two different clocks, split it into two separate steps so every timer has one unambiguous instruction.
- timer.kind must be exactly one of: preheat, cook, bake, simmer, boil, steam, rest, marinate, chill, proof, cool.
- timer.label must name the actual timed cooking action, never "read recipe", "review menu", or similar busywork.

Taste memory is part of the verified profile. Use repeated high ratings and notes as soft preferences, but never let taste feedback override allergies, dislikes, dietary restrictions, or nutrition targets.

Return ONLY valid JSON with exactly: {"title":"string","image_query":"exact finished dish name in English","summary":"string","minutes":number,"servings":number,"kcal":number,"protein_g":number,"carbs_g":number,"fat_g":number,"ingredients":[{"name":"string","usda_query":"specific English USDA search name","quantity":number,"unit":"g|kg|ml|L|tsp|tbsp|cup|piece|clove|slice|can|pack","preparation":"string","category":"protein|produce|grain|dairy|seasoning|oil|other"}],"steps":[{"instruction":"string","timer":null|{"label":"string","kind":"preheat|cook|bake|simmer|boil|steam|rest|marinate|chill|proof|cool","duration_seconds":number}}],"substitutions":[{"from":"exact ingredients[].name","to":"specific replacement ingredient","usda_query":"specific English USDA search name for replacement","quantity":number,"unit":"g|kg|ml|L|tsp|tbsp|cup|piece|clove|slice|can|pack","preparation":"string","category":"protein|produce|grain|dairy|seasoning|oil|other","reason":"string"}],"equipment_adaptations":[{"original":"string","alternative":"string","instructions":"string","why":"string"}],"reuse_ideas":[{"title":"string","uses":["string"],"why":"string"}]}. The maximums below are safety ceilings only, never targets: 60 ingredients, 40 steps, 8 substitutions and 4 reuse ideas. User request: ${meal}. Server-verified profile: ${JSON.stringify(planningProfile)}. Server-verified pantry: ${JSON.stringify(pantry)}`;
    const geminiBody = JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.25,
        responseMimeType: "application/json",
        maxOutputTokens: 6500,
      },
    });

    for (const model of ["gemini-2.5-flash-lite", "gemini-2.5-flash"]) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": apiKey,
            },
            body: geminiBody,
            signal: AbortSignal.timeout(20000),
          },
        );
        if (!response.ok) {
          console.warn("Gemini request failed", model, response.status);
          continue;
        }
        const plan = await addRecipeImage(
          parsePlan(textFromGemini(await response.json())),
        );
        quotaRequestId = null;
        return respond(request, { plan, model });
      } catch (error) {
        console.warn(
          "Gemini attempt failed",
          model,
          error instanceof Error ? error.message : "unknown",
        );
      }
    }
    if (quotaRequestId && quotaUserId) {
      await admin.rpc("refund_chef_meal_plan_quota", {
        p_user_id: quotaUserId,
        p_request_id: quotaRequestId,
      });
      quotaRequestId = null;
    }
    return respond(request, {
      plan: await addRecipeImage(fallbackPlan(meal, profile, pantry, language)),
      fallback: true,
    });
  } catch (error) {
    if (admin && quotaRequestId && quotaUserId) {
      await admin.rpc("refund_chef_meal_plan_quota", {
        p_user_id: quotaUserId,
        p_request_id: quotaRequestId,
      });
    }
    console.error(
      "meal-plan error",
      error instanceof Error ? error.message : "unknown",
    );
    return respond(
      request,
      {
        error:
          language === "zh-TW"
            ? "Jarvis 目前無法產生食譜，請再試一次。"
            : "Jarvis could not create a plan right now. Please try again.",
      },
      500,
    );
  }
});
