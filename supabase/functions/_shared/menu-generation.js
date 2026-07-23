function safeDiagnostic(meta) {
  return {
    failure_stage: String(meta?.failure_stage || "unknown").slice(0, 80),
    failure_reason: String(meta?.failure_reason || "recipe_schema").slice(0, 80),
  };
}

function unavailableItem(dish, error) {
  return {
    requested_dish: dish,
    status: "unavailable",
    code: error?.code === "named_recipe_unavailable"
      ? error.code
      : "named_recipe_unavailable",
    message: String(
      error?.safeMessage ||
        "A complete recipe is unavailable right now. Please try again.",
    ).slice(0, 300),
    meta: safeDiagnostic(error?.meta),
  };
}

export async function generateMenuItems(
  dishes,
  worker,
  { concurrency = 3 } = {},
) {
  const results = Array(dishes.length);
  let nextIndex = 0;
  const runnerCount = Math.min(
    Math.max(1, Math.trunc(Number(concurrency)) || 1),
    dishes.length,
  );
  const runners = Array.from({ length: runnerCount }, async () => {
    while (nextIndex < dishes.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = await worker(dishes[index], index);
      } catch (error) {
        results[index] = unavailableItem(dishes[index], error);
      }
    }
  });
  await Promise.all(runners);
  return results;
}

export function buildMenuResponse(originalRequest, recipes, requestMeta = {}) {
  const readyCount = recipes.filter((item) => item.status === "ready").length;
  const clarificationCount = recipes.filter(
    (item) => item.status === "clarification_required",
  ).length;
  return {
    request_type: "menu",
    original_request: originalRequest,
    recipes,
    meta: {
      ...requestMeta,
      requested_count: recipes.length,
      ready_count: readyCount,
      clarification_count: clarificationCount,
      failed_count: recipes.length - readyCount - clarificationCount,
    },
  };
}
