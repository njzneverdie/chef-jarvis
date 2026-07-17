import { createClient } from "npm:@supabase/supabase-js@2.110.5";

const defaultOrigins = [
  "https://chef-jarvis.pages.dev",
  "http://localhost:3000",
  "http://localhost:4173",
  "http://localhost:5173",
  "http://127.0.0.1:4173",
];
const allowedOrigins = new Set([
  ...defaultOrigins,
  ...(Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
]);
const corsHeaders = (request: Request) => {
  const origin = request.headers.get("Origin");
  return {
    "Access-Control-Allow-Origin":
      origin && allowedOrigins.has(origin) ? origin : defaultOrigins[0],
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
};
const respond = (
  request: Request,
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), ...extraHeaders },
  });
const value = (nutrients: any[], names: string[]) => {
  const item = nutrients.find((nutrient) =>
    names.includes(String(nutrient.nutrientName)),
  );
  return typeof item?.value === "number"
    ? Math.round(item.value * 10) / 10
    : null;
};
const kcal = (nutrients: any[]) => {
  const item =
    nutrients.find((nutrient) => String(nutrient.nutrientNumber) === "208") ||
    nutrients.find(
      (nutrient) =>
        String(nutrient.nutrientName) === "Energy" &&
        String(nutrient.unitName).toLowerCase() === "kcal",
    );
  return typeof item?.value === "number"
    ? Math.round(item.value * 10) / 10
    : null;
};

const SEARCH_STOP_WORDS = new Set([
  "and",
  "with",
  "without",
  "boneless",
  "skinless",
  "fresh",
  "chopped",
  "diced",
  "minced",
]);
const searchTokens = (value: unknown) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 1 && !SEARCH_STOP_WORDS.has(token));
const matchScore = (query: string, food: any) => {
  const queryTokens = [...new Set(searchTokens(query))];
  const description = String(food?.description || "").toLowerCase();
  const descriptionTokens = new Set(searchTokens(description));
  const overlap = queryTokens.filter((token) => descriptionTokens.has(token));
  const coverage = queryTokens.length ? overlap.length / queryTokens.length : 0;
  const phrase = query.trim().toLowerCase();
  const phraseBonus = phrase && description.includes(phrase) ? 25 : 0;
  const typeBonus = {
    Foundation: 18,
    "SR Legacy": 14,
    "Survey (FNDDS)": 8,
  }[String(food?.dataType || "")] || 0;
  const nutrientCount = [
    kcal(food?.foodNutrients || []),
    value(food?.foodNutrients || [], ["Protein"]),
    value(food?.foodNutrients || [], ["Carbohydrate, by difference"]),
    value(food?.foodNutrients || [], ["Total lipid (fat)"]),
  ].filter((nutrient) => nutrient != null).length;
  const nutrientBonus = nutrientCount * 2;
  const processingPenalty = [
    /\bfried\b/,
    /\blunchmeat\b/,
    /\brotisserie\b/,
    /\bskin eaten\b/,
    /\bsmoked\b/,
    /\bbreaded\b/,
    /\bbattered\b/,
    /\bcanned\b/,
    /\bwith (?:sauce|gravy)\b/,
    /\brestaurant\b/,
    /\bfast food\b/,
  ].reduce(
    (penalty, pattern) =>
      penalty + (pattern.test(description) && !pattern.test(phrase) ? 55 : 0),
    0,
  );
  const rawBonus = /\braw\b/.test(description) ? 18 : 0;
  const protein = value(food?.foodNutrients || [], ["Protein"]);
  const proteinSanityPenalty =
    /\b(?:chicken|beef|pork|turkey|fish|salmon|tuna|tofu|tempeh)\b/.test(
      phrase,
    ) && (protein == null || protein < 5)
      ? 45
      : 0;
  return {
    coverage,
    score: Math.max(
      0,
      Math.min(
        100,
        Math.round(
          coverage * 100 +
            phraseBonus +
            typeBonus +
            nutrientBonus +
            rawBonus -
            processingPenalty -
            proteinSanityPenalty,
        ),
      ),
    ),
  };
};
const bestFoodMatch = (query: string, foods: any[]) => {
  const ranked = (Array.isArray(foods) ? foods : [])
    .map((food) => ({ food, ...matchScore(query, food) }))
    .sort((left, right) => right.score - left.score);
  const best = ranked[0];
  return best && best.coverage >= 0.5 ? best : null;
};

