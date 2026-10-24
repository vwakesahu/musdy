import { expect, test } from "@playwright/test";
import { devLogin, me, shot } from "./helpers";

test("login lands on the feed with an address and a balance", async ({ page }, info) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Feed" })).toBeVisible();
  await devLogin(page);
  await expect(page.getByTestId("balance-pill")).toHaveText(/\$\d/);
  await page.getByTestId("balance-pill").click();
  await expect(page.getByTestId("deposit-address")).toContainText(me.address);
  await shot(page, info, "login");
});

test("a chain mismatch refuses to sign", async ({ page }) => {
  await page.route("**/config", async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, json: { ...((await res.json()) as object), chainId: 31611 } });
  });
  await page.goto("/");
  await expect(page.getByTestId("config-error")).toContainText("server runs chain 31611");
  await page.getByRole("button", { name: "Log in" }).first().click();
  await expect(page.getByRole("dialog").getByTestId("login-config-error")).toBeVisible();
  await expect(page.getByTestId("dev-login")).toHaveCount(0);
  await expect(page.getByTestId("balance-pill")).toHaveCount(0);
});

test("Continue with Google starts Google OAuth, dev login still works", async ({ page }) => {
  test.skip(!process.env.NEXT_PUBLIC_PRIVY_APP_ID, "build has no Privy app id");
  await page.route(/accounts\.google\.com/, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<title>google</title>" }));
  await page.goto("/");
  await page.getByRole("button", { name: "Log in" }).first().click();
  const dialog = page.getByRole("dialog");
  const google = dialog.getByTestId("google-login");
  await expect(google).toHaveText("Continue with Google");
  await expect(dialog.getByTestId("dev-login")).toBeVisible();

  const init = page.waitForRequest((r) => /privy\.io\/api\/v1\/oauth\/init/.test(r.url()), { timeout: 20_000 });
  await google.click();
  const req = await init;
  expect(req.postDataJSON()).toMatchObject({ provider: "google" });
  await expect(page.locator("#privy-modal-content")).toHaveCount(0);
  await page.waitForURL(/accounts\.google\.com/, { timeout: 20_000 }).catch(() => undefined);

  await page.goto("/");
  await devLogin(page);
  await expect(page.getByTestId("balance-pill")).toHaveText(/\$\d/);
});
