import { expect, test } from "@playwright/test";

test("visiting privacy does not replace the offline app shell", async ({
  context,
  page,
}) => {
  test.skip(
    Boolean(process.env.CHEF_E2E_BASE_URL),
    "The service-worker cache regression runs against the current local build.",
  );

  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);

  await page.goto("/privacy.html");
  await expect(page.getByRole("heading", { name: /Your data/ })).toBeVisible();

  await context.setOffline(true);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Your data/ })).toHaveCount(0);
});
