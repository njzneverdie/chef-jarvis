import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMenuResponse,
  generateMenuItems,
} from "../supabase/functions/_shared/menu-generation.js";

test("preserves input order while limiting concurrent workers", async () => {
  let active = 0;
  let maximumActive = 0;
  const dishes = ["A", "B", "C", "D", "E", "F"];
  const results = await generateMenuItems(dishes, async (dish) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setTimeout(resolve, dish === "A" ? 8 : 1));
    active -= 1;
    return { requested_dish: dish, status: "ready", plan: { title: dish } };
  });
  assert.equal(maximumActive, 3);
  assert.deepEqual(results.map((item) => item.requested_dish), dishes);
});

test("converts thrown item failures into plan-free unavailable entries", async () => {
  const [result] = await generateMenuItems(["麻婆豆腐"], async () => {
    const error = new Error("raw provider response");
    error.code = "named_recipe_unavailable";
    error.safeMessage = "目前無法取得完整食譜，請稍後再試。";
    error.meta = {
      failure_stage: "repair_validation",
      failure_reason: "recipe_schema",
    };
    throw error;
  });
  assert.deepEqual(result, {
    requested_dish: "麻婆豆腐",
    status: "unavailable",
    code: "named_recipe_unavailable",
    message: "目前無法取得完整食譜，請稍後再試。",
    meta: {
      failure_stage: "repair_validation",
      failure_reason: "recipe_schema",
    },
  });
  assert.equal("plan" in result, false);
});

test("does not expose thrown messages or unrestricted diagnostics", async () => {
  const [result] = await generateMenuItems(["dish"], async () => {
    const error = new Error("secret model payload");
    error.code = "not-an-approved-code";
    error.safeMessage = "x".repeat(500);
    error.meta = {
      failure_stage: "y".repeat(100),
      failure_reason: "z".repeat(100),
      raw: "must not escape",
    };
    throw error;
  });
  assert.equal(result.code, "named_recipe_unavailable");
  assert.equal(result.message.length, 300);
  assert.equal(result.meta.failure_stage.length, 80);
  assert.equal(result.meta.failure_reason.length, 80);
  assert.equal("raw" in result.meta, false);
  assert.doesNotMatch(JSON.stringify(result), /secret model payload/);
});

test("builds deterministic menu totals", () => {
  const recipes = [
    { requested_dish: "A", status: "ready", plan: { title: "A" } },
    {
      requested_dish: "B",
      status: "clarification_required",
      candidates: [],
    },
    {
      requested_dish: "C",
      status: "unavailable",
      code: "named_recipe_unavailable",
      message: "Retry.",
    },
  ];
  assert.deepEqual(
    buildMenuResponse("A、B、C", recipes, { request_id: "request-1" }).meta,
    {
      request_id: "request-1",
      requested_count: 3,
      ready_count: 1,
      clarification_count: 1,
      failed_count: 1,
    },
  );
});
