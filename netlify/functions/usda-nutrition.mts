import type { Config, Context } from "@netlify/functions";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function value(nutrients: Array<Record<string, unknown>>, names: string[]) {
  const nutrient = nutrients.find((item) => names.includes(String(item.nutrientName)));
  return typeof nutrient?.value === "number" ? Math.round(nutrient.value * 10) / 10 : null;
}

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const key = Netlify.env.get("USDA_FDC_API_KEY");
  if (!key) return json({ error: "USDA nutrition is not configured yet." }, 503);

  const authorization = req.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Please sign in first." }, 401);
  const identity = await fetch("https://mylcykwmwlnjlclodmuo.supabase.co/auth/v1/user", {
    headers: { apikey: "sb_publishable_DCmfrANKHYSrKx18V-fJhg_TEMfoyb1", Authorization: authorization },
  });
  if (!identity.ok) return json({ error: "Your sign-in session has expired. Please sign in again." }, 401);

  let input: { ingredients?: Array<{ name?: string }> };
  try { input = await req.json(); } catch { return json({ error: "Invalid request." }, 400); }
  const ingredients = (input.ingredients || []).map((item) => item.name?.trim()).filter((name): name is string => Boolean(name)).slice(0, 10);
  if (!ingredients.length) return json({ error: "No ingredients were supplied." }, 400);

  const foods = await Promise.all(ingredients.map(async (ingredient) => {
    const response = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: ingredient, pageSize: 1, dataType: ["Foundation", "SR Legacy", "Survey (FNDDS)"] }),
    });
    if (!response.ok) return { ingredient, found: false };
    const payload = await response.json() as { foods?: Array<Record<string, unknown>> };
    const food = payload.foods?.[0];
    if (!food) return { ingredient, found: false };
    const nutrients = (food.foodNutrients as Array<Record<string, unknown>> | undefined) || [];
    return {
      ingredient,
      found: true,
      description: String(food.description || ingredient),
      fdcId: food.fdcId,
      per100g: {
        kcal: value(nutrients, ["Energy"]),
        protein_g: value(nutrients, ["Protein"]),
        carbs_g: value(nutrients, ["Carbohydrate, by difference"]),
        fat_g: value(nutrients, ["Total lipid (fat)"]),
      },
    };
  }));
  return json({ source: "USDA FoodData Central", foods });
};

export const config: Config = { path: "/api/usda-nutrition" };
