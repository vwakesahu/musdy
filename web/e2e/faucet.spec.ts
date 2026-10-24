import { expect, test, type Page } from "@playwright/test";
import { parseUnits } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { routes } from "shared";
import { dep, loginAs, shot, vaultBalance } from "./helpers";

// fresh dev key and fresh ip, the local server runs with TRUST_PROXY=1
async function freshIp(page: Page) {
  const ip = `10.${rand()}.${rand()}.${rand()}`;
  await page.route(`**${routes.faucet}`, (route) => route.continue({ headers: { ...route.request().headers(), "x-forwarded-for": ip } }));
}
const rand = () => Math.floor(Math.random() * 250) + 1;

async function openFaucet(page: Page) {
  await page.getByTestId("open-deposit").click();
  const button = page.getByRole("dialog").getByTestId("faucet");
  await expect(button).toBeVisible();
  return button;
}

test("faucet credits a fresh address, then explains the daily limit", async ({ page }, info) => {
  const key = generatePrivateKey();
  const fresh = privateKeyToAccount(key);
  await freshIp(page);
  await loginAs(page, key, "/portfolio");

  let button = await openFaucet(page);
  await page.getByRole("dialog").getByTestId("deposit-chain-mezo").click();
  await expect(page.getByRole("dialog").getByTestId("deposit-address")).toContainText(fresh.address);
  await page.getByRole("dialog").getByRole("button", { name: "Choose another chain" }).click();
  await expect(button).toHaveText(/Get 1,000 test MUSD/);
  const answer = page.waitForResponse((r) => r.url().endsWith(routes.faucet) && r.request().method() === "POST");
  await button.click();
  const first = await answer;
  const dialog = page.getByRole("dialog");

  const body = first.request().postDataJSON() as { address: string; issued: string; sig: string };
  expect(body.address.toLowerCase()).toBe(fresh.address.toLowerCase());
  expect(first.status()).toBe(200);
  await expect(dialog.locator('[data-toast="success"]')).toContainText("1,000 MUSD is on its way");
  await expect(button).toBeDisabled();
  await expect(button).toHaveText(/Claimed, next in about 24h/);
  await expect.poll(() => vaultBalance(fresh.address, dep.musd), { timeout: 40_000 }).toBe(parseUnits("1000", 18));
  await shot(page, info, "faucet");

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
