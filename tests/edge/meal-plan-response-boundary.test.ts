// Execution-level response-boundary tests for the real chef-meal-plan
// handler. The module is imported unmodified, Deno.serve listens on its
// default port, and every upstream dependency (Supabase auth/REST/RPC and
// Gemini) is served by a URL-routing fetch stub. Run with:
//   npx deno-bin test --no-lock -A tests/edge/
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";

const SUPABASE_URL = "http://supabase-stub.invalid";
Deno.env.set("SUPABASE_URL", SUPABASE_URL);
Deno.env.set("SUPABASE_ANON_KEY", "stub-anon-key");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "stub-service-key");
Deno.env.delete("GEMINI_API_KEY");
Deno.env.delete("THEMEALDB_API_KEY");

type StubState = {
  allergies: string[];
  geminiMode: "fail" | "recipe" | "named_verifier_fallback";
  geminiRecipe: Record<string, unknown> | null;
  geminiCalls: Array<{ model: string; kind: string }>;
  consumeCalls: number;
  refundCalls: number;
};

const state: StubState = {
  allergies: [],
  geminiMode: "fail",
  geminiRecipe: null,
  geminiCalls: [],
  consumeCalls: 0,
  refundCalls: 0,
};

const completions: Record<string, unknown>[] = [];
const originalLog = console.log;
console.log = (...args: unknown[]) => {
  if (args[0] === "chef_meal_plan_completed") {
    completions.push(args[1] as Record<string, unknown>);
  }
  originalLog(...args);
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function profileRow() {
  return {
    calorie_target: 2000,
    protein_g: 150,
    carbs_g: 200,
    fat_g: 60,
    body_composition_goal: "recomposition",
    dietary_preferences: [],
    allergies: state.allergies,
    dislikes: [],
    equipment: [],
  };
}

function stubSupabase(url: URL, init?: RequestInit): Response {
  const method = (init?.method || "GET").toUpperCase();
  const path = url.pathname;
  if (path === "/auth/v1/user") {
    return json({
      id: "00000000-0000-4000-8000-000000000001",
      aud: "authenticated",
      role: "authenticated",
      email: "boundary@example.com",
      created_at: "2026-01-01T00:00:00Z",
      app_metadata: {},
      user_metadata: {},
    });
  }
  if (path.startsWith("/rest/v1/rpc/consume_chef_meal_plan_quota")) {
    state.consumeCalls += 1;
    return json([{ allowed: true, reason: null, retry_after_seconds: 0 }]);
  }
  if (path.startsWith("/rest/v1/rpc/refund_chef_meal_plan_quota")) {
    state.refundCalls += 1;
    return new Response(null, { status: 204 });
  }
  if (path.startsWith("/rest/v1/app_profiles")) return json(profileRow());
  if (path.startsWith("/rest/v1/recipes") && method === "DELETE") {
    return new Response(null, { status: 204 });
  }
  if (
    path.startsWith("/rest/v1/pantry_items") ||
    path.startsWith("/rest/v1/recipe_feedback") ||
    path.startsWith("/rest/v1/recipes")
  ) {
    return json([]);
  }
  return json({ message: `unexpected supabase path ${path}` }, 500);
}

function stubGemini(url: URL, init?: RequestInit): Response {
  const model = url.pathname.match(/\/models\/([^:]+):generateContent/)?.[1] || "";
  const requestBody = typeof init?.body === "string"
    ? JSON.parse(init.body) as {
      contents?: Array<{ parts?: Array<{ text?: string }> }>;
    }
    : {};
  const prompt = requestBody.contents?.[0]?.parts?.[0]?.text || "";
  const kind = prompt.includes("Treat the following as a dish label")
    ? "resolver"
    : prompt.includes("Independently verify whether the recipe is exactly")
    ? "verifier"
    : "generation";
  state.geminiCalls.push({ model, kind });
  if (state.geminiMode === "named_verifier_fallback") {
    if (kind === "resolver") {
      return json({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                canonical_name: "香草燉豆腐",
                aliases: ["Herb-braised tofu"],
                core_ingredient_groups: [
                  ["tofu"],
                  ["mixed herbs"],
                ],
                core_techniques: ["braise", "simmer"],
                confidence: 0.99,
                candidates: [],
              }),
            }],
          },
        }],
      });
    }
    if (model === "gemini-3.5-flash") {
      return json({ error: "stubbed model unavailable" }, 503);
    }
    if (kind === "verifier") {
      return json({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                same_dish: true,
                confidence: 0.99,
                missing_core: [],
              }),
            }],
          },
        }],
      });
    }
    if (kind === "generation" && state.geminiRecipe) {
      return json({
        candidates: [{
          content: {
            parts: [{ text: JSON.stringify(state.geminiRecipe) }],
          },
        }],
      });
    }
  }
  if (state.geminiMode === "recipe" && state.geminiRecipe) {
    return json({
      candidates: [{
        content: {
          parts: [{ text: JSON.stringify(state.geminiRecipe) }],
        },
      }],
    });
  }
  return json({ error: "stubbed model outage" }, 500);
}

