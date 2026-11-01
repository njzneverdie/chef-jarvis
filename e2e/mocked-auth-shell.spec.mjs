import { expect, test } from "@playwright/test";

const userId = "11111111-1111-4111-8111-111111111111";
const user = {
  id: userId,
  aud: "authenticated",
  role: "authenticated",
  email: "chef-audit@example.com",
  email_confirmed_at: "2026-09-02T00:00:00.000Z",
  user_metadata: {},
  app_metadata: { provider: "email", providers: ["email"] },
  created_at: "2026-09-02T00:00:00.000Z",
};

const profile = {
  app_user_id: userId,
  onboarding_completed: true,
  mode: "calculate",
  height_cm: 175,
  weight_kg: 72,
  age: 25,
  biological_sex: "male",
  activity_level: "moderate",
  goal: "recomposition",
  body_composition_goal: "recomposition",
  calorie_target: 2400,
  protein_g: 160,
  carbs_g: 275,
  fat_g: 70,
  dietary_preferences: [],
  allergies: [],
  dislikes: [],
  equipment: ["Stovetop", "Oven"],
};

const token = [
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
  "eyJzdWIiOiIxMTExMTExMS0xMTExLTQxMTEtODExMS0xMTExMTExMTExMTEiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoyNTM0MDIzMDA3OTl9",
  "audit-signature",
].join(".");

function json(body, status = 200, extraHeaders = {}) {
  return {
    status,
    contentType: "application/json",
    headers: {
      "access-control-allow-origin": "*",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

// options.profile overrides the signed-in profile (null = no profile row);
// options.tables returns rows per table; options.writes collects mutations,
// which are then accepted instead of rejected.
async function installBackendMock(page, options = {}) {
  const currentProfile = options.profile === null ? null : { ...profile, ...(options.profile || {}) };
  await page.route("**/auth/v1/token?grant_type=password", (route) =>
    route.fulfill(
      json({
        access_token: token,
        token_type: "bearer",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: "audit-refresh-token",
        user,
      }),
    ),
  );
  await page.route("**/auth/v1/user", (route) =>
    route.fulfill(json({ ...user, user_metadata: {}, app_metadata: user.app_metadata })),
  );
  await page.route("**/rest/v1/**", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const table = url.pathname.split("/").at(-1);
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
      if (!options.writes) {
        return route.fulfill(json({ message: "Unexpected mutation in read-only audit" }, 409));
      }
      let body = null;
      try { body = request.postDataJSON(); } catch {}
      options.writes.push({ table, method: request.method(), body });
      const rows = (Array.isArray(body) ? body : [body || {}]).map((row, index) => ({ id: `00000000-0000-4000-8000-${String(options.writes.length * 100 + index).padStart(12, "0")}`, ...row }));
      // .single() asks for one object instead of an array.
      const single = /vnd\.pgrst\.object/.test(request.headers()["accept"] || "");
      return route.fulfill(json(single ? rows[0] : rows, 201));
    }
    if (table === "app_profiles") {
      if (!currentProfile) return route.fulfill(json(null, 200, { "content-range": "*/0" }));
      return route.fulfill(
        json(currentProfile, 200, { "content-range": "0-0/1" }),
      );
    }
    const rows = options.tables?.[table] || [];
    return route.fulfill(json(rows, 200, { "content-range": rows.length ? `0-${rows.length - 1}/${rows.length}` : "*/0" }));
  });
}

test("route-mocked account can render every primary signed-in view", async ({
  page,
}, testInfo) => {
  await installBackendMock(page);
  await page.goto("/");
  await page.getByLabel("Email").fill("chef-audit@example.com");
  await page.getByLabel("Password").fill("audit-only-password");
  await page.getByRole("button", { name: "Sign in →" }).click();

  await expect(page.getByText("YOUR KITCHEN, MADE EASIER")).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({ path: testInfo.outputPath("mocked-home.png"), fullPage: true });

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
    await page.getByRole("button", { name: new RegExp(`${buttonName}$`) }).click();
    await expect(page.getByText(expectedText).first()).toBeVisible();
  }
});

