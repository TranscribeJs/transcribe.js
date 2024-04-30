import { test, expect } from "@playwright/test";

test("transcribe file", async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("/examples/index.html");

  await page.getByRole("button", { name: "Start" }).click();

  await expect(page.locator(".result")).toContainText(
    "And so my fellow Americans ask not what your country can do for you, ask what you can do for your country."
  );
});

test("cancel transcribing file", async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("/examples/index.html");

  await page.getByRole("button", { name: "Start" }).click();
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: "Cancel" }).click();

  await expect(page.locator("body")).toContainText(
    "call onCanceled in thread "
  );
});
