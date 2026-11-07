import { expect, test } from "@playwright/test";

test("creates a task, persists it through reload, and completes it", async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: /make room for what matters/i })).toBeVisible();

  const title = "Persisted DayFlow task " + Date.now();
  await page.getByRole("button", { name: "New task" }).click();
  await page.getByLabel("Title").fill(title);
  await page.getByRole("button", { name: "Save task" }).click();

  const taskVisible = page.getByText(title).first();
  try {
    await expect(taskVisible).toBeVisible({ timeout: 12_000 });
  } catch (error) {
    const body = await page.locator("body").innerText();
    throw new Error(
      "Task did not appear after save. Runtime errors: " + runtimeErrors.join(" | ") +
      "\\nVisible page content:\\n" + body,
      { cause: error }
    );
  }

  await page.reload();
  await expect(page.getByText(title).first()).toBeVisible();

  await page.getByRole("button", { name: "Complete: " + title }).click();
  await expect(page.getByRole("button", { name: "Reopen: " + title })).toBeVisible();
});