test("every primary view remains reachable from the signed-in mobile navigation", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installBackendMock(page);
  await page.goto("/");
  await page.getByLabel("Email").fill("chef-audit@example.com");
  await page.getByLabel("Password").fill("audit-only-password");
  await page.getByRole("button", { name: "Sign in →" }).click();
  await expect(page.getByText("YOUR KITCHEN, MADE EASIER")).toBeVisible();

  for (const name of [
    "Home",
    "Plan",
    "Week",
    "Shopping",
    "Pantry",
    "Cook",
    "Profile",
  ]) {
    await expect(
      page.getByRole("button", { name: new RegExp(`${name}$`) }),
    ).toBeVisible();
  }

  await page.getByRole("button", { name: /Profile$/ }).click();
  await expect(page.getByText("YOUR FOOD PROFILE").first()).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({
    path: testInfo.outputPath("mocked-mobile-profile.png"),
    fullPage: true,
  });
});

test('one sign-in loads the profile once and does not replace navigation', async ({page})=>{
 await installBackendMock(page);
 let profileLoads=0;
 page.on('request',request=>{if(request.url().includes('/rest/v1/app_profiles'))profileLoads++;});
 await page.goto('/');
 await page.getByLabel('Email').fill('chef-audit@example.com');
 await page.getByLabel('Password').fill('audit-only-password');
 await page.getByRole('button',{name:'Sign in →'}).click();
 await expect(page.getByText('YOUR KITCHEN, MADE EASIER')).toBeVisible();
 await page.getByRole('button',{name:/Plan$/}).click();
 await expect(page.locator('#plan')).toHaveClass(/active/);
 await expect(page.getByText('PERSONAL MEAL PLANNER').first()).toBeVisible();
 expect(profileLoads).toBe(1);
});

test("meal planning submits selected conditions without a text field", async ({ page }) => {
  await installBackendMock(page, { profile: { cooking_skill: "beginner" } });
  let body;
  await page.route("**/functions/v1/chef-meal-plan", async route => {
    body = route.request().postDataJSON();
    await route.fulfill(json({ error: "Test response: selected request received" }, 503));
  });
  await page.goto("/");
  await page.getByLabel("Email").fill("chef-audit@example.com");
  await page.getByLabel("Password").fill("audit-only-password");
  await page.getByRole("button", { name: "Sign in →" }).click();
  const planner = page.locator("#meal-form");
  await expect(planner).toBeVisible();
  await expect(planner.getByRole("textbox")).toHaveCount(0);
  await planner.locator('input[name="servings"][value="4"]').check();
  await planner.getByLabel("15 min", { exact: true }).check();
  await planner.locator("summary", { hasText: "Practical needs" }).click();
  await planner.getByLabel("Use my pantry", { exact: true }).check();
  await planner.locator("summary", { hasText: "Meal & cuisine" }).click();
  await planner.getByLabel("Japanese", { exact: true }).check();
  await planner.getByLabel("Korean", { exact: true }).check();
  await expect(planner.locator("#planner-summary")).toContainText("Japanese, Korean");
  await planner.getByRole("button", { name: "Generate", exact: true }).click();
  await expect.poll(() => body?.request).toContain("exactly 4 servings");
  expect(body.request).toContain("at most 15 minutes");
  expect(body.request).toContain("saved allergies");
  expect(body.preferences.practical).toEqual(["use_pantry"]);
  expect(body.preferences.cuisine).toEqual(["japanese", "korean"]);
  expect(body.cooking_skill).toBe("beginner");
  await expect(planner.getByRole("button", { name: "Generate", exact: true })).toBeEnabled();
});

test("pantry ideas come from the server and a chosen idea is sent for a full recipe", async ({ page }) => {
  await installBackendMock(page);
  await page.route("**/rest/v1/pantry_items**", (route) =>
    route.fulfill(json([{ id: "p1", name: "Cabbage", quantity: 1, unit: "piece", storage_zone: "fridge", expires_on: "2026-11-02" }], 200, { "content-range": "0-0/1" })),
  );
  const bodies = [];
  await page.route("**/functions/v1/chef-meal-plan", async (route) => {
    const body = route.request().postDataJSON();
    bodies.push(body);
    if (body.mode === "pantry_ideas") {
      return route.fulfill(json({ ideas: [{ title: "Cabbage egg stir-fry", reason: "Quick and uses the cabbage first.", minutes: 15, uses: ["Cabbage"], expiring: ["Cabbage"], missing: ["eggs"] }] }));
    }
    return route.fulfill(json({ error: "Test response: idea received" }, 503));
  });
  await page.goto("/");
  await page.getByLabel("Email").fill("chef-audit@example.com");
  await page.getByLabel("Password").fill("audit-only-password");
  await page.getByRole("button", { name: "Sign in →" }).click();
  await page.getByRole("button", { name: /Pantry$/ }).first().click();
  await page.getByRole("button", { name: "See what I can make" }).click();
  await expect(page.getByText("Cabbage egg stir-fry · 15 min")).toBeVisible();
  await expect(page.getByText("Uses: Cabbage (expiring)")).toBeVisible();
  expect(bodies[0]).toMatchObject({ mode: "pantry_ideas", language: "en" });
  expect(bodies[0].pantry).toBeUndefined();
  await page.getByRole("button", { name: "Make this" }).click();
  await expect.poll(() => bodies.length).toBe(2);
  expect(bodies[1].pantry_idea).toEqual({ title: "Cabbage egg stir-fry", uses: ["Cabbage"] });
  expect(bodies[1].request).toContain("saved allergies");
});

