import { expect, test, type WebSocketRoute } from "@playwright/test";
import { otherBuys, shot, stock } from "./helpers";

// AC14: the socket drops, a trade happens while it's down, and after reconnect it shows once without a reload
test("a trade made while offline appears once after reconnect", async ({ page }, info) => {
  let down = false;
  const open = new Set<WebSocketRoute>();
  await page.routeWebSocket(/\/ws$/, (ws) => {
    if (down) {
      ws.close();
      return;
    }
    open.add(ws);
    ws.connectToServer();
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Feed" })).toBeVisible();
  await expect.poll(() => open.size).toBeGreaterThan(0);
  await page.evaluate(() => {
    (window as unknown as { __noReload: boolean }).__noReload = true;
  });

  down = true;
  for (const ws of open) await ws.close();
  open.clear();

  const trade = await otherBuys(stock.address, "1");
  const row = page.locator(`[data-testid="feed-row"][data-id="${trade.id}"]`);
  await expect(row).toHaveCount(0);

  down = false;
  await expect(row).toHaveCount(1, { timeout: 30_000 });
  await page.waitForTimeout(1500);
  await expect(row).toHaveCount(1);
  expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true);
  await shot(page, info, "live-reconnect");
});
