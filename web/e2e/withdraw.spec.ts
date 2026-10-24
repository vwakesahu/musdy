import { expect, test } from "@playwright/test";
import { devLogin, ensureCash, other, shot } from "./helpers";

// AC12: withdraw MUSD to any address, gasless. curve coins say why they can't leave
test("withdraw MUSD to another address", async ({ page }, info) => {
  await devLogin(page, "/portfolio");
  await ensureCash(page);
  await page.getByTestId("open-withdraw").click();
  await page.getByRole("button", { name: /MUSD/ }).click();
  await page.getByPlaceholder("0", { exact: true }).fill("1");
  await page.getByPlaceholder("0x…").fill(other.address);
  await shot(page, info, "withdraw-sheet");
  await page.getByRole("button", { name: "Withdraw MUSD" }).click();
  await expect(page.getByText("Withdrawal sent")).toBeVisible({ timeout: 30_000 });
  await shot(page, info, "withdraw-done");
});