test("pantry accepts several ingredients at once after a preview", async ({ page }) => {
  await installBackendMock(page);
  let inserted;
  await page.route("**/rest/v1/pantry_items**", (route) => {
    if (route.request().method() === "POST") {
      inserted = route.request().postDataJSON();
      return route.fulfill(json([], 201));
    }
    return route.fulfill(json([], 200, { "content-range": "*/0" }));
  });
  let preview = "";
  page.on("dialog", (dialog) => {
    preview = dialog.message();
    void dialog.accept();
  });
  await page.goto("/");
  await page.getByLabel("Email").fill("chef-audit@example.com");
  await page.getByLabel("Password").fill("audit-only-password");
  await page.getByRole("button", { name: "Sign in →" }).click();
  await page.getByRole("button", { name: /Pantry$/ }).first().click();
  await page.locator('#pantry-form input[name="item"]').fill("sea bream 300g, eggs 6, bok choy");
  await page.locator("#pantry-form button").click();
  await expect.poll(() => inserted?.length).toBe(3);
  expect(preview).toBe("Add 3 items: sea bream 300 g, eggs 6 pieces, bok choy");
  expect(inserted.map(({ name, quantity, unit }) => [name, quantity ?? null, unit ?? null])).toEqual([
    ["sea bream", 300, "g"],
    ["eggs", 6, "piece"],
    ["bok choy", null, null],
  ]);
});

async function signIn(page) {
  await page.goto("/");
  await page.getByLabel("Email").fill("chef-audit@example.com");
  await page.getByLabel("Password").fill("audit-only-password");
  await page.getByRole("button", { name: "Sign in →" }).click();
}

test("a new account finishes the three-step quick setup without body data", async ({ page }) => {
  const writes = [];
  await installBackendMock(page, { profile: null, writes });
  await signIn(page);
  const setup = page.locator("#quick-setup");
  await expect(setup.getByText("Quick setup · step 1 of 3")).toBeVisible();
  await setup.getByLabel("Peanut", { exact: true }).check();
  await setup.getByLabel("Vegetarian", { exact: true }).check();
  await setup.getByRole("button", { name: "Next" }).click();
  await expect(setup.getByText("Quick setup · step 2 of 3")).toBeVisible();
  await setup.getByLabel("Oven", { exact: true }).check();
  await setup.getByRole("button", { name: "Back" }).click();
  await expect(setup.getByLabel("Peanut", { exact: true })).toBeChecked();
  await setup.getByRole("button", { name: "Next" }).click();
  await expect(setup.getByLabel("Oven", { exact: true })).toBeChecked();
  await setup.getByRole("button", { name: "Next" }).click();
  await setup.getByLabel("Some experience", { exact: true }).check();
  await setup.getByRole("button", { name: "Start cooking" }).click();
  await expect(setup).toHaveCount(0);
  const saved = writes.find((write) => write.table === "app_profiles")?.body;
  expect(saved).toMatchObject({
    onboarding_completed: true,
    allergies: ["Peanut"],
    dietary_preferences: ["Vegetarian"],
    equipment: ["Oven"],
    cooking_skill: "some",
  });
  expect(saved.height_cm).toBeUndefined();
});

test("an onboarded account never sees the quick setup", async ({ page }) => {
  await installBackendMock(page);
  await signIn(page);
  await expect(page.locator("#meal-form")).toBeVisible();
  await expect(page.locator("#quick-setup")).toHaveCount(0);
});

