import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { hashTypedData, zeroAddress } from "viem";
import { domainFor, intentTypes, SOLANA, vaultAbi, type FeedItem, type Profile } from "shared";
import { WAD } from "../src/pricing";
import { BASE, BASE_USDC } from "../src/solver/config";
import { CONTRACTS_READY, SKIP_NOTE, startStack, type Stack } from "./helpers/anvil";
import { Actor, deadline, post } from "./helpers/actors";
import { BONK, FakeRelay, FakeRunner, filled, fixture } from "./helpers/relay";

const SOLVER_KEY = "0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356";
const SOLVER = "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955";

const intentBody = async (a: Actor, isBuy: boolean, amountIn: bigint) => {
  const intent = {
    user: a.address,
    isBuy,
    chainId: String(SOLANA),
    token: BONK,
    amountIn: amountIn.toString(),
    minOut: "0",
    ref: zeroAddress,
    nonce: (await a.nonce()).toString(),
    deadline: deadline(),
  };
  const message = { ...intent, chainId: BigInt(SOLANA), amountIn, minOut: 0n, nonce: BigInt(intent.nonce), deadline: BigInt(intent.deadline) };
  const domain = domainFor(31337, a.dep.vault);
  const sig = await a.account.signTypedData({ domain, types: intentTypes, primaryType: "Intent", message });
  return { body: { intent, sig }, id: hashTypedData({ domain, types: intentTypes, primaryType: "Intent", message }) };
};

describe.skipIf(!CONTRACTS_READY)(`cross chain intents through the solver${SKIP_NOTE}`, () => {
  let s: Stack;
  let a: Actor;
  const relay = new FakeRelay();
  const runner = new FakeRunner(SOLVER);
  const solverCash = () => a.pub.readContract({ address: s.dep.vault, abi: vaultAbi, functionName: "balanceOf", args: [SOLVER, s.dep.musd] });

  beforeAll(async () => {
    s = await startStack({ SOLVER_KEY }, { solver: { relay, runner, pollMs: 20 } });
    a = await Actor.create(s);
    await a.faucet();
  }, 120000);
  afterAll(async () => s && (await s.stop()));

  const run = async (isBuy: boolean, amountIn: bigint) => {
    const { body, id } = await intentBody(a, isBuy, amountIn);
    const r = await post(s.app.url, "/actions/intent", body, { "x-forwarded-for": a.ip });
    expect([r.status, r.body.id, r.body.kind]).toEqual([200, id, "intent"]);
    const tx = await a.waitTx(id, 30000);
    await s.app.waitForBlock(Number(await a.pub.getBlockNumber()));
    return tx;
  };

  test("a buy moves MUSD to the solver, settles the tokens and shows up as a relay position", async () => {
    relay.requestFor = (id) => filled(id, runner.solanaAddress!, BONK, 160_000_000_000n, SOLANA);
    const cash = await a.vaultBalance(s.dep.musd);
    const tx = await run(true, 10n * WAD);
    expect([tx.status, tx.error]).toEqual(["confirmed", null]);
    expect(await a.vaultBalance(s.dep.musd)).toBe(cash - 10n * WAD);
    expect(await solverCash()).toBe(10n * WAD);
    expect(relay.quotes.at(-1)).toMatchObject({ originChainId: BASE, destinationChainId: SOLANA, amount: "10000000", recipient: runner.solanaAddress });

    const trades = (await (await fetch(`${s.app.url}/users/${a.address}/trades`)).json()) as FeedItem[];
    expect(trades[0]).toMatchObject({ venue: "relay", isBuy: true, tokenAmount: "160000000000", musdAmount: (10n * WAD).toString() });
    expect(trades[0]!.token).toMatchObject({ chainId: SOLANA, address: BONK, symbol: "BONK" });
    const profile = (await (await fetch(`${s.app.url}/users/${a.address}`)).json()) as Profile;
    expect(profile.positions.find((p) => p.token.chainId === SOLANA)).toMatchObject({ amount: "160000000000", withdrawable: false });
  }, 60000);

  test("a sell pays the USDC received as MUSD minus the fee", async () => {
    relay.quoteFor = () => fixture("quote-sell-solana");
    relay.requestFor = (id) => filled(id, SOLVER, BASE_USDC, 4_000_000n, BASE);
    const cash = await a.vaultBalance(s.dep.musd);
    const tx = await run(false, 60_000_000_000n);
    expect(tx.status).toBe("confirmed");
    const net = 4n * WAD - (4n * WAD * 50n) / 10_000n;
    expect(await a.vaultBalance(s.dep.musd)).toBe(cash + net);
    const profile = (await (await fetch(`${s.app.url}/users/${a.address}`)).json()) as Profile;
    expect(profile.positions.find((p) => p.token.chainId === SOLANA)?.amount).toBe("100000000000");
    const sold = await post(s.app.url, "/actions/intent", (await intentBody(a, false, 200_000_000_000n)).body);
    expect([sold.status, sold.body.code]).toEqual([400, "insufficient_position"]);
  }, 60000);

  test("a buy relay refunds comes back as failed with the MUSD returned", async () => {
    relay.quoteFor = () => fixture("quote-buy-solana");
    relay.statusFor = () => ({ status: "refund", failReason: "SLIPPAGE" });
    const cash = await a.vaultBalance(s.dep.musd);
    const tx = await run(true, 3n * WAD);
    expect([tx.status, tx.error]).toEqual(["failed", "relay refunded the swap: SLIPPAGE"]);
    expect(await a.vaultBalance(s.dep.musd)).toBe(cash);
  }, 60000);

  test("deposit chains list the five chains", async () => {
    const chains = (await (await fetch(`${s.app.url}/deposit/chains`)).json()) as { chainId: number }[];
    expect(chains.map((c) => c.chainId)).toEqual([SOLANA, BASE, 56, 1, 42161]);
  });
});

describe.skipIf(!CONTRACTS_READY)(`without a solver key${SKIP_NOTE}`, () => {
  let s: Stack;
  beforeAll(async () => {
    s = await startStack();
  }, 120000);
  afterAll(async () => s && (await s.stop()));

  test("intents and deposit addresses answer 503 solver_off and spend nothing", async () => {
    const a = await Actor.create(s);
    const r = await post(s.app.url, "/actions/intent", (await intentBody(a, true, WAD)).body);
    expect([r.status, r.body.code]).toEqual([503, "solver_off"]);
    const d = await fetch(`${s.app.url}/deposit/${a.address}/42161`);
    expect([d.status, ((await d.json()) as { code: string }).code]).toEqual([503, "solver_off"]);
  }, 60000);
});
