import { expect, test } from "@playwright/test";
import { otherBuys, shot, stock } from "./helpers";

// AC8: someone else's trade shows on the global feed within a block, live
test("a new trade slides into the global feed", async ({ page }, info) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Feed" })).toBeVisible();
  await page.waitForTimeout(1500);
  const before = await page.getByTestId("feed-row").count();
  await otherBuys(stock.address, "5");
  await expect.poll(() => page.getByTestId("feed-row").count(), { timeout: 30_000 }).toBeGreaterThan(before);
  await expect(page.getByTestId("feed-row").first()).toContainText(stock.symbol);
  await expect(page.getByTestId("feed-row").first()).toContainText("Buy");
  await shot(page, info, "feed");
});
