import { expect, test } from "@playwright/test";
import type { Address } from "viem";
import { devLogin, ensureCash, me, shot, vaultBalance } from "./helpers";

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
  const coin = page.url().split("/token/")[1] as Address;

  // the optional first buy happened: the creator holds the coin in the vault and the buy is a feed row
  await expect.poll(() => vaultBalance(me.address, coin), { timeout: 30_000 }).toBeGreaterThan(0n);
  const buy = page.locator(`[data-testid="feed-row"][data-user="${me.address.toLowerCase()}"][data-side="buy"]`).filter({ hasText: symbol });
  await expect(buy).toBeVisible({ timeout: 30_000 });
  await expect(buy).toContainText("$10.00");
  await shot(page, info, "launch-token");

  // and the explore list opens on New straight from the url
  await page.goto("/explore?sort=new");
  await expect(page.getByRole("tab", { name: "New" })).toHaveAttribute("aria-selected", "true");
  const row = page.getByTestId("token-row").filter({ hasText: symbol });
  await expect(row).toBeVisible();
  await expect(row.getByLabel(/Launch curve/)).toBeVisible();
  await shot(page, info, "launch-new");

  // and the global feed has the first buy
  await page.goto("/");
  await expect(page.locator(`[data-testid="feed-row"][data-user="${me.address.toLowerCase()}"]`).filter({ hasText: symbol }).first()).toBeVisible({ timeout: 30_000 });
});
