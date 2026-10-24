import { expect, test } from "@playwright/test";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { parseUnits } from "viem";
import { dep, devLogin, ensureCash, launchAs, me, shot, walletBalance } from "./helpers";

// AC12: withdraw MUSD to any address, gasless, and the recipient gets exactly that amount on chain
test("withdraw MUSD to another address", async ({ page }, info) => {
  const to = privateKeyToAccount(generatePrivateKey()).address;
  await devLogin(page, "/portfolio");
  await ensureCash(page);
  const before = await walletBalance(dep.musd, to);
  await page.getByTestId("open-withdraw").click();
  await page.getByTestId("withdraw-asset").filter({ hasText: "MUSD" }).click();
  await page.getByPlaceholder("0", { exact: true }).fill("1");
  await page.getByPlaceholder("0x…").fill(to);
  await shot(page, info, "withdraw-sheet");
  await page.getByRole("button", { name: "Withdraw MUSD" }).click();
  await expect(page.getByText("Withdrawal sent")).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => walletBalance(dep.musd, to), { timeout: 30_000 }).toBe(before + parseUnits("1", 18));
  await shot(page, info, "withdraw-done");
});

// a coin still on its launch curve is not a choice, it's one muted line
test("curve coins show the locked line", async ({ page }, info) => {
  const symbol = `W${Date.now().toString(36).slice(-5).toUpperCase()}`;
  await launchAs(me, symbol, "5");
  await devLogin(page, "/portfolio");
  await expect(page.getByTestId("position-row").filter({ hasText: symbol })).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("open-withdraw").click();
  await expect(page.getByTestId("withdraw-curve-locked")).toContainText(/still on (its|their) launch curve/);
  await expect(page.getByTestId("withdraw-asset").filter({ hasText: symbol })).toHaveCount(0);
  await shot(page, info, "withdraw-locked");
});
