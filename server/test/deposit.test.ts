import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createTestClient, createWalletClient, erc20Abi, http, maxUint256, parseAbi, parseEther, type Address, type Chain, type PublicClient, type Transport } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { anvil } from "viem/chains";
import { btcPermitDomain, permitTypes, vaultAbi } from "shared";
import { readTokenMeta } from "../src/indexer";
import { WAD } from "../src/pricing";
import { CONTRACTS_READY, KEYS, SKIP_NOTE, startStack, type Stack } from "./helpers/anvil";
import { Actor, deadline, post } from "./helpers/actors";

const BAD_SYMBOL = "0x60003560e01c6395d89b4114601957600160005260206000f35b600080fd";
const ANYTHING = "0x600160005260206000f3";

const permitAbi = parseAbi([
  "function nonces(address owner) view returns (uint256)",
  "function nonce(address owner) view returns (uint256)",
  "function eip712Domain() view returns (bytes1, string, string, uint256, address, bytes32, uint256[])",
]);

describe.skipIf(!CONTRACTS_READY)(`auto deposit with permit${SKIP_NOTE}`, () => {
  let s: Stack;
  beforeAll(async () => {
    s = await startStack();
  }, 120000);
  afterAll(async () => s && (await s.stop()));

  const permitDomain = async (a: Actor, token: Address) => {
    try {
      const [, name, version, chainId, verifyingContract] = await a.pub.readContract({ address: token, abi: permitAbi, functionName: "eip712Domain" });
      const nonce = await a.pub.readContract({ address: token, abi: permitAbi, functionName: "nonces", args: [a.address] });
      return { domain: { name, version, chainId: Number(chainId), verifyingContract }, nonce };
    } catch {
      const nonce = await a.pub.readContract({ address: token, abi: permitAbi, functionName: "nonce", args: [a.address] });
      return { domain: btcPermitDomain(31337, token), nonce };
    }
  };

  const signPermit = async (a: Actor, token: Address, amount: bigint) => {
    const { domain, nonce } = await permitDomain(a, token);
    const dl = deadline();
    const sig = await a.account.signTypedData({
      domain,
      types: permitTypes,
      primaryType: "Permit",
      message: { owner: a.address, spender: s.dep.vault, value: amount, nonce, deadline: BigInt(dl) },
    });
    const r = `0x${sig.slice(2, 66)}` as const;
    const sv = `0x${sig.slice(66, 130)}` as const;
    const v = parseInt(sig.slice(130, 132), 16);
    return { owner: a.address, token, amount: amount.toString(), deadline: dl, v, r, s: sv };
  };

  test("wallet MUSD shows on the socket, a signed permit sweeps it into the vault gaslessly", async () => {
    const a = await Actor.create(s);
    await a.mintToWallet(s.dep.musd, 250n * WAD);
    const seen = await a.socket.next((m) => m.type === "balances" && m.wallet.some((w) => w.token === s.dep.musd && w.amount === (250n * WAD).toString()));
    expect(seen.type).toBe("balances");
    await a.submit("/actions/deposit", await signPermit(a, s.dep.musd, 250n * WAD));
    expect(await a.vaultBalance(s.dep.musd)).toBe(250n * WAD);
    expect(await a.walletBalance(s.dep.musd)).toBe(0n);
    expect(await a.pub.getBalance({ address: a.address })).toBe(0n);
    const after = await a.socket.next((m) => m.type === "balances" && m.vault[0]?.amount === (250n * WAD).toString());
    expect(after.type === "balances" && after.wallet.find((w) => w.token === s.dep.musd)?.amount).toBe("0");
  }, 60000);

  test("BTC deposits the same way", async () => {
    const a = await Actor.create(s);
    await a.mintToWallet(s.dep.btc, WAD / 10n);
    await a.submit("/actions/deposit", await signPermit(a, s.dep.btc, WAD / 10n));
    expect(await a.vaultBalance(s.dep.btc)).toBe(WAD / 10n);
    expect(btcPermitDomain(31611, s.dep.btc).name).toBe("BTC");
  }, 60000);

  test("a permit signed by someone else fails simulation and sends nothing", async () => {
    const a = await Actor.create(s);
    const b = await Actor.create(s);
    await a.mintToWallet(s.dep.musd, 10n * WAD);
    const body = { ...(await signPermit(b, s.dep.musd, 10n * WAD)), owner: a.address };
    const r = await post(s.app.url, "/actions/deposit", body);
    expect(r.status).toBe(400);
    expect(typeof r.body.code).toBe("string");
    const other = await post(s.app.url, "/actions/deposit", { ...body, token: s.dep.tokens.find((t) => t.symbol === "NVDA")!.address });
    expect([other.status, other.body.code]).toEqual([400, "bad_token"]);
  }, 60000);

  test("a forged permit for an owner with a standing allowance is rejected before anything is sent", async () => {
    const a = await Actor.create(s);
    const b = await Actor.create(s);
    const node = createTestClient({ mode: "anvil", chain: anvil, transport: http(s.anvil.rpc) });
    await a.mintToWallet(s.dep.musd, 10n * WAD);
    await node.setBalance({ address: a.address, value: parseEther("1") });
    const w = createWalletClient({ chain: anvil, transport: http(s.anvil.rpc), account: a.account });
    await a.pub.waitForTransactionReceipt({ hash: await w.writeContract({ address: s.dep.musd, abi: erc20Abi, functionName: "approve", args: [s.dep.vault, maxUint256] }) });
    const relayer = privateKeyToAccount(s.env.RELAYER_KEY).address;
    const before = await a.pub.getTransactionCount({ address: relayer });
    const forged = { ...(await signPermit(b, s.dep.musd, 10n * WAD)), owner: a.address };
    const r = await post(s.app.url, "/actions/deposit", forged);
    expect([r.status, r.body.code]).toEqual([400, "bad_signature"]);
    const real = await signPermit(a, s.dep.musd, 5n * WAD);
    const bumped = await post(s.app.url, "/actions/deposit", { ...real, amount: (10n * WAD).toString() });
    expect([bumped.status, bumped.body.code]).toEqual([400, "bad_signature"]);
    expect(await a.pub.getTransactionCount({ address: relayer })).toBe(before);
    expect(await a.vaultBalance(s.dep.musd)).toBe(0n);
  }, 60000);

  test("deposits of untracked tokens, even one whose symbol() reverts, are skipped and indexing keeps going", async () => {
    const node = createTestClient({ mode: "anvil", chain: anvil, transport: http(s.anvil.rpc) });
    const bad = "0x00000000000000000000000000000000000badba" as Address;
    const junk = "0x0000000000000000000000000000000000000f00" as Address;
    await node.setCode({ address: bad, bytecode: BAD_SYMBOL });
    await node.setCode({ address: junk, bytecode: ANYTHING });
    const deployer = privateKeyToAccount(KEYS.DEPLOYER_KEY as `0x${string}`);
    const w = createWalletClient({ chain: anvil, transport: http(s.anvil.rpc), account: deployer });
    const a = await Actor.create(s);
    for (const token of [bad, junk]) {
      const hash = await w.writeContract({ address: s.dep.vault, abi: vaultAbi, functionName: "deposit", args: [token, 1n, deployer.address] });
      expect((await a.pub.waitForTransactionReceipt({ hash })).status).toBe("success");
    }
    const depositBlock = Number(await a.pub.getBlockNumber());
    await a.faucet();
    expect(s.app.block()).toBeGreaterThan(depositBlock);
    expect(s.app.store.token(bad)).toBeNull();
    expect(s.app.store.token(junk)).toBeNull();
    expect(s.app.store.userHistory(deployer.address).transfers.filter((t) => t.token === bad || t.token === junk)).toHaveLength(0);
    expect(s.app.store.userHistory(a.address).transfers.map((t) => t.token)).toEqual([s.dep.musd.toLowerCase()]);
    const meta = await readTokenMeta(a.pub as unknown as PublicClient<Transport, Chain>, bad);
    expect([meta.symbol, meta.name]).toEqual(["???", "unknown token"]);
  }, 60000);
});
