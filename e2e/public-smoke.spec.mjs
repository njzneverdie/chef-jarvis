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
