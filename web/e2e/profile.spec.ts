import { expect, test } from "@playwright/test";
import { buyAs, devLogin, other, shot, stock, third } from "./helpers";

// AC11: set a handle, follow a trader, the following feed shows their trades and only theirs
test("set a handle and follow a trader", async ({ page }, info) => {
  const handle = `e2e_${Date.now().toString(36).slice(-6)}`;
  await devLogin(page, "/profile");
  await page.getByTestId("edit-handle").click();
  await page.getByLabel("Handle").fill(handle);
  await page.getByTestId("save-handle").click();
  await expect(page.getByTestId("profile-name")).toHaveText(handle);
  await shot(page, info, "profile");

  await page.goto(`/u/${other.address}`);
  await expect(page.getByTestId("follow")).toBeVisible();
  // someone else's profile is a drill in: back chevron, their name, and the Profile tab stays dark
  await expect(page.getByRole("button", { name: "Back" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(await page.getByTestId("profile-name").innerText());
  await expect(page.getByRole("link", { name: "Profile" })).not.toHaveAttribute("aria-current", "page");
  // a repeat run may already follow them, the button starts from followedByViewer
  const follow = page.getByTestId("follow");
  await expect(follow).toHaveText(/^Follow(ing)?$/);
  if ((await follow.innerText()) === "Follow") await follow.click();
  await expect(page.getByTestId("follow")).toHaveText("Following");

  // a repeat run may follow the third key from elsewhere, make sure it isn't
  await page.goto(`/u/${third.address}`);
  await expect(page.getByTestId("follow")).toHaveText(/^Follow(ing)?$/);
  if ((await page.getByTestId("follow").innerText()) === "Following") await page.getByTestId("follow").click();
  await expect(page.getByTestId("follow")).toHaveText("Follow");

  await page.goto("/");
  await page.getByRole("tab", { name: "Following" }).click();
  const theirs = await buyAs(other, stock.address, "2");
  const stranger = await buyAs(third, stock.address, "2");
  const rows = page.getByTestId("feed-row");
  await expect(page.locator(`[data-testid="feed-row"][data-id="${theirs.id}"]`)).toBeVisible({ timeout: 30_000 });
  // the third key's trade is indexed, give the socket a moment to (wrongly) deliver it
  await page.waitForTimeout(3000);
  await expect(page.locator(`[data-testid="feed-row"][data-id="${stranger.id}"]`)).toHaveCount(0);
  for (const user of await rows.evaluateAll((els) => els.map((e) => e.getAttribute("data-user")))) expect(user).toBe(other.address.toLowerCase());
  await shot(page, info, "following");
});
