import { test, expect } from "@playwright/test";

test("document-root extension compatibility smoke check", async ({ page }) => {
  const hydrationErrors: string[] = [];
  page.on("console", (message) => {
    if (/hydrat/i.test(message.text())) hydrationErrors.push(message.text());
  });
  // Simulate the reported root attributes. This is a compatibility smoke check;
  // the installed extension itself is not available in this browser.
  await page.route("http://localhost:3000/", async (route) => {
    const response = await route.fetch();
    const html = await response.text();
    await route.fulfill({
      response,
      body: html.replace(
        '<html lang="en"',
        '<html lang="en" data-lt-installed="true" suppresshydrationwarning="true"',
      ),
    });
  });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
  await expect(page.locator("html")).toHaveAttribute(
    "data-lt-installed",
    "true",
  );
  expect(hydrationErrors).toEqual([]);
});
