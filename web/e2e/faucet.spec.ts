import { expect, test, type Page } from "@playwright/test";
import { parseUnits } from "viem";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { faucetMessage, routes } from "shared";
import { dep, devLogin, shot, vaultBalance } from "./helpers";

// the dev key already claimed today, so the app's faucet request is re-signed for a brand new key
// from a fresh ip, which the local e2e server believes because it runs with TRUST_PROXY=1. the button, toasts and limit handling are the app's own, only the claimant changes
async function claimAs(page: Page, account: PrivateKeyAccount) {
  await page.route(`**${routes.faucet}`, async (route) => {
    const req = route.request();
    if (req.method() !== "POST") return route.continue();
    const issued = new Date().toISOString();
    const sig = await account.signMessage({ message: faucetMessage(account.address, issued) });
    const ip = `10.${rand()}.${rand()}.${rand()}`;
    await route.continue({
      headers: { ...req.headers(), "x-forwarded-for": ip },
      postData: JSON.stringify({ address: account.address, issued, sig }),
    });
  });
}
const rand = () => Math.floor(Math.random() * 250) + 1;

async function openFaucet(page: Page) {
  await page.getByTestId("open-deposit").click();
  const button = page.getByRole("dialog").getByTestId("faucet");
  await expect(button).toBeVisible();
  return button;
}

// AC3 from the web side: a fresh address gets 1,000 MUSD, a second claim shows the limit in words
test("faucet credits a fresh address, then explains the daily limit", async ({ page }, info) => {
  const fresh = privateKeyToAccount(generatePrivateKey());
  await devLogin(page, "/portfolio");
  // a remembered claim from an earlier run would disable the button
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (k.startsWith("musdy:faucet:")) localStorage.removeItem(k);
  });
  await claimAs(page, fresh);

  let button = await openFaucet(page);
  await expect(button).toHaveText(/Get 1,000 test MUSD/);
  const answer = page.waitForResponse((r) => r.url().endsWith(routes.faucet) && r.request().method() === "POST");
  await button.click();
  const first = await answer;
  const dialog = page.getByRole("dialog");

  expect(first.status()).toBe(200);
  await expect(dialog.locator('[data-toast="success"]')).toContainText("1,000 MUSD is on its way");
  await expect(button).toBeDisabled();
  await expect(button).toHaveText(/Claimed, next in about 24h/);
  await expect.poll(() => vaultBalance(fresh.address, dep.musd), { timeout: 40_000 }).toBe(parseUnits("1000", 18));
  await shot(page, info, "faucet");

  // forget the local claim so the button asks the server again, which refuses
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (k.startsWith("musdy:faucet:")) localStorage.removeItem(k);
  });
  button = await openFaucet(page);
  await expect(button).toBeEnabled();
  await button.click();
  const error = dialog.locator('[data-toast="error"]');
  await expect(error).toContainText("You already claimed test MUSD today");
  await expect(error).not.toContainText("faucet_limited");
  await expect(button).toBeDisabled();
  await expect(button).toHaveText(/Claimed, next in about 24h/);
  expect(await vaultBalance(fresh.address, dep.musd)).toBe(parseUnits("1000", 18));
  await shot(page, info, "faucet-limited");
});
