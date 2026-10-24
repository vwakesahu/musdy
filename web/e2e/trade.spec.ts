import { expect, test } from "@playwright/test";
import { parseUnits } from "viem";
import { cashText, dep, devLogin, ensureCash, me, shot, stock, vaultBalance } from "./helpers";

test("buy and sell a stock from the sheet", async ({ page }, info) => {
  await devLogin(page);
  await ensureCash(page);
  await page.goto(`/token/${stock.address}`);
  await expect(page.getByTestId("open-buy")).toBeEnabled();

  const cash0 = await vaultBalance(me.address, dep.musd);
  const stock0 = await vaultBalance(me.address, stock.address);

  await page.getByTestId("open-buy").click();
  const sheet = page.getByTestId("trade-sheet");
  await sheet.getByRole("button", { name: "$10", exact: true }).click();
  await expect(page.getByTestId("trade-amount")).toHaveText("$10");
  await sheet.getByRole("button", { name: "Delete" }).click();
  await sheet.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByTestId("trade-amount")).toHaveText("$0");
  for (const k of ["1", "2", ".", "5"]) await sheet.getByRole("button", { name: k, exact: true }).click();
  await expect(page.getByTestId("trade-amount")).toHaveText("$12.5");
  await expect(page.getByTestId("trade-quote")).toContainText("Fee");
  await shot(page, info, "trade-sheet");
  await page.getByTestId("trade-submit").click();
  await expect(page.getByTestId("trade-success")).toContainText(`Bought $12.50 of ${stock.symbol}`, { timeout: 30_000 });

  await expect.poll(() => vaultBalance(me.address, dep.musd), { timeout: 30_000 }).toBe(cash0 - parseUnits("12.5", 18));
  const stock1 = await vaultBalance(me.address, stock.address);
  expect(stock1).toBeGreaterThan(stock0);
  await expect(page.getByTestId("position-block")).toBeVisible({ timeout: 30_000 });
  await shot(page, info, "trade-bought");
  await expect(page.getByTestId("trade-sheet")).toBeHidden({ timeout: 10_000 });

  const cash1 = await vaultBalance(me.address, dep.musd);
  await page.getByTestId("open-sell").click();
  await page.getByRole("button", { name: "100%" }).click();
  await expect(page.getByTestId("trade-quote")).toContainText("you get");
  const shown = await page.getByTestId("trade-amount").innerText();
  await page.getByTestId("trade-submit").click();
  await expect(page.getByTestId("trade-success")).toContainText(`Sold ${shown}`, { timeout: 30_000 });
  await shot(page, info, "trade-sold");

  await expect.poll(() => vaultBalance(me.address, stock.address), { timeout: 30_000 }).toBe(0n);
  expect(await vaultBalance(me.address, dep.musd)).toBeGreaterThan(cash1);
  await expect(page.getByTestId("position-block")).toHaveCount(0, { timeout: 30_000 });
  await page.goto("/");
  await expect.poll(async () => Number(await cashText(page))).toBeGreaterThan(Number(cash1 / 10n ** 16n) / 100);
});
