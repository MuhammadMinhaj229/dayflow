import { test, expect } from "@playwright/test";

test("renders the daily command center", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Your plan")).toBeVisible();
  await expect(page.getByText("Glance view")).toBeVisible();
});

test("adds a task to the preview planner", async ({ page }) => {
  await page.goto("/");
  const input = page.getByLabel("New task title");
  await input.fill("Review the project architecture");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText("Review the project architecture")).toBeVisible();
});

test("marks a task complete", async ({ page }) => {
  await page.goto("/");
  const task = page.getByText("Build the Noman Brothers website foundation");
  await expect(task).toBeVisible();
  await page.getByRole("button", { name: "Complete Build the Noman Brothers website foundation" }).click();
  await expect(page.getByRole("button", { name: "Reopen Build the Noman Brothers website foundation" })).toBeVisible();
});
