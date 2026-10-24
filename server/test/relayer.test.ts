import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { createTestClient, createWalletClient, http, type Hash } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { anvil } from "viem/chains";
import type { ServerMsg } from "shared";
import { WAD } from "../src/pricing";
import { CONTRACTS_READY, SKIP_NOTE, startStack, type Stack } from "./helpers/anvil";
import { Actor, post } from "./helpers/actors";

const txMsg = (m: ServerMsg, id: string) => m.type === "tx" && m.tx.id === id;

describe.skipIf(!CONTRACTS_READY)(`relayer locks and stuck txs${SKIP_NOTE}`, () => {
  let s: Stack;
  let a: Actor;
  let nvda: `0x${string}`;
  const relayer = () => privateKeyToAccount(s.env.RELAYER_KEY);
  const relayerNonce = () => a.pub.getTransactionCount({ address: relayer().address });
  const node = () => createTestClient({ mode: "anvil", chain: anvil, transport: http(s.anvil.rpc) });

  beforeAll(async () => {
    s = await startStack();
    nvda = s.dep.tokens.find((t) => t.symbol === "NVDA")!.address;
    a = await Actor.create(s);
    await a.faucet();
  }, 120000);
  afterEach(async () => s && (await node().setAutomine(true)));
  afterAll(async () => s && (await s.stop()));

  test("five identical trades at once: one broadcast, the rest are 409", async () => {
    const start = await relayerNonce();
    const body = await a.tradeBody(nvda, true, 10n * WAD);
    const res = await Promise.all(Array.from({ length: 5 }, () => post(s.app.url, "/actions/trade", body)));
    const ok = res.filter((r) => r.status === 200);
    expect(ok).toHaveLength(1);
    expect(res.filter((r) => r.status === 409).every((r) => r.body.code === "in_flight")).toBe(true);
    // a duplicate that arrives after the first one mined fails the nonce check instead, never a 200
    expect(res.every((r) => r.status === 200 || r.status === 409 || r.body.code === "bad_nonce")).toBe(true);
    expect((await a.waitTx(String(ok[0]!.body.id))).status).toBe("confirmed");
    expect(await relayerNonce()).toBe(start + 1);
  }, 30000);

  test("a tx that sits unmined stays pending and keeps its lock, then confirms once mined", async () => {
    await node().setAutomine(false);
    const body = await a.tradeBody(nvda, true, 5n * WAD);
    const r = await post(s.app.url, "/actions/trade", body);
    expect(r.status).toBe(200);
    const id = String(r.body.id);
    await a.socket.next((m) => txMsg(m, id) && m.type === "tx" && m.tx.hash !== null);
    await Bun.sleep(3000);
    expect(a.socket.messages.some((m) => txMsg(m, id) && m.type === "tx" && m.tx.status !== "pending")).toBe(false);
    const dup = await post(s.app.url, "/actions/trade", body);
    expect([dup.status, dup.body.code]).toEqual([409, "in_flight"]);
    await node().mine({ blocks: 1 });
    expect((await a.waitTx(id)).status).toBe("confirmed");
  }, 30000);

  test("a tx whose nonce the chain used for something else is failed and frees its lock", async () => {
    await node().setAutomine(false);
    const body = await a.tradeBody(nvda, true, 5n * WAD);
    const r = await post(s.app.url, "/actions/trade", body);
    const id = String(r.body.id);
    const sent = await a.socket.next((m) => txMsg(m, id) && m.type === "tx" && m.tx.hash !== null);
    const hash = (sent.type === "tx" ? sent.tx.hash : null) as Hash;
    const tx = await a.pub.getTransaction({ hash });
    await node().dropTransaction({ hash });
    const w = createWalletClient({ chain: anvil, transport: http(s.anvil.rpc), account: relayer() });
    await w.sendTransaction({ to: relayer().address, value: 0n, nonce: tx.nonce });
    await node().mine({ blocks: 1 });
    const done = await a.waitTx(id);
    expect(done.status).toBe("failed");
    expect(done.error).toContain("dropped");
    await node().setAutomine(true);
    // the signed trade never ran, so the same body goes through now
    const again = await post(s.app.url, "/actions/trade", body);
    expect(again.status).toBe(200);
    expect((await a.waitTx(String(again.body.id))).status).toBe("confirmed");
  }, 30000);
});
