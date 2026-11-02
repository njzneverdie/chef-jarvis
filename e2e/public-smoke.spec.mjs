import { expect, test } from "@playwright/test";

test("public auth shell validates input and persists language", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.locator("#app")).not.toHaveClass(/app-loading/);
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Privacy & retention" })).toHaveAttribute(
    "href",
    "/privacy.html",
  );

  await page.getByLabel("Email").fill("not-an-email");
  await page.getByLabel("Password").fill("123");
  await page.getByRole("button", { name: "Sign in →" }).click();
  await expect(page.locator("#auth-error")).toContainText(
    "Enter a valid email and a password with at least 6 characters.",
  );
  await expect(page.locator("#auth-error")).toHaveAttribute("role", "status");

  const languageToggle = page.locator("#language-toggle");
  await expect(languageToggle).toHaveAttribute(
    "aria-label",
    new RegExp(await languageToggle.innerText()),
  );

  await page.locator("#language-toggle").click();
  await expect(
    page.getByRole("heading", { name: "歡迎回來。" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "歡迎回來。" }),
  ).toBeVisible();
});

test("privacy policy is available without an account", async ({ page }) => {
  await page.goto("/privacy.html");
  await expect(
    page.getByRole("heading", { name: /Your data/ }),
  ).toBeVisible();
  await expect(page.getByText(/retained until you delete your account/i)).toBeVisible();
});

test("account network failures have a useful recoverable message", async ({ page }) => {
  await page.route("**/auth/v1/token**", (route) => route.abort("failed"));
  await page.goto("/");
  await page.getByLabel("Email").fill("audit-only@example.com");
  await page.getByLabel("Password").fill("audit-only-password");
  await page.getByRole("button", { name: "Sign in →" }).click();

  await expect(page.locator("#auth-error")).toHaveText(
    "Chef Jarvis cannot reach the account service right now. Please try again later.",
  );
  await expect(page.getByRole("button", { name: "Sign in →" })).toBeEnabled();
});

test("privacy policy follows the saved Chinese language", async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("chef-jarvis:language", "zh-TW"),
  );
  await page.goto("/privacy.html");

  await expect(page.locator("html")).toHaveAttribute("lang", "zh-TW");
  await expect(page).toHaveTitle("Chef Jarvis — 隱私與資料保留");
  await expect(
    page.getByRole("heading", { name: /你的資料/ }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "外部服務" })).toBeVisible();
  await expect(page.getByText(/Supabase 提供身分驗證與資料儲存/)).toBeVisible();
  await expect(page.getByText(/JSON 匯出檔下載後由你自行管理/)).toBeVisible();
});

test("public discovery metadata is available", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    /personalized AI cooking companion/,
  );

  const robots = await request.get("/robots.txt");
  expect(robots.ok()).toBeTruthy();
  await expect(robots.text()).resolves.toContain("User-agent: *");
});
