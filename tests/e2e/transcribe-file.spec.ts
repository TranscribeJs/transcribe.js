import { test, expect } from "@playwright/test";

test("transcribe file", async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("/examples/index.html");

  await page.getByRole("button", { name: "Start" }).click();

  await expect(page.locator(".result")).toContainText(
    "And so my fellow Americans ask not what your country can do for you, ask what you can do for your country."
  );
});

// need to investigate why this fails in browserstack, maybe due to timeout issues
test.skip("cancel transcribing file", async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("/examples/index.html");

  await page.getByRole("button", { name: "Start" }).click();
  await page.waitForTimeout(100);
  await page.getByRole("button", { name: "Cancel" }).click();

  await expect(page.locator("body")).toContainText(
    "call onCanceled in thread "
  );
});
