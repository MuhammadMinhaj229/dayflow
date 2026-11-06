import { expect, test } from "@playwright/test";

test("creates a task, persists it through reload, and completes it", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /make room for what matters/i })).toBeVisible();

  const title = "Persisted DayFlow task " + Date.now();
  await page.getByRole("button", { name: "New task" }).click();
  await page.getByLabel("Title").fill(title);
  await page.getByRole("button", { name: "Save task" }).click();

  await expect(page.getByText(title)).toBeVisible();
  await page.reload();
  await expect(page.getByText(title)).toBeVisible();

  await page.getByRole("button", { name: "Complete: " + title }).click();
  await expect(page.getByRole("button", { name: "Reopen: " + title })).toBeVisible();
});
