import { expect, test } from "@playwright/test";
import { LeaderRow, Profile, TokenInfo, routes, type PnlWindow } from "shared";
import type { Address } from "viem";
import { signedUsd, usd } from "../src/lib/format";
import { buyAs, devLogin, launchAs, me, other, SERVER, shot, third } from "./helpers";

async function getJson(path: string) {
  const res = await fetch(SERVER + path);
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return (await res.json()) as unknown;
}

// a coin page updates its price and curve while someone else buys, no navigation
test("a launched coin's price and curve move live", async ({ page }, info) => {
  const symbol = `L${Date.now().toString(36).slice(-5).toUpperCase()}`;
  await launchAs(other, symbol, "5");
  let token: Address | undefined;
  await expect
    .poll(
      async () => {
        const list = TokenInfo.array().parse(await getJson(`${routes.tokens}?sort=new`));
        token = list.find((t) => t.symbol === symbol)?.address;
        return !!token;
      },
      { timeout: 30_000 },
    )
    .toBe(true);

  await page.goto(`/token/${token}`);
  const priceEl = page.getByTestId("token-price");
  const curve = page.getByTestId("curve-progress").getByLabel(/Launch curve/);
  await expect(priceEl).toHaveText(/\$/);
  await expect(curve).toBeVisible();
  const price0 = await priceEl.innerText();
  const curve0 = await curve.getAttribute("aria-label");
  await page.evaluate(() => {
    (window as unknown as { __stay: boolean }).__stay = true;
  });

  await buyAs(third, token as Address, "150");
  await expect(priceEl).not.toHaveText(price0, { timeout: 30_000 });
  await expect(curve).not.toHaveAttribute("aria-label", curve0 ?? "", { timeout: 30_000 });
  expect(await page.evaluate(() => (window as unknown as { __stay?: boolean }).__stay)).toBe(true);
  await shot(page, info, "live-price");
});

// every portfolio row shows what /users/:address says, to the cent
test("portfolio rows match the server's positions", async ({ page }) => {
  await devLogin(page, "/portfolio");
  await expect
    .poll(
      async () => {
        const p = Profile.parse(await getJson(routes.user.replace(":address", me.address)));
        const held = p.positions.filter((x) => BigInt(x.amount) > 0n);
        if (held.length === 0) return "no positions";
        const bad: string[] = [];
        for (const x of held) {
          const row = page.locator(`[data-testid="position-row"][data-token="${x.token.address.toLowerCase()}"]`);
          if ((await row.count()) !== 1) {
            bad.push(`${x.token.symbol} missing`);
            continue;
          }
          const [cost, value, pnl] = await Promise.all(["position-cost", "position-value", "position-pnl"].map((id) => row.getByTestId(id).innerText()));
          if (cost !== usd(BigInt(x.costMusd))) bad.push(`${x.token.symbol} cost ${cost} vs ${usd(BigInt(x.costMusd))}`);
          if (value !== usd(BigInt(x.valueMusd))) bad.push(`${x.token.symbol} value ${value} vs ${usd(BigInt(x.valueMusd))}`);
          if (pnl !== signedUsd(BigInt(x.pnlMusd))) bad.push(`${x.token.symbol} pnl ${pnl} vs ${signedUsd(BigInt(x.pnlMusd))}`);
        }
        return bad.join("; ") || "ok";
      },
      { timeout: 30_000 },
    )
    .toBe("ok");
});

// each leaderboard window shows that window's ranking
test("leaderboard tabs switch data", async ({ page }) => {
  await page.goto("/leaderboard");
  const tabs: [string, PnlWindow][] = [
    ["7d", "d7"],
    ["All time", "all"],
    ["24h", "d1"],
  ];
  for (const [label, win] of tabs) {
    // 24h loaded first, the other two are fetched when their tab is picked
    const asked = win === "d1" ? null : page.waitForRequest((r) => r.url().includes(`${routes.leaderboard}?window=${win}`));
    await page.getByRole("tab", { name: label }).click();
    await asked;
    await expect(page.getByRole("tab", { name: label })).toHaveAttribute("aria-selected", "true");
    await expect
      .poll(
        async () => {
          const rows = LeaderRow.array().parse(await getJson(`${routes.leaderboard}?window=${win}`));
          const ui = page.locator("ul [data-testid=leader-row]");
          const shown = await ui.evaluateAll((els) => els.map((e) => [e.getAttribute("data-user"), e.querySelector("[data-testid=leader-pnl]")?.textContent ?? ""]));
          const want = rows.map((r) => [r.user.address.toLowerCase(), signedUsd(BigInt(r.pnlMusd))]);
          return JSON.stringify(shown) === JSON.stringify(want) ? "ok" : `${win}: ${JSON.stringify(shown.slice(0, 3))} vs ${JSON.stringify(want.slice(0, 3))}`;
        },
        { timeout: 20_000 },
      )
      .toBe("ok");
  }
});
