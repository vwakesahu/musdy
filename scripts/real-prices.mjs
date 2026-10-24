// fetches live Pyth prices; prints PRICE_<SYM> exports, or runs `-- <cmd>` with them set
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const FEEDS = {
  BTC: "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
  NVDA: "b1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593",
  TSLA: "16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1",
  GOOGL: "5a48c03e9b9cb337801073ed9d166817473697efff0d138874e0f6a33d6d5aa6",
  COIN: "fee33f2a978bf32dd6b662b65ba8083c6773b494f8401194ec1870c640860245",
  CRCL: "92b8527aabe59ea2b12230f7b532769b133ffb118dfbd48ff676f14b273f1365",
};

const YAHOO = { BTC: "BTC-USD", NVDA: "NVDA", TSLA: "TSLA", GOOGL: "GOOGL", COIN: "COIN", CRCL: "CRCL" };

const toWad = (price, expo) => {
  const p = BigInt(price);
  const shift = 18 + expo;
  return shift >= 0 ? p * 10n ** BigInt(shift) : p / 10n ** BigInt(-shift);
};

const fromPyth = async () => {
  const qs = Object.values(FEEDS).map((id) => `ids[]=${id}`).join("&");
  const headers = process.env.PYTH_API_KEY ? { Authorization: `Bearer ${process.env.PYTH_API_KEY}` } : {};
  const res = await fetch(`https://hermes.pyth.network/v2/updates/price/latest?${qs}&parsed=true`, { headers });
  if (!res.ok) throw new Error(`hermes ${res.status}`);
  const byId = new Map((await res.json()).parsed.map((p) => [p.id.replace(/^0x/, ""), p.price]));
  return Object.fromEntries(
    Object.entries(FEEDS).map(([sym, id]) => {
      const p = byId.get(id);
      if (!p) throw new Error(`no pyth price for ${sym}`);
      return [sym, { wad: toWad(p.price, p.expo).toString(), usd: Number(p.price) * 10 ** p.expo, at: p.publish_time, source: "pyth" }];
    }),
  );
};

const fromYahoo = async () => {
  const out = {};
  for (const [sym, ticker] of Object.entries(YAHOO)) {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=1d&interval=1d`, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) throw new Error(`yahoo ${sym} ${res.status}`);
    const meta = (await res.json()).chart.result[0].meta;
    const micros = Math.round(meta.regularMarketPrice * 1e6);
    out[sym] = { wad: toWad(micros, -6).toString(), usd: meta.regularMarketPrice, at: meta.regularMarketTime, source: "yahoo" };
  }
  return out;
};

// hermes started answering 401 without a key in 2026, so yahoo's public chart api is the keyless fallback
const prices = await fromPyth().catch((e) => {
  console.error(`pyth unavailable (${e.message}), using yahoo finance`);
  return fromYahoo();
});

const out = new URL("./real-prices.json", import.meta.url);
writeFileSync(out, JSON.stringify(prices, null, 2) + "\n");
const env = Object.fromEntries(Object.entries(prices).map(([s, p]) => [`PRICE_${s}`, p.wad]));
for (const [s, p] of Object.entries(prices)) console.error(`${s.padEnd(5)} $${p.usd.toFixed(2)} (${p.source})`);

const sep = process.argv.indexOf("--");
if (sep === -1) {
  for (const [k, v] of Object.entries(env)) console.log(`export ${k}=${v}`);
} else {
  const [cmd, ...args] = process.argv.slice(sep + 1);
  const r = spawnSync(cmd, args, { stdio: "inherit", env: { ...process.env, ...env } });
  process.exit(r.status ?? 1);
}
