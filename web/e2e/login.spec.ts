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
