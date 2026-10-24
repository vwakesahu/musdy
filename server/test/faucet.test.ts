import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { faucetEnabled } from "../src/env";
import { WAD } from "../src/pricing";
import { CONTRACTS_READY, KEYS, SKIP_NOTE, startStack, type Stack } from "./helpers/anvil";
import { Actor, post } from "./helpers/actors";

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

    const again = await post(s.app.url, "/faucet", { address: a.address });
    expect([again.status, again.body.code]).toEqual([429, "faucet_limited"]);
  }, 60000);

  test("parallel taps for different addresses all land", async () => {
    const actors = await Promise.all([1, 2, 3].map(() => Actor.create(s)));
    await Promise.all(actors.map((x) => x.faucet()));
    for (const x of actors) expect(await x.vaultBalance(s.dep.musd)).toBe(1000n * WAD);
  }, 60000);

  test("a bad address is a 400", async () => {
    const r = await post(s.app.url, "/faucet", { address: "0x12" });
    expect([r.status, r.body.code]).toEqual([400, "bad_body"]);
  });
});

describe.skipIf(!CONTRACTS_READY)(`faucet off${SKIP_NOTE}`, () => {
  let s: Stack;
  beforeAll(async () => {
    s = await startStack({ FAUCET_KEY: "" });
  }, 120000);
  afterAll(async () => s && (await s.stop()));

  test("without FAUCET_KEY the faucet answers 403", async () => {
    const r = await post(s.app.url, "/faucet", { address: "0x000000000000000000000000000000000000dEaD" });
    expect([r.status, r.body.code]).toEqual([403, "faucet_off"]);
  });
});
