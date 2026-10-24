import { expect, test } from "@playwright/test";
import { parseUnits } from "viem";
import { cashText, dep, devLogin, me, sendWalletBtc, sendWalletMusd, shot, vaultBalance, walletBalance } from "./helpers";

const BTC_RESERVE = parseUnits("0.00002", 18);

test("wallet MUSD is auto deposited into the balance", async ({ page }, info) => {
  await devLogin(page, "/portfolio");
  const before = Number(await cashText(page));
  await sendWalletMusd(me.address, "25");
  await expect.poll(async () => Number(await cashText(page)), { timeout: 40_000 }).toBeGreaterThanOrEqual(before + 25);
  await shot(page, info, "deposit");
});

test("wallet BTC is auto deposited into the vault, keeping a gas reserve", async ({ page }, info) => {
  await devLogin(page, "/portfolio");
  const before = await vaultBalance(me.address, dep.btc);
  const wallet0 = await walletBalance(dep.btc, me.address);
  await sendWalletBtc(me.address, "0.01");
  const total = wallet0 + parseUnits("0.01", 18);
  const swept = total > BTC_RESERVE ? total - BTC_RESERVE : 0n;
  await expect.poll(() => vaultBalance(me.address, dep.btc), { timeout: 40_000 }).toBe(before + swept);
  expect(await walletBalance(dep.btc, me.address)).toBe(total - swept);
  await shot(page, info, "deposit-btc");
});