Deno.serve(async (req) => {
  const requestStartedAt = Date.now();
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") {
    if (origin && !allowedOrigins.has(origin))
      return new Response(null, { status: 403 });
    return new Response("ok", { headers: corsHeaders(req) });
  }
  if (req.method !== "POST")
    return respond(req, { error: "Method not allowed." }, 405);
  if (origin && !allowedOrigins.has(origin))
    return respond(req, { error: "Origin not allowed." }, 403);
  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer "))
      return respond(req, { error: "Please sign in first." }, 401);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_ANON_KEY") || "",
      { auth: { persistSession: false } },
    );
    const {
      data: { user },
    } = await supabase.auth.getUser(authorization.slice(7));
    if (!user)
      return respond(
        req,
        { error: "Your sign-in session has expired. Please sign in again." },
        401,
      );
    const body = (await req.json().catch(() => ({}))) as {
      ingredients?: Array<{ name?: string; usda_query?: string }>;
    };
    const ingredients = Array.isArray(body.ingredients) ? body.ingredients : [];
    const searches = ingredients
      .map((item) => ({
        ingredient: (item.name?.trim() || "").slice(0, 140),
        query: (item.usda_query?.trim() || item.name?.trim() || "").slice(
          0,
          140,
        ),
      }))
      .filter((item) => item.ingredient && item.query)
      .slice(0, 30);
    if (!searches.length)
      return respond(req, { error: "No ingredients were supplied." }, 400);
    const key = Deno.env.get("USDA_FDC_API_KEY");
    if (!key)
      return respond(
        req,
        { error: "USDA nutrition is not configured yet." },
        503,
      );
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceRoleKey)
      return respond(
        req,
        { error: "USDA nutrition quota is not configured yet." },
        503,
      );
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      serviceRoleKey,
      { auth: { persistSession: false } },
    );
    const { data: quotaRows, error: quotaError } = await admin.rpc(
      "consume_chef_usda_quota",
      { p_user_id: user.id, p_lookup_count: searches.length },
    );
    const quota = Array.isArray(quotaRows) ? quotaRows[0] : quotaRows;
    if (quotaError || !quota)
      return respond(
        req,
        { error: "USDA nutrition quota is temporarily unavailable." },
        503,
      );
    if (!quota.allowed) {
      const retryAfter = Math.max(
        1,
        Number(quota.retry_after_seconds) || 60,
      );
      return respond(
        req,
        { error: "Too many USDA lookups. Please try again later." },
        429,
        { "Retry-After": String(retryAfter) },
      );
    }
    const foods = await Promise.all(
      searches.map(async ({ ingredient, query }) => {
        try {
          const response = await fetch(
            `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(key)}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                query,
                pageSize: 8,
                dataType: ["Foundation", "SR Legacy", "Survey (FNDDS)"],
              }),
              signal: AbortSignal.timeout(5000),
            },
          );
          if (!response.ok) return { ingredient, found: false };
          const payload = (await response.json()) as any;
          const selected = bestFoodMatch(query, payload.foods || []);
          if (!selected) return { ingredient, found: false };
          const food = selected.food;
          const nutrients = food.foodNutrients || [];
          return {
            ingredient,
            found: true,
            description: String(food.description || ingredient),
            fdcId: food.fdcId,
            data_type: String(food.dataType || ""),
            match_score: selected.score,
            per100g: {
              kcal: kcal(nutrients),
              protein_g: value(nutrients, ["Protein"]),
              carbs_g: value(nutrients, ["Carbohydrate, by difference"]),
              fat_g: value(nutrients, ["Total lipid (fat)"]),
            },
          };
        } catch {
          return { ingredient, found: false };
        }
      }),
    );
    const matched = foods.filter((food) => food.found).length;
    console.log("chef_usda_lookup_completed", {
      requested: searches.length,
      matched,
      duration_ms: Date.now() - requestStartedAt,
    });
    return respond(req, {
      source: "USDA FoodData Central",
      foods,
      meta: {
        requested: searches.length,
        matched,
        duration_ms: Date.now() - requestStartedAt,
      },
    });
  } catch (error) {
    console.error(
      "usda error",
      error instanceof Error ? error.message : "unknown",
    );
    return respond(
      req,
      { error: "USDA lookup is unavailable right now." },
      500,
    );
  }
});
