import { expect, test } from "@playwright/test";
import { otherBuys, rowDollars, rowName, shot, stock } from "./helpers";

test("a new trade slides into the global feed", async ({ page }, info) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Feed" })).toBeVisible();
  await page.waitForTimeout(1500);
  const item = await otherBuys(stock.address, "5");
  const row = page.locator(`[data-testid="feed-row"][data-id="${item.id}"]`);
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("feed-row").first()).toHaveAttribute("data-id", item.id);
  await expect(row).toContainText(rowName(item.user));
  await expect(row).toContainText("Buy");
  await expect(row).toContainText(stock.symbol);
  await expect(row).toContainText(rowDollars(item));
  expect(rowDollars(item)).toBe("$5.00");
  await expect(row.getByTestId("since-buy")).toHaveText(/\d+\.\d{2}%/);
  await shot(page, info, "feed");
});