const realFetch = globalThis.fetch;
globalThis.fetch = ((input: Request | URL | string, init?: RequestInit) => {
  const href = typeof input === "string"
    ? input
    : input instanceof URL
      ? input.href
      : input.url;
  const url = new URL(href);
  if (href.startsWith(SUPABASE_URL)) {
    const request = input instanceof Request ? input : null;
    const method = init?.method || request?.method || "GET";
    return Promise.resolve(stubSupabase(url, { ...init, method }));
  }
  if (url.hostname === "generativelanguage.googleapis.com") {
    return Promise.resolve(stubGemini(url, init));
  }
  if (url.hostname.endsWith("themealdb.com")) {
    return Promise.resolve(json({ meals: null }));
  }
  if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
    return realFetch(input as never, init);
  }
  // No other network traffic is expected during a request.
  return Promise.resolve(json({ blocked: href }, 502));
}) as typeof fetch;

await import("../../supabase/functions/chef-meal-plan/index.ts");
const ENDPOINT = "http://127.0.0.1:8000/";

async function requestPlan(meal: string) {
  const response = await realFetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer stub-user-token",
    },
    body: JSON.stringify({ request: meal, language: "en" }),
  });
  return { status: response.status, body: await response.json() };
}

function resetScenario(overrides: Partial<StubState> = {}) {
  state.allergies = [];
  state.geminiMode = "fail";
  state.geminiRecipe = null;
  state.geminiCalls = [];
  state.consumeCalls = 0;
  state.refundCalls = 0;
  Object.assign(state, overrides);
  completions.length = 0;
}

const BROAD_MEAL = "a healthy dinner";
let fallbackAllergen = "";

Deno.test("unconfigured fallback returns a labeled plan without consuming quota", { sanitizeOps: false, sanitizeResources: false }, async () => {
  resetScenario();
  Deno.env.delete("GEMINI_API_KEY");
  const { status, body } = await requestPlan(BROAD_MEAL);
  assertEquals(status, 200);
  assert(body.plan, "expected a fallback plan");
  assertEquals(body.fallback, true);
  assertMatch(String(body.notice), /not configured/i);
  assertEquals(state.consumeCalls, 0);
  assertEquals(state.refundCalls, 0);
  assertEquals(completions.length, 1);
  assertEquals(completions[0].outcome, "fallback_unconfigured");
  fallbackAllergen = String(body.plan.ingredients[0].name);
});

Deno.test("unconfigured fallback fails closed when it would expose a saved allergen", { sanitizeOps: false, sanitizeResources: false }, async () => {
  assert(fallbackAllergen, "previous scenario must capture an ingredient");
  resetScenario({ allergies: [fallbackAllergen] });
  Deno.env.delete("GEMINI_API_KEY");
  const { status, body } = await requestPlan(BROAD_MEAL);
  assertEquals(status, 500);
  assertEquals(body.plan, undefined);
  assert(body.error, "expected a generic error body");
  assertEquals(completions.length, 0, "an unsafe fallback must not log completion");
  assertEquals(state.consumeCalls, 0);
});

Deno.test("models-failed fallback refunds quota before responding", { sanitizeOps: false, sanitizeResources: false }, async () => {
  resetScenario({ geminiMode: "fail" });
  Deno.env.set("GEMINI_API_KEY", "stub-gemini-key");
  const { status, body } = await requestPlan(BROAD_MEAL);
  assertEquals(status, 200);
  assert(body.plan, "expected the labeled broad fallback");
  assertEquals(body.fallback, true);
  assertEquals(state.consumeCalls, 1);
  assertEquals(state.refundCalls, 1);
  assertEquals(completions.length, 1);
  assertEquals(completions[0].outcome, "fallback_models_failed");
});

Deno.test("an unsafe metered response refunds quota and never logs completion", { sanitizeOps: false, sanitizeResources: false }, async () => {
  assert(fallbackAllergen, "previous scenario must capture an ingredient");
  resetScenario({ geminiMode: "fail", allergies: [fallbackAllergen] });
  Deno.env.set("GEMINI_API_KEY", "stub-gemini-key");
  const { status, body } = await requestPlan(BROAD_MEAL);
  assertEquals(status, 500);
  assertEquals(body.plan, undefined);
  assertEquals(state.consumeCalls, 1);
  assertEquals(state.refundCalls, 1, "the reserved quota must be refunded");
  assertEquals(completions.length, 0, "an unsafe response must not log completion");
});

