import { expect, test } from "@playwright/test";

test("creates a task, persists it through reload, and completes it offline", async ({ page, context }) => {
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

  const serviceWorkerState = await page.evaluate(async () => {
    const supported = "serviceWorker" in navigator;
    if (!supported) return { supported, secureContext: window.isSecureContext, registrations: [], controller: null };
    const registrations = await navigator.serviceWorker.getRegistrations();
    return {
      supported,
      secureContext: window.isSecureContext,
      registrations: registrations.map((registration) => ({
        scope: registration.scope,
        installing: registration.installing?.state ?? null,
        waiting: registration.waiting?.state ?? null,
        active: registration.active?.state ?? null,
        activeScript: registration.active?.scriptURL ?? null
      })),
      controller: navigator.serviceWorker.controller?.scriptURL ?? null
    };
  });

  expect(
    serviceWorkerState.supported,
    "Service workers must be supported in the production preview: " + JSON.stringify(serviceWorkerState)
  ).toBe(true);
  expect(
    serviceWorkerState.registrations.length,
    "DayFlow did not register a service worker: " + JSON.stringify(serviceWorkerState) +
    " Runtime errors: " + runtimeErrors.join(" | ")
  ).toBeGreaterThan(0);

  await expect.poll(async () => page.evaluate(async () => {
    const registrations = await navigator.serviceWorker.getRegistrations();
    return registrations.some((registration) => registration.active?.state === "activated");
  }), { timeout: 20_000, intervals: [250, 500, 1000] }).toBe(true);

  // The first document may have loaded before the service worker activated.
  // Navigate once while online so the active worker takes control of this page.
  await page.reload();
  await expect(page.getByRole("heading", { name: /make room for what matters/i })).toBeVisible();

  await expect.poll(async () => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), {
    timeout: 20_000,
    intervals: [250, 500, 1000]
  }).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: /make room for what matters/i })).toBeVisible();
  try {
    await expect(page.getByText(title).first()).toBeVisible({ timeout: 15_000 });
  } catch (error) {
    const body = await page.locator("body").innerText();
    throw new Error(
      "The app shell loaded offline but the locally stored task did not return. Runtime errors: " +
      runtimeErrors.join(" | ") + "\\nVisible page content:\\n" + body,
      { cause: error }
    );
  }
  await expect(page.locator(".connection-pill.offline")).toBeVisible();

  await page.getByRole("button", { name: "Complete: " + title }).click();
  await expect(page.getByRole("button", { name: "Reopen: " + title })).toBeVisible();
});
