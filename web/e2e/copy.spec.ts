import { expect, test } from "@playwright/test";
import { dep, devLogin, ensureCash, me, nextTrade, other, otherBuys, shot, stock, userTrades, vaultBalance } from "./helpers";

// AC9: copy buys the same coin for the same dollars (capped to cash), with ref set to the copied trader
test("copy a trade from the feed", async ({ page }, info) => {
  await devLogin(page);
  await ensureCash(page);
  const copied = await otherBuys(stock.address, "3");
  const row = page.locator(`[data-testid="feed-row"][data-id="${copied.id}"]`);
  await expect(row).toBeVisible({ timeout: 30_000 });

  const before = await userTrades(me.address);
  const cash = await vaultBalance(me.address, dep.musd);
  await row.getByTestId("copy-trade").click();
  const mine = await nextTrade(me.address, before);

  const want = BigInt(copied.musdAmount);
  expect(mine.isBuy).toBe(true);
  expect(mine.ref?.address.toLowerCase()).toBe(other.address.toLowerCase());
  expect(mine.token.address.toLowerCase()).toBe(copied.token.address.toLowerCase());
  expect(BigInt(mine.musdAmount)).toBe(want < cash ? want : cash);

  const myRow = page.locator(`[data-testid="feed-row"][data-id="${mine.id}"]`);
  await expect(myRow).toContainText("copied", { timeout: 30_000 });
  await expect(myRow).toContainText(stock.symbol);
  await shot(page, info, "copy");
});

// a sell can't be copied, its row has no copy button
test("sell rows have no copy button", async ({ page }) => {
  await page.goto("/");
  const sells = page.locator('[data-testid="feed-row"][data-side="sell"]');
  await page.waitForTimeout(1500);
  for (const r of await sells.all()) await expect(r.getByTestId("copy-trade")).toHaveCount(0);
});
