import { expect, type Page, type TestInfo } from "@playwright/test";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  parseSignature,
  parseUnits,
  zeroAddress,
  type Address,
  type Hex,
  type PrivateKeyAccount,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import {
  deployments,
  domainFor,
  faucetMessage,
  FeedItem,
  launchTypes,
  permitTypes,
  readPermitDomain,
  routes,
  tradeTypes,
  vaultAbi,
  withdrawTypes,
  type Deployment,
} from "shared";
import { displayName, usd } from "../src/lib/format";

export const SERVER = process.env.E2E_SERVER_URL ?? "http://localhost:8080";
export const RPC = process.env.E2E_RPC_URL ?? "http://127.0.0.1:8545";
// anvil account 3 by default, account 2 is the relayer, must match the web build's NEXT_PUBLIC_DEV_KEY
export const DEV_KEY = (process.env.E2E_DEV_KEY ?? process.env.NEXT_PUBLIC_DEV_KEY ?? "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a") as Hex;
// anvil account 6 funds test wallets by minting the local mocks, it never shares a nonce with the server's
// faucet (account 1) or relayer (account 2). accounts 4 and 5 play other traders
const FUNDER_KEY = "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e" as Hex;
export const OTHER_KEY = "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6" as Hex;
export const THIRD_KEY = "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba" as Hex;

export const me = privateKeyToAccount(DEV_KEY);
export const other = privateKeyToAccount(OTHER_KEY);
export const third = privateKeyToAccount(THIRD_KEY);
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

// the app's dev login as a given key: on 31337 the app takes its dev key from localStorage "musdy:devkey" when set
export async function loginAs(page: Page, key: Hex, path = "/") {
  await page.addInitScript((k) => window.localStorage.setItem("musdy:devkey", k), key);
  await devLogin(page, path);
}

// what a feed row says for a trade: the app's own name and dollar helpers
export const rowName = (u: FeedItem["user"]) => displayName(u);
export const rowDollars = (x: FeedItem) => usd(BigInt(x.musdAmount));

export const cashText = async (page: Page) => (await page.getByTestId("balance-pill").innerText()).replace(/[^\d.]/g, "");

export async function post(path: string, body: unknown) {
  const res = await fetch(SERVER + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json: unknown = await res.json();
  if (!res.ok) throw new Error(`${path} ${res.status} ${JSON.stringify(json)}`);
  return json;
}

const erc20 = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function mint(address to, uint256 amount)",
]);
const funder = createWalletClient({ account: privateKeyToAccount(FUNDER_KEY), chain: foundry, transport: http(RPC) });

// lands wallet MUSD on an address, outside the vault, by minting the local mock
export async function sendWalletMusd(to: Address, amount: string | bigint) {
  const value = typeof amount === "bigint" ? amount : parseUnits(amount, 18);
  const hash = await funder.writeContract({ address: dep.musd, abi: erc20, functionName: "mint", args: [to, value] });
  await publicClient.waitForTransactionReceipt({ hash });
}

// the local BTC stands in for the precompile and anyone can mint it, so this lands wallet BTC on an address
export async function sendWalletBtc(to: Address, amount: string) {
  const hash = await funder.writeContract({ address: dep.btc, abi: erc20, functionName: "mint", args: [to, parseUnits(amount, 18)] });
  await publicClient.waitForTransactionReceipt({ hash });
}

export const walletBalance = (token: Address, owner: Address) =>
  publicClient.readContract({ address: token, abi: erc20, functionName: "balanceOf", args: [owner] });
export const vaultBalance = (owner: Address, token: Address) =>
  publicClient.readContract({ address: dep.vault, abi: vaultAbi, functionName: "balanceOf", args: [owner, token] }) as Promise<bigint>;

const deadline = () => BigInt(Math.floor(Date.now() / 1000) + 600);
const vaultNonce = async (a: Address) => BigInt(((await (await fetch(`${SERVER}/nonce/${a}`)).json()) as { nonce: string }).nonce);

// signs the faucet the same way the app does, a personal_sign of faucetMessage with an ISO issued time
export async function faucet(account: PrivateKeyAccount) {
  const issued = new Date().toISOString();
  const sig = await account.signMessage({ message: faucetMessage(account.address, issued) });
  return post(routes.faucet, { address: account.address, issued, sig });
}

// a permit deposit the way the app signs it, with the shared domain reader
export async function permitDeposit(account: PrivateKeyAccount, token: Address, amount: bigint) {
  const { domain, nonce } = await readPermitDomain(publicClient, 31337, token, account.address);
  const dl = deadline();
  const sig = await account.signTypedData({ domain, types: permitTypes, primaryType: "Permit", message: { owner: account.address, spender: dep.vault, value: amount, nonce, deadline: dl } });
  const { r, s, v, yParity } = parseSignature(sig);
  return post(routes.deposit, { owner: account.address, token, amount: amount.toString(), deadline: dl.toString(), v: Number(v ?? BigInt(yParity + 27)), r, s });
}

