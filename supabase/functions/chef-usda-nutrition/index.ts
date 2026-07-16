import { createClient } from "npm:@supabase/supabase-js@2.110.5";

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
const respond = (request: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders(request) });
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

Deno.serve(async (req) => {
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
    const { ingredients = [] } = (await req.json()) as {
      ingredients?: Array<{ name?: string; usda_query?: string }>;
    };
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
                pageSize: 1,
                dataType: ["Foundation", "SR Legacy", "Survey (FNDDS)"],
              }),
              signal: AbortSignal.timeout(5000),
            },
          );
          if (!response.ok) return { ingredient, found: false };
          const food = ((await response.json()) as any).foods?.[0];
          if (!food) return { ingredient, found: false };
          const nutrients = food.foodNutrients || [];
          return {
            ingredient,
            found: true,
            description: String(food.description || ingredient),
            fdcId: food.fdcId,
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
    return respond(req, { source: "USDA FoodData Central", foods });
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