const measuredPlan = {
  title: "Garlic chicken rice bowl",
  image_query: "garlic chicken rice bowl",
  summary: "A quick chicken rice bowl.",
  minutes: 25,
  servings: 1,
  kcal: 600,
  protein_g: 45,
  carbs_g: 60,
  fat_g: 15,
  ingredients: [
    { name: "Chicken breast", usda_query: "chicken breast raw", quantity: 200, unit: "g", preparation: "diced", category: "protein" },
    { name: "Cooked rice", usda_query: "rice white cooked", quantity: 200, unit: "g", preparation: "no preparation", category: "grain" },
    { name: "Olive oil", usda_query: "olive oil", quantity: 1, unit: "tbsp", preparation: "no preparation", category: "oil" },
  ],
  steps: [
    { instruction: "Heat 1 tbsp olive oil in a frying pan over medium heat for 1 minute.", timers: [{ label: "Heat oil", kind: "preheat", duration_seconds: 60 }], doneness: "The oil shimmers.", rescue: "Smoking? Take the pan off the heat for a moment." },
    { instruction: "Sear the diced chicken for 6 minutes until cooked through.", timers: [{ label: "Sear chicken", kind: "cook", duration_seconds: 360 }] },
    { instruction: "Serve the chicken over the rice.", timers: [] },
  ],
  substitutions: [],
  equipment_adaptations: [],
  reuse_ideas: [],
};

async function generateMeasuredPlan(page) {
  await page.route("**/functions/v1/chef-meal-plan", (route) =>
    route.fulfill(json({ plan: measuredPlan, meta: {} })),
  );
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start guided cooking →" })).toBeEnabled();
}

const savedRecipeRow = {
  id: "22222222-2222-4222-8222-222222222222",
  title: measuredPlan.title,
  servings: 1,
  minutes: 25,
  recipe: { ...measuredPlan, saved_recipe_id: "22222222-2222-4222-8222-222222222222" },
  nutrition: { estimate: { kcal: 600, protein_g: 45, carbs_g: 60, fat_g: 15 } },
  created_at: "2026-10-30T10:00:00Z",
  is_saved: true,
};

// "Cook later" saves the plan (accepted by the write-capturing mock), which
// makes guided-cooking progress survive a reload.
async function openSavedRecipe(page) {
  await generateMeasuredPlan(page);
  await page.getByRole("button", { name: "Cook later" }).click();
  await expect(page.getByText("Not saved yet")).toHaveCount(0);
}

test("guided cooking starts with a prep checklist that survives a reload", async ({ page }) => {
  await installBackendMock(page, { writes: [], tables: { recipes: [savedRecipeRow] } });
  await signIn(page);
  await openSavedRecipe(page);
  await page.getByRole("button", { name: "Start guided cooking →" }).click();
  const prep = page.locator(".prep-checklist");
  await expect(prep).toBeVisible();
  await expect(prep.getByText("Chicken breast: diced")).toBeVisible();
  await expect(prep.getByText("Get out the frying pan")).toBeVisible();
  await expect(prep.getByRole("button", { name: "Start cooking" })).toBeDisabled();
  await prep.getByText("Chicken breast: diced").click();
  await expect(prep.getByText("1 of 3 ready")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /Cook$/ }).first().click();
  const restored = page.locator(".prep-checklist");
  await expect(restored.getByText("1 of 3 ready")).toBeVisible();
  for (const label of ["Get out the cutting board and knife", "Get out the frying pan"]) {
    await restored.getByText(label).click();
  }
  await restored.getByRole("button", { name: "Start cooking" }).click();
  await expect(page.getByText("STEP 1 / 3")).toBeVisible();
  const step = page.locator(".chef-current");
  await expect(step.getByText("Tap underlined words for help.")).toBeVisible();
  await expect(step.locator(".step-term", { hasText: "1 tbsp" })).toBeVisible();
  await step.getByText("How do I know it is done?").click();
  await expect(step.getByText("The oil shimmers.")).toBeVisible();
  await expect(step.getByText("Smoking? Take the pan off the heat for a moment.")).toBeVisible();
  await step.getByText("Quick fixes: too salty, burnt…").click();
  await expect(step.getByText("Too salty", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Complete step →" }).click();
  await expect(page.locator(".chef-current .step-tips", { hasText: "How do I know it is done?" })).toHaveCount(0);
});
