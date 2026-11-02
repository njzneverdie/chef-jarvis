import { expect, test } from "@playwright/test";

const email = process.env.CHEF_E2E_EMAIL;
const password = process.env.CHEF_E2E_PASSWORD;
const authenticatedSkipReason =
  "Set CHEF_E2E_EMAIL and CHEF_E2E_PASSWORD for authenticated named-recipe coverage.";

function skipWithoutDedicatedAccount() {
  test.skip(!email || !password, authenticatedSkipReason);
}

async function signIn(page) {
  skipWithoutDedicatedAccount();
  await page.goto("/");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in →" }).click();
  await expect(page.getByText("YOUR KITCHEN, MADE EASIER")).toBeVisible();
}

function jsonResponse(body, status = 200) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  };
}

function namedRecipePlan({
  title = "肉燥飯",
  sourceType = "adapted",
  sourceProvider = "themealdb",
  sourceTitle = "Lu Rou Fan",
  sourceUrl = "https://example.test/lu-rou-fan",
  sourcePersistence = "session_only",
} = {}) {
  return {
    title,
    summary: `以豬絞肉和醬油慢燉的台式${title}。`,
    minutes: 35,
    servings: 2,
    kcal: 1100,
    protein_g: 45,
    carbs_g: 130,
    fat_g: 38,
    ingredients: [
      {
        name: "豬絞肉",
        usda_query: "ground pork",
        quantity: 300,
        unit: "g",
        preparation: "無需處理",
        category: "protein",
      },
      {
        name: "白米飯",
        usda_query: "cooked white rice",
        quantity: 400,
        unit: "g",
        preparation: "煮熟",
        category: "grain",
      },
    ],
    steps: [
      {
        instruction: "以中火拌炒豬絞肉 5 分鐘。",
        timers: [
          {
            label: "拌炒豬絞肉",
            kind: "cook",
            duration_seconds: 300,
          },
        ],
      },
    ],
    substitutions: [],
    equipment_adaptations: [],
    reuse_ideas: [],
    source_type: sourceType,
    source_provider: sourceProvider,
    source_title: sourceTitle,
    source_url: sourceUrl,
    source_persistence: sourcePersistence,
    canonical_dish_name: title,
    original_request: title,
  };
}

async function installRecipeMutationTrap(page) {
  const mutations = [];
  await page.route("**/rest/v1/recipes*", async (route) => {
    const request = route.request();
    if (["GET", "HEAD", "OPTIONS"].includes(request.method())) {
      await route.continue();
      return;
    }
    mutations.push(`${request.method()} ${request.url()}`);
    await route.fulfill(
      jsonResponse({ error: "Recipe persistence is forbidden in this story." }, 409),
    );
  });
  return mutations;
}

async function submitMeal(page, request) {
  await page.locator("#meal-input").fill(request);
  await page.getByRole("button", { name: "Generate" }).click();
}

test("dedicated test account can read every primary view", async ({ page }) => {
  await signIn(page);

  const cloudMutations = [];
  page.on("request", (request) => {
    if (
      request.url().includes("/rest/v1/") &&
      !["GET", "HEAD", "OPTIONS"].includes(request.method())
    ) {
      cloudMutations.push(`${request.method()} ${request.url()}`);
    }
  });
  const views = [
    ["Plan", "PERSONAL MEAL PLANNER"],
    ["Week", "WEEKLY PLANNER"],
    ["Shopping", "AT THE STORE"],
    ["Pantry", "KITCHEN INVENTORY"],
    ["Cook", /CHEF MODE · (READY|ACTIVE RECIPE)/],
    ["Profile", "YOUR FOOD PROFILE"],
    ["Home", "YOUR KITCHEN, MADE EASIER"],
  ];
  for (const [buttonName, expectedText] of views) {
    await page
      .getByRole("button", { name: new RegExp(`${buttonName}$`) })
      .click();
    await expect(page.getByText(expectedText).first()).toBeVisible();
  }
  expect(cloudMutations).toEqual([]);
});

test("provider hit renders the exact session-only recipe without inserting it", async ({
  page,
}) => {
  await signIn(page);
  const recipeMutations = await installRecipeMutationTrap(page);
  await page.route("**/functions/v1/chef-meal-plan", async (route) => {
    await route.fulfill(
      jsonResponse({
        plan: namedRecipePlan(),
        meta: { outcome: "external_recipe" },
      }),
    );
  });

  await submitMeal(page, "肉燥飯");

  await expect(page.locator("#plan .recipe-body h2")).toHaveText("肉燥飯");
  await expect(page.locator(".recipe-source-note a")).toHaveText("Lu Rou Fan");
  await expect(page.locator(".recipe-source-note a")).toHaveAttribute(
    "href",
    "https://example.test/lu-rou-fan",
  );
  await expect(page.locator(".chef-fallback-note")).toHaveCount(0);
  await expect(page.getByText(/available in this session and was not stored/i)).toBeVisible();
  expect(recipeMutations).toEqual([]);
});

