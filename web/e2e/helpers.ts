import { expect, type Page, type TestInfo } from "@playwright/test";
import { createPublicClient, createWalletClient, http, parseAbi, parseUnits, zeroAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { deployments, domainFor, routes, tradeTypes, type Deployment } from "shared";

export const SERVER = process.env.E2E_SERVER_URL ?? "http://localhost:8080";
export const RPC = process.env.E2E_RPC_URL ?? "http://127.0.0.1:8545";
// anvil account 3 by default, account 2 is the relayer, must match the web build's NEXT_PUBLIC_DEV_KEY
export const DEV_KEY = (process.env.E2E_DEV_KEY ?? process.env.NEXT_PUBLIC_DEV_KEY ?? "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a") as Hex;
// anvil account 1 holds the local faucet MUSD, account 3 plays another trader
const FAUCET_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as Hex;
export const OTHER_KEY = "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6" as Hex;

export const me = privateKeyToAccount(DEV_KEY);
export const other = privateKeyToAccount(OTHER_KEY);
export const dep = (deployments as Record<string, Deployment>)["31337"];
export const stock = dep.tokens.find((t) => t.kind === "stock") ?? dep.tokens[0];
export const publicClient = createPublicClient({ chain: foundry, transport: http(RPC) });

export async function shot(page: Page, info: TestInfo, name: string) {
  await page.screenshot({ path: `../out/shots/${name}-${info.project.name}.png` });
}

export async function devLogin(page: Page, path = "/") {
  await page.goto(path);
  const pill = page.getByTestId("balance-pill");
  if (await pill.isVisible().catch(() => false)) return;
  await page.getByRole("button", { name: "Log in" }).first().click();
  await page.getByRole("dialog").getByTestId("dev-login").click();
  await expect(pill).toBeVisible();
}

export const cashText = async (page: Page) => (await page.getByTestId("balance-pill").innerText()).replace(/[^\d.]/g, "");

export async function post(path: string, body: unknown) {
  const res = await fetch(SERVER + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json: unknown = await res.json();
  if (!res.ok) throw new Error(`${path} ${res.status} ${JSON.stringify(json)}`);
  return json;
}

// sends wallet MUSD from the faucet account straight to an address, outside the vault
export async function sendWalletMusd(to: Address, amount: string) {
  const wallet = createWalletClient({ account: privateKeyToAccount(FAUCET_KEY), chain: foundry, transport: http(RPC) });
  const hash = await wallet.writeContract({
    address: dep.musd,
    abi: parseAbi(["function transfer(address to, uint256 amount) returns (bool)"]),
    functionName: "transfer",
    args: [to, parseUnits(amount, 18)],
  });
  await publicClient.waitForTransactionReceipt({ hash });
}

export async function faucet(address: Address) {
  await post(routes.faucet, { address }).catch(() => null);
}

// another trader buys through the server, so their trade lands on the global feed
export async function otherBuys(token: Address, dollars: string) {
  await faucet(other.address);
  await new Promise((r) => setTimeout(r, 3000));
  const nonce = ((await (await fetch(`${SERVER}/nonce/${other.address}`)).json()) as { nonce: string }).nonce;
  const message = {
    user: other.address,
    token,
    isBuy: true,
    amountIn: parseUnits(dollars, 18),
    minOut: 0n,
    ref: zeroAddress,
    nonce: BigInt(nonce),
    deadline: BigInt(Math.floor(Date.now() / 1000) + 600),
  };
  const sig = await other.signTypedData({ domain: domainFor(31337, dep.vault), types: tradeTypes, primaryType: "Trade", message });
  return post(routes.trade, {
    trade: { ...message, amountIn: message.amountIn.toString(), minOut: "0", nonce: message.nonce.toString(), deadline: message.deadline.toString() },
    sig,
  });
}

export async function ensureCash(page: Page) {
  if (Number(await cashText(page)) >= 20) return;
  await faucet(me.address);
  await expect.poll(async () => Number(await cashText(page)), { timeout: 30_000 }).toBeGreaterThanOrEqual(20);
}
