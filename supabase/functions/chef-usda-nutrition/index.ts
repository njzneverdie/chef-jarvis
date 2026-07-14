import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Content-Type": "application/json", "Cache-Control": "no-store" };
const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: corsHeaders });
const value = (nutrients: any[], names: string[]) => { const item = nutrients.find((nutrient) => names.includes(String(nutrient.nutrientName))); return typeof item?.value === "number" ? Math.round(item.value * 10) / 10 : null; };
const kcal = (nutrients: any[]) => {
  const item = nutrients.find((nutrient) => String(nutrient.nutrientNumber) === "208")
    || nutrients.find((nutrient) => String(nutrient.nutrientName) === "Energy" && String(nutrient.unitName).toLowerCase() === "kcal");
  return typeof item?.value === "number" ? Math.round(item.value * 10) / 10 : null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond({ error: "Method not allowed." }, 405);
  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return respond({ error: "Please sign in first." }, 401);
    const keys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
    const supabase = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get(keys.default) || Deno.env.get("SUPABASE_ANON_KEY") || "", { global: { headers: { Authorization: authorization } } });
    const { data: { user } } = await supabase.auth.getUser(authorization.slice(7));
    if (!user) return respond({ error: "Your sign-in session has expired. Please sign in again." }, 401);
    const { ingredients = [] } = await req.json() as { ingredients?: Array<{ name?: string }> };
    const names = ingredients.map((item) => item.name?.trim()).filter((name): name is string => Boolean(name)).slice(0, 10);
    if (!names.length) return respond({ error: "No ingredients were supplied." }, 400);
    const key = Deno.env.get("USDA_FDC_API_KEY");
    if (!key) return respond({ error: "USDA nutrition is not configured yet." }, 503);
    const foods = await Promise.all(names.map(async (ingredient) => {
      try {
        const response = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(key)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: ingredient, pageSize: 1, dataType: ["Foundation", "SR Legacy", "Survey (FNDDS)"] }), signal: AbortSignal.timeout(5000) });
        if (!response.ok) return { ingredient, found: false };
        const food = (await response.json() as any).foods?.[0];
        if (!food) return { ingredient, found: false };
        const nutrients = food.foodNutrients || [];
        return { ingredient, found: true, description: String(food.description || ingredient), fdcId: food.fdcId, per100g: { kcal: kcal(nutrients), protein_g: value(nutrients, ["Protein"]), carbs_g: value(nutrients, ["Carbohydrate, by difference"]), fat_g: value(nutrients, ["Total lipid (fat)"]) } };
      } catch { return { ingredient, found: false }; }
    }));
    return respond({ source: "USDA FoodData Central", foods });
  } catch (error) { console.error("usda error", error instanceof Error ? error.message : "unknown"); return respond({ error: "USDA lookup is unavailable right now." }, 500); }
});
