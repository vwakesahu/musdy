import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Health } from "shared";
import { openDb } from "../src/db";
import { faucetEnabled } from "../src/env";
import { WAD } from "../src/pricing";
import { Store } from "../src/store";
import { CONTRACTS_READY, KEYS, SKIP_NOTE, startStack, tempDb, type Stack } from "./helpers/anvil";
import { Actor, get, post, randomIp } from "./helpers/actors";

test("claims are limited per address, per ip and by a global hourly cap, a release frees the slot", () => {
  const store = new Store(openDb(tempDb()));
  const limits = { period: 86400, perIp: 3, hourly: 4 };
  const addr = (i: number) => `0x${i.toString(16).padStart(40, "0")}`;
  const t = 1_800_000_000;
  expect(store.claimFaucet(addr(1), "1.1.1.1", t, limits)).toBe("ok");
  expect(store.claimFaucet(addr(1), "2.2.2.2", t + 10, limits)).toBe("address");
  expect(store.claimFaucet(addr(2), "1.1.1.1", t, limits)).toBe("ok");
  expect(store.claimFaucet(addr(3), "1.1.1.1", t, limits)).toBe("ok");
  expect(store.claimFaucet(addr(4), "1.1.1.1", t, limits)).toBe("ip");
  expect(store.claimFaucet(addr(4), "3.3.3.3", t, limits)).toBe("ok");
  expect(store.claimFaucet(addr(5), "4.4.4.4", t, limits)).toBe("global");
  // an hour later the global cap has room again, the ip limit still holds for a day
  expect(store.claimFaucet(addr(5), "1.1.1.1", t + 3601, limits)).toBe("ip");
  expect(store.claimFaucet(addr(5), "4.4.4.4", t + 3601, limits)).toBe("ok");
  store.releaseFaucet(addr(5), t + 3601);
  expect(store.claimFaucet(addr(5), "4.4.4.4", t + 3602, limits)).toBe("ok");
  expect(store.claimFaucet(addr(1), "5.5.5.5", t + 86401, limits)).toBe("ok");
});

test("faucet is off without a key and always off on mainnet", () => {
  const key = KEYS.FAUCET_KEY as `0x${string}`;
  expect(faucetEnabled({ FAUCET_KEY: key, CHAIN_ID: 31337 })).toBe(true);
  expect(faucetEnabled({ FAUCET_KEY: key, CHAIN_ID: 31611 })).toBe(true);
  expect(faucetEnabled({ FAUCET_KEY: key, CHAIN_ID: 31612 })).toBe(false);
  expect(faucetEnabled({ FAUCET_KEY: undefined, CHAIN_ID: 31337 })).toBe(false);
});

describe.skipIf(!CONTRACTS_READY)(`faucet against anvil${SKIP_NOTE}`, () => {
  let s: Stack;
  beforeAll(async () => {
    s = await startStack();
  }, 120000);
  afterAll(async () => s && (await s.stop()));

  test("one tap puts 1,000 MUSD in the vault, a second tap within 24h is refused", async () => {
    const a = await Actor.create(s);
    const tx = await a.faucet();
    expect(tx).toMatchObject({ kind: "faucet", status: "confirmed" });
    expect(await a.vaultBalance(s.dep.musd)).toBe(1000n * WAD);
    const pending = a.socket.messages.find((m) => m.type === "tx" && m.tx.status === "pending");
    expect(pending).toBeDefined();
    const bal = await a.socket.next((m) => m.type === "balances" && m.vault[0]?.amount === (1000n * WAD).toString());
    expect(bal.type).toBe("balances");

    const again = await post(s.app.url, "/faucet", await a.faucetBody(), { "x-forwarded-for": randomIp() });
    expect([again.status, again.body.code]).toEqual([429, "faucet_limited"]);
  }, 60000);

  test("parallel taps for different addresses all land", async () => {
    const actors = await Promise.all([1, 2, 3].map(() => Actor.create(s)));
    await Promise.all(actors.map((x) => x.faucet()));
    for (const x of actors) expect(await x.vaultBalance(s.dep.musd)).toBe(1000n * WAD);
  }, 60000);

  test("a bad address is a 400", async () => {
    const r = await post(s.app.url, "/faucet", { address: "0x12", issued: new Date().toISOString(), sig: "0x00" });
    expect([r.status, r.body.code]).toEqual([400, "bad_body"]);
  });

  test("an unsigned, wrongly signed or stale claim is refused and costs nothing", async () => {
    const a = await Actor.create(s);
    const b = await Actor.create(s);
    const unsigned = await post(s.app.url, "/faucet", { address: a.address });
    expect([unsigned.status, unsigned.body.code]).toEqual([400, "bad_body"]);
    const other = { ...(await a.faucetBody()), sig: (await b.faucetBody()).sig };
    const forged = await post(s.app.url, "/faucet", other);
    expect([forged.status, forged.body.code]).toEqual([401, "bad_signature"]);
    const stale = await post(s.app.url, "/faucet", await a.faucetBody(new Date(Date.now() - 6 * 60 * 1000).toISOString()));
    expect([stale.status, stale.body.code]).toEqual([400, "expired"]);
    expect(await a.vaultBalance(s.dep.musd)).toBe(0n);
  });

  test("one ip gets three claims a day, the fourth is refused", async () => {
    const ip = randomIp();
    const actors = await Promise.all([1, 2, 3, 4].map(() => Actor.create(s)));
    const codes: number[] = [];
    for (const x of actors) codes.push((await post(s.app.url, "/faucet", await x.faucetBody(), { "x-forwarded-for": ip })).status);
    expect(codes).toEqual([200, 200, 200, 429]);
    const r = await post(s.app.url, "/faucet", await actors[3]!.faucetBody(), { "x-forwarded-for": ip });
    expect(r.body.code).toBe("faucet_ip_limited");
    await Promise.all(actors.slice(0, 3).map((x) => x.socket.next((m) => m.type === "tx" && m.tx.status === "confirmed", 15000)));
  }, 60000);

  test("health says the faucet is on", async () => {
    expect((await get<Health>(s.app.url, "/health")).body.faucet).toBe(true);
  });
});

describe.skipIf(!CONTRACTS_READY)(`faucet off${SKIP_NOTE}`, () => {
  let s: Stack;
  beforeAll(async () => {
    s = await startStack({ FAUCET_KEY: "" });
  }, 120000);
  afterAll(async () => s && (await s.stop()));

  test("without FAUCET_KEY the faucet answers 403", async () => {
    const a = await Actor.create(s);
    const r = await post(s.app.url, "/faucet", await a.faucetBody());
    expect([r.status, r.body.code]).toEqual([403, "faucet_off"]);
    expect((await get<Health>(s.app.url, "/health")).body.faucet).toBe(false);
  });
});
