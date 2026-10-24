import { expect, test } from "@playwright/test";
import { devLogin, ensureCash, otherBuys, shot, stock } from "./helpers";

// AC9: copy buys the same coin for the same dollars, and the feed says who was copied
test("copy a trade from the feed", async ({ page }, info) => {
  await devLogin(page);
  await ensureCash(page);
  await otherBuys(stock.address, "3");
  const row = page.getByTestId("feed-row").filter({ hasText: stock.symbol }).filter({ has: page.getByTestId("copy-trade") }).first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.getByTestId("copy-trade").click();
  await expect(page.getByTestId("feed-row").filter({ hasText: "copied" }).first()).toBeVisible({ timeout: 30_000 });
  await shot(page, info, "copy");
});
