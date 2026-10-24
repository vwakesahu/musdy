import { expect, test } from "@playwright/test";
import { devLogin, other, otherBuys, shot, stock } from "./helpers";

// AC11: set a handle, follow a trader, the following feed shows their trades
test("set a handle and follow a trader", async ({ page }, info) => {
  const handle = `e2e_${Date.now().toString(36).slice(-6)}`;
  await devLogin(page, "/profile");
  await page.getByTestId("edit-handle").click();
  await page.getByLabel("Handle").fill(handle);
  await page.getByTestId("save-handle").click();
  await expect(page.getByTestId("profile-name")).toHaveText(handle);
  await shot(page, info, "profile");

  await page.goto(`/u/${other.address}`);
  await page.getByTestId("follow").click();
  await expect(page.getByTestId("follow")).toHaveText("Following");
  await otherBuys(stock.address, "2");
  await page.goto("/");
  await page.getByRole("tab", { name: "Following" }).click();
  await expect(page.getByTestId("feed-row").first()).toBeVisible({ timeout: 30_000 });
  await shot(page, info, "following");
});
