import { expect, test } from "@playwright/test";
import { devLogin, ensureCash, shot, stock } from "./helpers";

// AC4 and AC5: buy $10 from the sheet, then sell 100% back to MUSD
test("buy and sell a stock from the sheet", async ({ page }, info) => {
  await devLogin(page);
  await ensureCash(page);
  await page.goto(`/token/${stock.address}`);
  await page.getByTestId("open-buy").click();
  await page.getByRole("button", { name: "$10", exact: true }).click();
  await expect(page.getByTestId("trade-quote")).toContainText("Fee");
  await shot(page, info, "trade-sheet");
  await page.getByTestId("trade-submit").click();
  await expect(page.getByTestId("trade-success")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("position-block")).toBeVisible();
  await shot(page, info, "trade-bought");

  await page.getByTestId("open-sell").click();
  await page.getByRole("button", { name: "100%" }).click();
  await expect(page.getByTestId("trade-quote")).toContainText("you get");
  await page.getByTestId("trade-submit").click();
  await expect(page.getByTestId("trade-success")).toBeVisible({ timeout: 30_000 });
  await shot(page, info, "trade-sold");
});
