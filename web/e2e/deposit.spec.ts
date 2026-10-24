import { expect, test } from "@playwright/test";
import { cashText, devLogin, me, sendWalletMusd, shot } from "./helpers";

// AC2: MUSD that lands in the user's own address is swept into the vault silently
test("wallet MUSD is auto deposited into the balance", async ({ page }, info) => {
  await devLogin(page, "/portfolio");
  const before = Number(await cashText(page));
  await sendWalletMusd(me.address, "25");
  await expect.poll(async () => Number(await cashText(page)), { timeout: 40_000 }).toBeGreaterThanOrEqual(before + 25);
  await shot(page, info, "deposit");
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
