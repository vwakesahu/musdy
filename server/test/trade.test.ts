import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { erc20Abi } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import type { Address, FeedItem, Quote, TokenInfo } from "shared";
import { WAD } from "../src/pricing";
import { CONTRACTS_READY, SKIP_NOTE, startStack, type Stack } from "./helpers/anvil";
import { Actor, get, post } from "./helpers/actors";

describe.skipIf(!CONTRACTS_READY)(`trade, withdraw and launch through the relayer${SKIP_NOTE}`, () => {
  let s: Stack;
  let a: Actor;
  let nvda: `0x${string}`;
  const relayerNonce = () => a.pub.getTransactionCount({ address: privateKeyToAccount(s.env.RELAYER_KEY).address });

  beforeAll(async () => {
    s = await startStack();
    nvda = s.dep.tokens.find((t) => t.symbol === "NVDA")!.address;
    a = await Actor.create(s);
    await a.faucet();
  }, 120000);
  afterAll(async () => s && (await s.stop()));

  test("quote and nonce read the vault", async () => {
    const q = await get<Quote>(s.app.url, `/quote?token=${nvda}&isBuy=true&amountIn=${100n * WAD}`);
    expect(q.status).toBe(200);
    expect(q.body.fee).toBe((WAD / 2n).toString());
    expect(q.body.venue).toBe("pool");
    expect(q.body.priceImpact).toBeGreaterThanOrEqual(0);
    expect((await get<{ nonce: string }>(s.app.url, `/nonce/${a.address}`)).body.nonce).toBe("0");
  });

  test("buy then sell: cash drops, the position appears, the feed has both", async () => {
    const before = await a.vaultBalance(s.dep.musd);
    await a.trade(nvda, true, 100n * WAD);
    expect(await a.vaultBalance(s.dep.musd)).toBe(before - 100n * WAD);
    const held = await a.vaultBalance(nvda);
    expect(held > 0n).toBe(true);
    const bal = await a.socket.next((m) => m.type === "balances" && m.vault.some((v) => v.token === nvda));
    expect(bal.type === "balances" && bal.vault.find((v) => v.token === nvda)?.amount).toBe(held.toString());

    await a.trade(nvda, false, held / 2n);
    const trades = (await get<FeedItem[]>(s.app.url, `/users/${a.address}/trades`)).body;
    expect(trades.map((t) => t.isBuy)).toEqual([false, true]);
    expect(trades[1]!.musdAmount).toBe((100n * WAD).toString());
    expect(trades[0]!.venue).toBe("pool");
    expect(BigInt(trades[1]!.marketCapMusd) / 10n ** 18n).toBeGreaterThan(2_900_000n);
    const info = (await get<TokenInfo>(s.app.url, `/tokens/${nvda}`)).body;
    expect(info.holders).toBe(1);
    const tokenTrades = (await get<FeedItem[]>(s.app.url, `/tokens/${nvda}/trades`)).body;
    expect(tokenTrades[0]!.id).toBe(trades[0]!.id);
    const older = (await get<FeedItem[]>(s.app.url, `/tokens/${nvda}/trades?before=${trades[0]!.id}`)).body;
    expect(older.map((t) => t.id)).toEqual([trades[1]!.id]);
    const candles = (await get<unknown[]>(s.app.url, `/tokens/${nvda}/candles?tf=1m`)).body;
    expect(candles.length).toBeGreaterThan(0);
  }, 60000);

  test("a copy trade carries ref and the feed shows who was copied", async () => {
    const b = await Actor.create(s);
    await b.faucet();
    await b.trade(nvda, true, 10n * WAD, a.address);
    const item = (await get<FeedItem[]>(s.app.url, `/users/${b.address}/trades`)).body[0]!;
    expect(item.ref?.address).toBe(a.address);
  }, 60000);

  test("bad signature, wrong nonce, expired deadline and a bad body are refused before any gas", async () => {
    const start = await relayerNonce();
    const cases: [unknown, number, string][] = [
      [await a.tradeBody(nvda, true, WAD, { signer: privateKeyToAccount(generatePrivateKey()) }), 400, "bad_signature"],
      [await a.tradeBody(nvda, true, WAD, { nonce: 99n }), 400, "bad_nonce"],
      [await a.tradeBody(nvda, true, WAD, { deadline: String(Math.floor(Date.now() / 1000) - 1) }), 400, "expired"],
      [{ trade: { user: a.address }, sig: "0x" }, 400, "bad_body"],
    ];
    for (const [body, status, code] of cases) {
      const r = await post(s.app.url, "/actions/trade", body);
      expect([r.status, r.body.code]).toEqual([status, code]);
    }
    expect(await relayerNonce()).toBe(start);
  });

  test("a failing simulation answers 400 with the revert name and sends nothing", async () => {
    const start = await relayerNonce();
    const r = await post(s.app.url, "/actions/trade", await a.tradeBody(nvda, true, 1_000_000n * WAD));
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("Insufficient");
    const noRoute = await post(s.app.url, "/actions/trade", await a.tradeBody("0x000000000000000000000000000000000000dEaD", true, WAD));
    expect(noRoute.status).toBe(400);
    expect(noRoute.body.code).toBe("NoRoute");
    expect(await relayerNonce()).toBe(start);
  });

  test("withdraw moves MUSD out of the vault to any address", async () => {
    const to = privateKeyToAccount(generatePrivateKey()).address;
    await a.submit("/actions/withdraw", await a.withdrawBody(s.dep.musd, 5n * WAD, to));
    expect(await a.pub.readContract({ address: s.dep.musd, abi: erc20Abi, functionName: "balanceOf", args: [to] })).toBe(5n * WAD);
  }, 60000);

  test("launch with a first buy, the coin shows under new and a curve coin can't be withdrawn", async () => {
    const tokens = await Actor.create(s);
    tokens.socket.send({ type: "subscribe", topic: "tokens" });
    await a.submit("/actions/launch", await a.launchBody("Moon Cat", "MCAT", 50n * WAD));
    const launched = (await get<(TokenInfo & { address: Address })[]>(s.app.url, "/tokens?sort=new")).body;
    const coin = launched.find((t) => t.symbol === "MCAT")!;
    expect(coin.kind).toBe("launch");
    expect(coin.venue).toBe("curve");
    expect(coin.creator).toBe(a.address);
    expect(coin.curveProgress! > 0 && coin.curveProgress! < 1).toBe(true);
    const msg = await tokens.socket.next((m) => m.type === "token" && m.token.symbol === "MCAT");
    expect(msg.type).toBe("token");

    const held = await a.vaultBalance(coin.address);
    expect(held > 0n).toBe(true);
    const trades = (await get<FeedItem[]>(s.app.url, `/tokens/${coin.address}/trades`)).body;
    expect(trades[0]!.venue).toBe("curve");

    const r = await post(s.app.url, "/actions/withdraw", await a.withdrawBody(coin.address, held, a.address));
    expect([r.status, r.body.code]).toEqual([400, "curve_locked"]);

    const b = await Actor.create(s);
    await b.faucet();
    await b.trade(coin.address, true, 20n * WAD);
    const after = (await get<TokenInfo>(s.app.url, `/tokens/${coin.address}`)).body;
    expect(after.curveProgress!).toBeGreaterThan(coin.curveProgress!);
    expect(BigInt(after.priceMusd) > BigInt(coin.priceMusd)).toBe(true);
  }, 60000);

  test("health and config", async () => {
    const h = (await get<{ ok: boolean; chainId: number; relayerBtc: string }>(s.app.url, "/health")).body;
    expect(h.ok).toBe(true);
    expect(h.chainId).toBe(31337);
    expect(BigInt(h.relayerBtc) > 0n).toBe(true);
    expect((await get<{ vault: string }>(s.app.url, "/config")).body.vault).toBe(s.dep.vault);
  });
});
