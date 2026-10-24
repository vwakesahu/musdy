import { createPublicClient, http, parseUnits, formatUnits } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
// end to end check against a running testnet server: faucet, buy a base coin through the solver, sell it back
import { deployments, domainFor, faucetMessage, intentTypes, mezoTestnet, vaultAbi } from "shared";

const S = "http://localhost:8080";
const XDP = "0x07b3D902783c3C12b077508c3B5c00113d1291D0";
const dep = (deployments as Record<string, { vault: `0x${string}`; musd: `0x${string}` }>)["31611"]!;
const pub = createPublicClient({ chain: mezoTestnet, transport: http() });
const key = process.env.CHECK_KEY as `0x${string}` | undefined ?? generatePrivateKey();
const me = privateKeyToAccount(key);
await Bun.write("/tmp/live-check-key.txt", key);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const post = async (p: string, b: unknown) => {
  const r = await fetch(S + p, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.9.8." + Math.floor(Math.random() * 200) }, body: JSON.stringify(b) });
  const j = await r.json();
  if (!r.ok) throw new Error(p + " " + r.status + " " + JSON.stringify(j));
  return j;
};
const cash = () => pub.readContract({ address: dep.vault, abi: vaultAbi, functionName: "balanceOf", args: [me.address, dep.musd] });
const log = (...a: unknown[]) => process.stdout.write(a.join(" ") + "\n");

log("user", me.address);
const issued = new Date().toISOString();
await post("/faucet", { address: me.address, issued, sig: await me.signMessage({ message: faucetMessage(me.address, issued) }) });
for (let i = 0; i < 40 && (await cash()) === 0n; i++) await sleep(2000);
log("cash after faucet", formatUnits(await cash(), 18));

async function intent(isBuy: boolean, amountIn: bigint) {
  const { nonce } = (await (await fetch(`${S}/nonce/${me.address}`)).json()) as { nonce: string };
  const msg = { user: me.address, isBuy, chainId: 8453n, token: XDP, amountIn, minOut: 1n, ref: "0x0000000000000000000000000000000000000000" as const, nonce: BigInt(nonce), deadline: BigInt(Math.floor(Date.now() / 1000) + 600) };
  const sig = await me.signTypedData({ domain: domainFor(mezoTestnet.id, dep.vault), types: intentTypes, primaryType: "Intent", message: msg });
  const body = { intent: { ...msg, chainId: "8453", amountIn: amountIn.toString(), minOut: "1", nonce: nonce, deadline: msg.deadline.toString() }, sig };
  return post("/actions/intent", body);
}

const position = async () => {
  const p = (await (await fetch(`${S}/users/${me.address}`)).json()) as { positions: { token: { symbol: string; chainId: number }; amount: string; valueMusd: string }[] };
  return p.positions.find((x) => x.token.chainId === 8453);
};

const t0 = Date.now();
log("buy", JSON.stringify(await intent(true, parseUnits(process.env.BUY_USD ?? "3", 18))), "accepted in", Date.now() - t0, "ms");
let pos;
for (let i = 0; i < 60 && !(pos = await position()); i++) await sleep(3000);
log("position after", Date.now() - t0, "ms", JSON.stringify(pos?.amount ?? null), "cash", formatUnits(await cash(), 18));
if (!pos) process.exit(1);
const t1 = Date.now();
log("sell", JSON.stringify(await intent(false, BigInt(pos.amount))), "accepted in", Date.now() - t1, "ms");
const before = await cash();
for (let i = 0; i < 60 && (await cash()) === before; i++) await sleep(3000);
log("sold after", Date.now() - t1, "ms", "cash after sell", formatUnits(await cash(), 18), "position", JSON.stringify((await position()) ?? null));
