import { expect, test } from "@playwright/test";
import type { Address } from "viem";
import { devLogin, ensureCash, me, shot, vaultBalance } from "./helpers";

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
  await page.waitForURL(/\/token\/0x[0-9a-fA-F]{40}$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: symbol })).toBeVisible();
  await expect(page.getByTestId("curve-progress")).toBeVisible();
  const coin = page.url().split("/token/")[1] as Address;

  await expect.poll(() => vaultBalance(me.address, coin), { timeout: 30_000 }).toBeGreaterThan(0n);
  const buy = page.locator(`[data-testid="feed-row"][data-user="${me.address.toLowerCase()}"][data-side="buy"]`).filter({ hasText: symbol });
  await expect(buy).toBeVisible({ timeout: 30_000 });
  await expect(buy).toContainText("$10.00");
  await shot(page, info, "launch-token");

  await page.goto("/explore?sort=new");
  await expect(page.getByRole("tab", { name: "New" })).toHaveAttribute("aria-selected", "true");
  const row = page.getByTestId("token-row").filter({ hasText: symbol });
  await expect(row).toBeVisible();
  await expect(row.getByLabel(/Launch curve/)).toBeVisible();
  await shot(page, info, "launch-new");

  await page.goto("/");
  await expect(page.locator(`[data-testid="feed-row"][data-user="${me.address.toLowerCase()}"]`).filter({ hasText: symbol }).first()).toBeVisible({ timeout: 30_000 });
});
