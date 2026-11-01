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

async function installBackendMock(page) {
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
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
      return route.fulfill(json({ message: "Unexpected mutation in read-only audit" }, 409));
    }
    const url = new URL(request.url());
    const table = url.pathname.split("/").at(-1);
    if (table === "app_profiles") {
      return route.fulfill(
        json(profile, 200, { "content-range": "0-0/1" }),
      );
    }
    return route.fulfill(json([], 200, { "content-range": "*/0" }));
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
  await installBackendMock(page);
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
