import { expect, test } from "@playwright/test";
import { cashText, dep, devLogin, ensureCash, me, nextTrade, other, otherBuys, rowDollars, rowName, setCash, shot, stock, tradeAs, userTrades, vaultBalance } from "./helpers";

test("copy a trade from the feed", async ({ page }, info) => {
  await devLogin(page);
  await ensureCash(page);
  const copied = await otherBuys(stock.address, "3");
  const row = page.locator(`[data-testid="feed-row"][data-id="${copied.id}"]`);
  await expect(row).toBeVisible({ timeout: 30_000 });

  const before = await userTrades(me.address);
  await row.getByTestId("copy-trade").click();
  const mine = await nextTrade(me.address, before);

  expect(mine.isBuy).toBe(true);
  expect(mine.ref?.address.toLowerCase()).toBe(other.address.toLowerCase());
  expect(mine.token.address.toLowerCase()).toBe(copied.token.address.toLowerCase());
  expect(BigInt(mine.musdAmount)).toBe(BigInt(copied.musdAmount));

  const myRow = page.locator(`[data-testid="feed-row"][data-id="${mine.id}"]`);
  await expect(myRow).toBeVisible({ timeout: 30_000 });
  await expect(myRow).toContainText(rowName(mine.user));
  await expect(myRow).toContainText(rowDollars(mine));
  expect(rowDollars(mine)).toBe("$3.00");
  await expect(myRow).toContainText(`copied ${rowName(copied.user)}`);
  await expect(myRow).toContainText(stock.symbol);
  await shot(page, info, "copy");
});

test("copy is capped to cash", async ({ page }) => {
  await devLogin(page);
  await setCash(me, "2");
  await expect.poll(async () => Number(await cashText(page)), { timeout: 30_000 }).toBe(2);
  const cash = await vaultBalance(me.address, dep.musd);
  const copied = await otherBuys(stock.address, "5");
  expect(BigInt(copied.musdAmount)).toBeGreaterThan(cash);
  const row = page.locator(`[data-testid="feed-row"][data-id="${copied.id}"]`);
  await expect(row).toBeVisible({ timeout: 30_000 });

  const before = await userTrades(me.address);
  await row.getByTestId("copy-trade").click();
  const mine = await nextTrade(me.address, before);
  expect(BigInt(mine.musdAmount)).toBe(cash);
  expect(mine.ref?.address.toLowerCase()).toBe(other.address.toLowerCase());
});

test("sell rows have no copy button", async ({ page }) => {
  await otherBuys(stock.address, "2");
  const held = await vaultBalance(other.address, stock.address);
  await page.goto("/feed");
  await expect(page.getByRole("heading", { name: "Feed" })).toBeVisible();
  const sold = await tradeAs(other, stock.address, false, held / 2n);
  const row = page.locator(`[data-testid="feed-row"][data-id="${sold.id}"]`);
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(row).toHaveAttribute("data-side", "sell");
  await expect(row).toContainText("Sell");
  await expect(row.getByTestId("copy-trade")).toHaveCount(0);
});
