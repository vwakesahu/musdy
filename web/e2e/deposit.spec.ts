import { expect, test } from "@playwright/test";
import { parseUnits } from "viem";
import { cashText, dep, devLogin, me, sendWalletBtc, sendWalletMusd, shot, vaultBalance } from "./helpers";

// AC2: MUSD that lands in the user's own address is swept into the vault silently
test("wallet MUSD is auto deposited into the balance", async ({ page }, info) => {
  await devLogin(page, "/portfolio");
  const before = Number(await cashText(page));
  await sendWalletMusd(me.address, "25");
  await expect.poll(async () => Number(await cashText(page)), { timeout: 40_000 }).toBeGreaterThanOrEqual(before + 25);
  await shot(page, info, "deposit");
});

// AC2 for BTC: the app signs a permit against the precompile shaped BTC and the vault takes it
test("wallet BTC is auto deposited into the vault", async ({ page }, info) => {
  await devLogin(page, "/portfolio");
  const before = await vaultBalance(me.address, dep.btc);
  await sendWalletBtc(me.address, "0.01");
  await expect.poll(() => vaultBalance(me.address, dep.btc), { timeout: 40_000 }).toBeGreaterThanOrEqual(before + parseUnits("0.01", 18));
  await shot(page, info, "deposit-btc");
});

// AC3 from the web side: the faucet button credits the vault
test("faucet button adds test MUSD", async ({ page }, info) => {
  await devLogin(page, "/portfolio");
  const before = Number(await cashText(page));
  await page.getByTestId("open-deposit").click();
  await page.getByTestId("faucet").click();
  const toast = page.getByRole("dialog").locator("[data-toast]").first();
  await expect(toast).toBeVisible();
  await shot(page, info, "faucet");
  // the faucet is once per 24h per address, a repeat run must show the server's reason instead
  if ((await toast.getAttribute("data-toast")) === "error") {
    await expect(page.getByRole("dialog").getByRole("alert")).not.toBeEmpty();
    return;
  }
  await expect(page.getByRole("dialog").getByRole("status").first()).toBeVisible();
  await expect.poll(async () => Number(await cashText(page)), { timeout: 40_000 }).toBeGreaterThan(before);
});