test("clarification candidates render before a plan and resubmit the exact selection", async ({
  page,
}) => {
  await signIn(page);
  const recipeMutations = await installRecipeMutationTrap(page);
  const submittedRequests = [];
  await page.route("**/functions/v1/chef-meal-plan", async (route) => {
    const body = route.request().postDataJSON();
    submittedRequests.push(body.request);
    if (body.request === "紅燒飯") {
      await route.fulfill(
        jsonResponse({
          clarification_required: true,
          original_request: "紅燒飯",
          candidates: ["紅燒肉飯", "紅燒牛肉飯"],
          meta: { outcome: "dish_clarification_required" },
        }),
      );
      return;
    }
    await route.fulfill(
      jsonResponse({
        plan: namedRecipePlan({
          title: body.request,
          sourceTitle: "Braised Pork Rice",
          sourceUrl: "https://example.test/braised-pork-rice",
        }),
        meta: { outcome: "external_recipe" },
      }),
    );
  });

  await submitMeal(page, "紅燒飯");

  await expect(page.getByRole("button", { name: "紅燒肉飯" })).toBeVisible();
  await expect(page.getByRole("button", { name: "紅燒牛肉飯" })).toBeVisible();
  await expect(page.locator("#plan .recipe-showcase")).toHaveCount(0);

  await page.getByRole("button", { name: "紅燒肉飯" }).click();

  await expect(page.locator("#plan .recipe-body h2")).toHaveText("紅燒肉飯");
  expect(submittedRequests).toEqual(["紅燒飯", "紅燒肉飯"]);
  expect(recipeMutations).toEqual([]);
});

test("an unknown custom dish asks for descriptive details without rendering or persistence", async ({
  page,
}) => {
  await signIn(page);
  const recipeMutations = await installRecipeMutationTrap(page);
  await page.route("**/functions/v1/chef-meal-plan", async (route) => {
    await route.fulfill(
      jsonResponse({
        clarification_required: true,
        needs_description: true,
        original_request: "阿嬤特製星光飯",
        candidates: [],
        meta: { outcome: "dish_clarification_required" },
      }),
    );
  });

  await submitMeal(page, "阿嬤特製星光飯");

  await expect(
    page.getByText(
      "Add ingredients or cooking details so Jarvis can identify this custom dish.",
    ),
  ).toBeVisible();
  await expect(page.locator("[data-dish-candidate]")).toHaveCount(0);
  await expect(page.locator("#plan .recipe-showcase")).toHaveCount(0);
  expect(recipeMutations).toEqual([]);
});

test("exact AI result remains in memory until the user explicitly saves it", async ({
  page,
}) => {
  await signIn(page);
  const recipeMutations = await installRecipeMutationTrap(page);
  await page.route("**/functions/v1/chef-usda-nutrition", async (route) => {
    await route.fulfill(jsonResponse({ foods: [] }));
  });
  await page.route("**/functions/v1/chef-meal-plan", async (route) => {
    await route.fulfill(
      jsonResponse({
        plan: namedRecipePlan({
          sourceType: "ai_generated",
          sourceProvider: "",
          sourceTitle: "",
          sourceUrl: "",
          sourcePersistence: "permanent",
        }),
        meta: { outcome: "ai_generated" },
      }),
    );
  });

  await submitMeal(page, "肉燥飯");

  await expect(page.locator("#plan .recipe-body h2")).toHaveText("肉燥飯");
  await expect(page.getByText("Generated by Chef Jarvis")).toBeVisible();
  await expect(page.getByRole("button", { name: "Cook later" })).toBeVisible();
  await expect(page.locator(".chef-fallback-note")).toHaveCount(0);
  expect(recipeMutations).toEqual([]);
});

test("named 503 preserves the exact error and renders no unrelated recipe", async ({
  page,
}) => {
  await signIn(page);
  const recipeMutations = await installRecipeMutationTrap(page);
  const exactMessage = "目前無法取得「肉燥飯」的完整食譜，請稍後再試。";
  await page.route("**/functions/v1/chef-meal-plan", async (route) => {
    await route.fulfill(
      jsonResponse(
        {
          error: exactMessage,
          code: "named_recipe_unavailable",
          meta: { outcome: "generation_timeout" },
        },
        503,
      ),
    );
  });

  await submitMeal(page, "肉燥飯");

  await expect(page.getByRole("alert")).toContainText(exactMessage);
  await expect(page.locator("#plan .recipe-showcase")).toHaveCount(0);
  await expect(page.locator("#plan .recipe-image")).toHaveCount(0);
  await expect(page.getByText("精準蔬菜鷹嘴豆飯碗")).toHaveCount(0);
  expect(recipeMutations).toEqual([]);
});
