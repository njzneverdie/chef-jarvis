import type { Config, Context } from "@netlify/functions";

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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function extractText(response: Record<string, unknown>) {
  const candidates = response.candidates as Array<Record<string, unknown>> | undefined;
  const parts = candidates?.[0]?.content as { parts?: Array<{ text?: string }> } | undefined;
  return parts?.parts?.map((part) => part.text || "").join("") || "";
}

function parseJsonPlan(text: string) {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try { return JSON.parse(trimmed); } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("No JSON object in model response");
    return JSON.parse(trimmed.slice(start, end + 1));
  }
}

function stableFallbackPlan(request: string, profile: Profile) {
  const protein = Math.max(30, Math.round((profile.protein_g || 120) / 3));
  const kcal = Math.max(350, Math.round((profile.calorie_target || 1800) / 3));
  const ingredients: Array<{ name: string; amount: string }> = [];
  if (/宮保雞丁|kung.?pao/i.test(request)) ingredients.push(
    { name: "Chicken breast or boneless thigh", amount: "400 g" },
    { name: "Roasted peanuts", amount: "60 g" },
    { name: "Dried chilies", amount: "6–8" },
    { name: "Bell pepper", amount: "1" },
    { name: "Garlic and ginger", amount: "3 cloves + 15 g" },
    { name: "Soy sauce, vinegar, and a little sugar", amount: "for sauce" }
  );
  if (/蛋炒飯|fried rice/i.test(request)) ingredients.push(
    { name: "Cooked cold rice", amount: "2 cups" },
    { name: "Eggs", amount: "3" },
    { name: "Cooked pork or leftover ribs", amount: "200 g" },
    { name: "Scallions", amount: "3" }
  );
  if (/高麗菜|cabbage/i.test(request)) ingredients.push(
    { name: "Napa or green cabbage", amount: "½ head" },
    { name: "Garlic", amount: "2 cloves" }
  );
  if (!ingredients.length) ingredients.push(
    { name: "Main protein for your requested dish", amount: "2 portions" },
    { name: "Fresh vegetables and aromatics", amount: "enough for 2" },
    { name: "Carbohydrate base, if the dish needs one", amount: "2 portions" },
    { name: "Sauce and seasonings named by your recipe", amount: "to taste" }
  );
  return {
    title: request.slice(0, 90),
    summary: "Chef Jarvis created a stable guided cooking workflow while the AI model is busy. Check exact ingredient quantities before cooking.",
    minutes: 35,
    servings: 2,
    kcal,
    protein_g: protein,
    carbs_g: Math.round((profile.carbs_g || 180) / 3),
    fat_g: Math.round((profile.fat_g || 60) / 3),
    ingredients,
    steps: [
      "Read the recipe name and prepare every ingredient on the counter before applying heat.",
      "Cut the protein and vegetables into even pieces so they cook at the same speed.",
      "Start the longest task first, such as rice, pasta water, or oven preheating.",
      "Cook the protein until safely done, then set it aside briefly if the recipe needs a sauce or stir-fry.",
      "Cook vegetables and aromatics, add the sauce gradually, then combine everything and taste before serving.",
      "Plate the meal, check that the protein is cooked through, and save leftovers promptly."
    ],
    substitutions: [],
    equipment_adaptations: [],
    reuse_ideas: [],
    fallback: true
  };
}

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const apiKey = Netlify.env.get("GEMINI_API_KEY");
  if (!apiKey) return json({ error: "Chef Jarvis AI is not configured yet." }, 503);

  const authorization = req.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Please sign in first." }, 401);

  const supabaseUrl = "https://mylcykwmwlnjlclodmuo.supabase.co";
  const publishableKey = "sb_publishable_DCmfrANKHYSrKx18V-fJhg_TEMfoyb1";
  const identity = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: publishableKey, Authorization: authorization },
  });
  if (!identity.ok) return json({ error: "Your sign-in session has expired. Please sign in again." }, 401);

  let body: { request?: string; profile?: Profile };
  try { body = await req.json(); } catch { return json({ error: "Invalid request." }, 400); }
  const request = body.request?.trim();
  if (!request || request.length > 500) return json({ error: "Tell Jarvis what you would like to cook (up to 500 characters)." }, 400);

  const profile = body.profile || {};
  const prompt = `You are Chef Jarvis, a careful personal cooking assistant. Create one realistic meal plan for the user's request. Respect every allergy and dietary restriction; never recommend an allergen. Use the user profile as a target, not medical advice. Be concise: at most 10 ingredients, 6 steps, 3 substitutions, and 3 reuse ideas. Return ONLY a valid JSON object with this exact shape:
{"title":"string","summary":"string","minutes":number,"servings":number,"kcal":number,"protein_g":number,"carbs_g":number,"fat_g":number,"ingredients":[{"name":"string","amount":"string"}],"steps":["string"],"substitutions":[{"from":"string","to":"string","reason":"string"}],"equipment_adaptations":[{"original":"string","alternative":"string","instructions":"string","why":"string"}],"reuse_ideas":[{"title":"string","uses":["string"],"why":"string"}]}

User request: ${request}
Profile: ${JSON.stringify({ calorie_target: profile.calorie_target, protein_g: profile.protein_g, carbs_g: profile.carbs_g, fat_g: profile.fat_g, body_goal: profile.body_composition_goal, dietary_preferences: profile.dietary_preferences || [], allergies: profile.allergies || [], dislikes: profile.dislikes || [], available_equipment: profile.equipment || [] })}
Only suggest equipment alternatives that use the available equipment.`;

  const payload = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.25, responseMimeType: "application/json", maxOutputTokens: 2048 },
  });
  const models = ["gemini-3.5-flash", "gemini-2.5-flash-lite"];
  let keyRejected = false;
  for (const model of models) {
    try {
      const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: payload,
        signal: AbortSignal.timeout(4000),
      });
      if (!aiResponse.ok) {
        const detail = await aiResponse.text();
        console.error("Gemini meal plan error", model, aiResponse.status, detail.slice(0, 500));
        keyRejected ||= aiResponse.status === 401 || aiResponse.status === 403;
        continue;
      }
      const raw = await aiResponse.json() as Record<string, unknown>;
      try {
        return json({ plan: parseJsonPlan(extractText(raw)), model });
      } catch {
        console.error("Gemini returned non-JSON meal plan", model);
      }
    } catch (error) {
      console.error("Gemini meal plan request failed", model, error instanceof Error ? error.name : "unknown error");
    }
  }
  if (keyRejected) return json({ error: "Gemini rejected the API key. Replace GEMINI_API_KEY in Netlify." }, 502);
  console.warn("Using Chef Jarvis stable fallback plan after Gemini was unavailable");
  return json({ plan: stableFallbackPlan(request, profile), fallback: true });
};

export const config: Config = { path: "/api/meal-plan" };
