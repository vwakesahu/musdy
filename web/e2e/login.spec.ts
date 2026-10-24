import { expect, test } from "@playwright/test";
import { devLogin, me, shot } from "./helpers";

// AC1: dev login lands on the feed with a mezo address and a dollar balance
test("login lands on the feed with an address and a balance", async ({ page }, info) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Feed" })).toBeVisible();
  await devLogin(page);
  await expect(page.getByTestId("balance-pill")).toHaveText(/\$\d/);
  await page.getByTestId("balance-pill").click();
  await expect(page.getByTestId("deposit-address")).toContainText(me.address);
  await shot(page, info, "login");
});

// a server on another chain gets a config error and no signer of any kind, dev included
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
