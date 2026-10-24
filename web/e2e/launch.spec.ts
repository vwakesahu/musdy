import { expect, test } from "@playwright/test";
import { devLogin, ensureCash, shot } from "./helpers";

// AC6: launch a coin with a first buy, land on its page, it shows under new with its curve
test("launch a coin and find it under new", async ({ page }, info) => {
  const symbol = `T${Date.now().toString(36).slice(-5).toUpperCase()}`;
  await devLogin(page);
  await ensureCash(page);
  await page.goto("/launch");
  await page.getByLabel("Name").fill(`Test ${symbol}`);
  await page.getByLabel(/Ticker/).fill(symbol);
  await page.getByRole("button", { name: "$10", exact: true }).click();
  await expect(page.getByTestId("launch-preview")).toContainText(symbol);
  await shot(page, info, "launch-form");
  await page.getByTestId("launch-submit").click();
  // lands on the new coin's own page
  await page.waitForURL(/\/token\/0x[0-9a-fA-F]{40}$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: symbol })).toBeVisible();
  await expect(page.getByTestId("curve-progress")).toBeVisible();
  await shot(page, info, "launch-token");

  // and the explore list opens on New straight from the url
  await page.goto("/explore?sort=new");
  await expect(page.getByRole("tab", { name: "New" })).toHaveAttribute("aria-selected", "true");
  const row = page.getByTestId("token-row").filter({ hasText: symbol });
  await expect(row).toBeVisible();
  await expect(row.getByLabel(/Launch curve/)).toBeVisible();
  await shot(page, info, "launch-new");
});