Deno.test("ai success returns a validated plan and keeps the quota consumed", { sanitizeOps: false, sanitizeResources: false }, async () => {
  resetScenario({
    geminiMode: "recipe",
    geminiRecipe: {
      title: "Ginger Salmon Rice Bowl",
      image_query: "ginger salmon rice bowl",
      summary:
        "Pan-seared salmon over jasmine rice with steamed broccoli and a light ginger glaze.",
      minutes: 30,
      servings: 2,
      kcal: 650,
      protein_g: 45,
      carbs_g: 60,
      fat_g: 20,
      ingredients: [
        {
          name: "Salmon fillet",
          usda_query: "salmon fillet",
          quantity: 300,
          unit: "g",
          preparation: "patted dry",
          category: "protein",
        },
        {
          name: "Jasmine rice",
          usda_query: "jasmine rice",
          quantity: 200,
          unit: "g",
          preparation: "rinsed",
          category: "grain",
        },
        {
          name: "Broccoli florets",
          usda_query: "broccoli",
          quantity: 250,
          unit: "g",
          preparation: "cut into bite-size pieces",
          category: "produce",
        },
        {
          name: "Olive oil",
          usda_query: "olive oil",
          quantity: 1,
          unit: "tbsp",
          preparation: "for searing",
          category: "oil",
        },
      ],
      steps: [
        {
          instruction:
            "Rinse the jasmine rice, then simmer it with 400 ml of water for 12 minutes.",
        },
        {
          instruction:
            "Pan-sear the salmon fillet in olive oil for 8 minutes, turning once halfway.",
        },
        {
          instruction:
            "Steam the broccoli florets for 5 minutes, then assemble the bowl and serve.",
        },
      ],
      substitutions: [],
      equipment_adaptations: [],
      reuse_ideas: [],
    },
  });
  Deno.env.set("GEMINI_API_KEY", "stub-gemini-key");
  const { status, body } = await requestPlan(BROAD_MEAL);
  assertEquals(status, 200);
  assert(body.plan, "expected the AI plan");
  assertEquals(body.fallback, undefined, "a validated AI plan is not a fallback");
  assertEquals(body.plan.title, "Ginger Salmon Rice Bowl");
  assertEquals(state.consumeCalls, 1);
  assertEquals(state.refundCalls, 0, "a successful metered plan keeps its quota");
  assertEquals(completions.length, 1);
  assertEquals(completions[0].outcome, "ai_generated");
});

Deno.test("a named recipe falls back to the working generation model when the preferred identity verifier is unavailable", { sanitizeOps: false, sanitizeResources: false }, async () => {
  resetScenario({
    geminiMode: "named_verifier_fallback",
    geminiRecipe: {
      title: "香草燉豆腐",
      image_query: "herb braised tofu",
      summary: "Tofu gently braised with tomatoes and mixed herbs.",
      minutes: 35,
      servings: 4,
      kcal: 380,
      protein_g: 28,
      carbs_g: 24,
      fat_g: 20,
      ingredients: [
        {
          name: "板豆腐",
          usda_query: "firm tofu",
          quantity: 600,
          unit: "g",
          preparation: "切成大塊",
          category: "protein",
        },
        {
          name: "番茄",
          usda_query: "tomatoes",
          quantity: 400,
          unit: "g",
          preparation: "切丁",
          category: "produce",
        },
        {
          name: "綜合香草",
          usda_query: "mixed dried herbs",
          quantity: 2,
          unit: "tsp",
          preparation: "no preparation",
          category: "seasoning",
        },
      ],
      steps: [
        {
          instruction: "將番茄與綜合香草炒 5 分鐘。",
          timers: [
            { label: "炒香番茄與香草", kind: "cook", duration_seconds: 300 },
          ],
        },
        {
          instruction: "加入板豆腐，以小火燉煮 20 分鐘。",
          timers: [
            { label: "燉煮香草豆腐", kind: "simmer", duration_seconds: 1200 },
          ],
        },
      ],
      substitutions: [],
      equipment_adaptations: [],
      reuse_ideas: [],
    },
  });
  Deno.env.set("GEMINI_API_KEY", "stub-gemini-key");

  const { status, body } = await requestPlan("香草燉豆腐");

  assertEquals(status, 200);
  assertEquals(body.plan?.title, "香草燉豆腐");
  assertEquals(state.refundCalls, 0);
  assertEquals(completions.length, 1);
  assertEquals(state.geminiCalls, [
    { model: "gemini-3.1-flash-lite", kind: "resolver" },
    { model: "gemini-3.1-flash-lite", kind: "generation" },
    { model: "gemini-3.5-flash", kind: "verifier" },
    { model: "gemini-3.1-flash-lite", kind: "verifier" },
  ]);
});
