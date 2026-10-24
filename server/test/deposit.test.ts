import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { parseAbi, type Address } from "viem";
import { btcPermitDomain, permitTypes } from "shared";
import { WAD } from "../src/pricing";
import { CONTRACTS_READY, SKIP_NOTE, startStack, type Stack } from "./helpers/anvil";
import { Actor, deadline, post } from "./helpers/actors";

const permitAbi = parseAbi([
  "function nonces(address owner) view returns (uint256)",
  "function eip712Domain() view returns (bytes1, string, string, uint256, address, bytes32, uint256[])",
]);

describe.skipIf(!CONTRACTS_READY)(`auto deposit with permit${SKIP_NOTE}`, () => {
  let s: Stack;
  beforeAll(async () => {
    s = await startStack();
  }, 120000);
  afterAll(async () => s && (await s.stop()));

  const signPermit = async (a: Actor, token: Address, amount: bigint) => {
    const [, name, version, chainId, verifyingContract] = await a.pub.readContract({ address: token, abi: permitAbi, functionName: "eip712Domain" });
    const nonce = await a.pub.readContract({ address: token, abi: permitAbi, functionName: "nonces", args: [a.address] });
    const dl = deadline();
    const sig = await a.account.signTypedData({
      domain: { name, version, chainId: Number(chainId), verifyingContract },
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
});
