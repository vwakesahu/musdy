import { test, expect } from "@playwright/test";
// AC0: the app loads and the socket says hello. Replace with one spec per acceptance criterion in docs/spec.md.
test("loads and connects", async ({ page }) => {
  const msgs: string[] = [];
  page.on("websocket", (ws) => ws.on("framereceived", (f) => msgs.push(String(f.payload))));
  await page.goto("/");
  await expect(page).toHaveTitle(/.+/);
  await page.waitForTimeout(1500);
  expect(msgs.some((m) => m.includes('"welcome"'))).toBeTruthy();
});