// tops up an account's vault cash without the faucet, which is once a day per address
export async function fund(account: PrivateKeyAccount, dollars: string) {
  const want = parseUnits(dollars, 18);
  const have = await vaultBalance(account.address, dep.musd);
  if (have >= want) return;
  await sendWalletMusd(account.address, dollars);
  await permitDeposit(account, dep.musd, want);
  await expect.poll(() => vaultBalance(account.address, dep.musd), { timeout: 30_000 }).toBeGreaterThanOrEqual(want);
}

export async function userTrades(address: Address) {
  const res = await fetch(`${SERVER}${routes.userTrades.replace(":address", address)}`);
  return FeedItem.array().parse(await res.json());
}

// waits for the server to index a trade by this address that wasn't in `before`
export async function nextTrade(address: Address, before: FeedItem[]) {
  const seen = new Set(before.map((x) => x.id));
  let found: FeedItem | undefined;
  await expect
    .poll(
      async () => {
        found = (await userTrades(address)).find((x) => !seen.has(x.id));
        return !!found;
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  return found as FeedItem;
}

// a trader buys through the server so the trade lands on the feeds, answers with the indexed item
export async function buyAs(account: PrivateKeyAccount, token: Address, dollars: string) {
  await fund(account, dollars);
  const before = await userTrades(account.address);
  const message = {
    user: account.address,
    token,
    isBuy: true,
    amountIn: parseUnits(dollars, 18),
    minOut: 0n,
    ref: zeroAddress,
    nonce: await vaultNonce(account.address),
    deadline: deadline(),
  };
  const sig = await account.signTypedData({ domain: domainFor(31337, dep.vault), types: tradeTypes, primaryType: "Trade", message });
  await post(routes.trade, {
    trade: { ...message, amountIn: message.amountIn.toString(), minOut: "0", nonce: message.nonce.toString(), deadline: message.deadline.toString() },
    sig,
  });
  return nextTrade(account.address, before);
}

export const otherBuys = (token: Address, dollars: string) => buyAs(other, token, dollars);

// launches a coin for an account with a first buy, so it holds a coin still on its curve
export async function launchAs(account: PrivateKeyAccount, symbol: string, dollars: string) {
  await fund(account, dollars);
  const message = { user: account.address, name: `Test ${symbol}`, symbol, image: "", initialBuy: parseUnits(dollars, 18), nonce: await vaultNonce(account.address), deadline: deadline() };
  const sig = await account.signTypedData({ domain: domainFor(31337, dep.vault), types: launchTypes, primaryType: "Launch", message });
  return post(routes.launch, {
    launch: { ...message, initialBuy: message.initialBuy.toString(), nonce: message.nonce.toString(), deadline: message.deadline.toString() },
    sig,
  });
}

// tops up the logged in user's cash with wallet MUSD the app sweeps in, never the faucet (that has its own spec)
export async function ensureCash(page: Page, dollars = 20) {
  const want = parseUnits(String(dollars), 18);
  const have = await vaultBalance(me.address, dep.musd);
  if (have < want) {
    await sendWalletMusd(me.address, want - have + parseUnits("50", 18));
    await expect.poll(() => vaultBalance(me.address, dep.musd), { timeout: 40_000 }).toBeGreaterThanOrEqual(want);
  }
  await expect.poll(async () => Number(await cashText(page)), { timeout: 30_000 }).toBeGreaterThanOrEqual(dollars);
}

// a signed trade through the server, the way the app sends one
export async function tradeAs(account: PrivateKeyAccount, token: Address, isBuy: boolean, amountIn: bigint) {
  const before = await userTrades(account.address);
  const message = { user: account.address, token, isBuy, amountIn, minOut: 0n, ref: zeroAddress, nonce: await vaultNonce(account.address), deadline: deadline() };
  const sig = await account.signTypedData({ domain: domainFor(31337, dep.vault), types: tradeTypes, primaryType: "Trade", message });
  await post(routes.trade, {
    trade: { ...message, amountIn: amountIn.toString(), minOut: "0", nonce: message.nonce.toString(), deadline: message.deadline.toString() },
    sig,
  });
  return nextTrade(account.address, before);
}

// moves vault MUSD out to a throwaway address so cash lands on an exact amount
export async function setCash(account: PrivateKeyAccount, dollars: string) {
  const want = parseUnits(dollars, 18);
  const have = await vaultBalance(account.address, dep.musd);
  if (have < want) return fund(account, dollars);
  if (have === want) return;
  const message = { user: account.address, token: dep.musd, amount: have - want, to: "0x000000000000000000000000000000000000dEaD" as Address, nonce: await vaultNonce(account.address), deadline: deadline() };
  const sig = await account.signTypedData({ domain: domainFor(31337, dep.vault), types: withdrawTypes, primaryType: "Withdraw", message });
  await post(routes.withdraw, { withdraw: { ...message, amount: message.amount.toString(), nonce: message.nonce.toString(), deadline: message.deadline.toString() }, sig });
  await expect.poll(() => vaultBalance(account.address, dep.musd), { timeout: 30_000 }).toBe(want);
}
