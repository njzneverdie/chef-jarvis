import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

type Profile = { calorie_target?: number; protein_g?: number; carbs_g?: number; fat_g?: number; body_composition_goal?: string; dietary_preferences?: string[]; allergies?: string[]; dislikes?: string[]; equipment?: string[] };
const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: corsHeaders });

function fallbackPlan(request: string, profile: Profile) {
  const ingredients: Array<{ name: string; amount: string }> = [];
  if (/宮保雞丁|kung.?pao/i.test(request)) ingredients.push(
    { name: "Boneless chicken thigh or chicken breast", amount: "400 g" }, { name: "Roasted peanuts", amount: "60 g" },
    { name: "Dried chilies", amount: "6–8" }, { name: "Bell pepper", amount: "1" },
    { name: "Garlic and ginger", amount: "3 cloves + 15 g" }, { name: "Soy sauce, vinegar, and a little sugar", amount: "for sauce" },
  );
  if (/蛋炒飯|fried rice/i.test(request)) ingredients.push(
    { name: "Cooked cold rice", amount: "2 cups" }, { name: "Eggs", amount: "3" }, { name: "Cooked protein", amount: "200 g" }, { name: "Scallions", amount: "3" },
  );
  if (!ingredients.length) ingredients.push(
    { name: "Main protein for your requested dish", amount: "2 portions" }, { name: "Fresh vegetables and aromatics", amount: "enough for 2" },
    { name: "Carbohydrate base, if needed", amount: "2 portions" }, { name: "Sauce and seasonings", amount: "to taste" },
  );
  return {
    title: request.slice(0, 90), summary: "Jarvis prepared a dependable guided workflow while AI is briefly unavailable. Verify quantities before cooking.",
    minutes: 35, servings: 2, kcal: Math.max(350, Math.round((profile.calorie_target || 1800) / 3)),
    protein_g: Math.max(30, Math.round((profile.protein_g || 120) / 3)), carbs_g: Math.round((profile.carbs_g || 180) / 3), fat_g: Math.round((profile.fat_g || 60) / 3), ingredients,
    steps: ["Read the recipe and measure every ingredient before applying heat.", "Cut protein and vegetables into even pieces.", "Start the longest task first, such as rice or preheating.", "Cook the protein until safely done and set it aside if needed.", "Cook aromatics and vegetables, add sauce gradually, then combine and taste.", "Plate the meal and refrigerate leftovers promptly."],
    substitutions: [], equipment_adaptations: [], reuse_ideas: [], fallback: true,
  };
}

function textFromGemini(payload: any) { return payload?.candidates?.[0]?.content?.parts?.map((part: any) => part.text || "").join("") || ""; }
function parsePlan(text: string) { const clean = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, ""); const start = clean.indexOf("{"); const end = clean.lastIndexOf("}"); return JSON.parse(start >= 0 && end > start ? clean.slice(start, end + 1) : clean); }

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
    const { request, profile = {} } = await req.json() as { request?: string; profile?: Profile };
    const meal = request?.trim();
    if (!meal || meal.length > 500) return respond({ error: "Tell Jarvis what you would like to cook (up to 500 characters)." }, 400);
    const key = Deno.env.get("GEMINI_API_KEY");
    if (!key) return respond({ plan: fallbackPlan(meal, profile), fallback: true, notice: "Gemini is not configured yet." });
    const prompt = `You are Chef Jarvis. Create one realistic, concise meal plan. Respect every allergy, dislike and dietary preference; never recommend an allergen. Only suggest equipment alternatives using available equipment. Return ONLY valid JSON with exactly: {"title":"string","summary":"string","minutes":number,"servings":number,"kcal":number,"protein_g":number,"carbs_g":number,"fat_g":number,"ingredients":[{"name":"string","amount":"string"}],"steps":["string"],"substitutions":[{"from":"string","to":"string","reason":"string"}],"equipment_adaptations":[{"original":"string","alternative":"string","instructions":"string","why":"string"}],"reuse_ideas":[{"title":"string","uses":["string"],"why":"string"}]}. Limit to 10 ingredients, 6 steps, 3 substitutions and 3 reuse ideas. User request: ${meal}. Profile: ${JSON.stringify(profile)}`;
    const body = JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.25, responseMimeType: "application/json", maxOutputTokens: 2048 } });
    for (const model of ["gemini-2.5-flash-lite", "gemini-2.5-flash"]) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body, signal: AbortSignal.timeout(6500) });
        if (!response.ok) { console.warn("Gemini request failed", model, response.status); continue; }
        return respond({ plan: parsePlan(textFromGemini(await response.json())), model });
      } catch (error) { console.warn("Gemini attempt failed", model, error instanceof Error ? error.name : "unknown"); }
    }
    return respond({ plan: fallbackPlan(meal, profile), fallback: true });
  } catch (error) {
    console.error("meal-plan error", error instanceof Error ? error.message : "unknown");
    return respond({ error: "Jarvis could not create a plan right now. Please try again." }, 500);
  }
});
