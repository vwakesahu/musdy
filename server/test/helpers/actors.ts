import { createPublicClient, createWalletClient, erc20Abi, http, parseAbi, zeroAddress, type Address } from "viem";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { anvil } from "viem/chains";
import { domainFor, faucetMessage, launchTypes, tradeTypes, vaultAbi, withdrawTypes, type Deployment, type TxStatus } from "shared";
import { KEYS, type Stack } from "./anvil";
import { TestSocket } from "./ws";

export const post = async (base: string, path: string, body: unknown, headers: Record<string, string> = {}) => {
  const r = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  return { status: r.status, body: (await r.json()) as Record<string, unknown> };
};
export const get = async <T>(base: string, path: string): Promise<{ status: number; body: T }> => {
  const r = await fetch(base + path);
  return { status: r.status, body: (await r.json()) as T };
};

const mintAbi = parseAbi(["function mint(address to, uint256 amount)"]);

// a fresh client ip per actor so the faucet's per ip limit only bites where a test means it to
export const randomIp = () => `10.${[0, 0, 0].map(() => Math.floor(Math.random() * 256)).join(".")}`;

export const deadline = (s = 600) => String(Math.floor(Date.now() / 1000) + s);

export class Actor {
  readonly account: PrivateKeyAccount;
  readonly ip = randomIp();
  constructor(
    private s: Stack,
    readonly socket: TestSocket,
  ) {
    this.account = privateKeyToAccount(generatePrivateKey());
  }

  static async create(s: Stack): Promise<Actor> {
    const socket = await TestSocket.open(`ws://localhost:${s.app.port}/ws`);
    const a = new Actor(s, socket);
    socket.send({ type: "hello", address: a.address });
    socket.send({ type: "subscribe", topic: `user:${a.address}` });
    return a;
  }

  get address(): Address {
    return this.account.address;
  }
  get pub() {
    return createPublicClient({ chain: anvil, transport: http(this.s.anvil.rpc) });
  }
  get dep(): Deployment {
    return this.s.dep;
  }

  async nonce(): Promise<bigint> {
    return this.pub.readContract({ address: this.dep.vault, abi: vaultAbi, functionName: "nonces", args: [this.address] });
  }
  async vaultBalance(token: Address): Promise<bigint> {
    return this.pub.readContract({ address: this.dep.vault, abi: vaultAbi, functionName: "balanceOf", args: [this.address, token] });
  }
  async walletBalance(token: Address): Promise<bigint> {
    return this.pub.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [this.address] });
  }

  // the mocks expose a public mint, the deployer pays gas
  async mintToWallet(token: Address, amount: bigint) {
    const w = createWalletClient({ chain: anvil, transport: http(this.s.anvil.rpc), account: privateKeyToAccount(KEYS.DEPLOYER_KEY as `0x${string}`) });
    const hash = await w.writeContract({ address: token, abi: mintAbi, functionName: "mint", args: [this.address, amount] });
    await this.pub.waitForTransactionReceipt({ hash });
  }

  waitTx(id: string, timeoutMs = 15000): Promise<TxStatus> {
    return this.socket
      .next((m) => m.type === "tx" && m.tx.id === id && m.tx.status !== "pending", timeoutMs)
      .then((m) => (m.type === "tx" ? m.tx : Promise.reject(new Error("not a tx"))));
  }

  // posts, expects Accepted, waits for the final status and for the server to index the block
  async submit(path: string, body: unknown): Promise<TxStatus> {
    const r = await post(this.s.app.url, path, body, { "x-forwarded-for": this.ip });
    if (r.status !== 200) throw new Error(`${path} ${r.status} ${JSON.stringify(r.body)}`);
    const tx = await this.waitTx(String(r.body.id));
    if (tx.status !== "confirmed") throw new Error(`${path} ${tx.status} ${tx.error}`);
    await this.s.app.waitForBlock(Number(await this.pub.getBlockNumber()));
    return tx;
  }

  async faucetBody(issued = new Date().toISOString()) {
    return { address: this.address, issued, sig: await this.account.signMessage({ message: faucetMessage(this.address, issued) }) };
  }

  async faucet() {
    return this.submit("/faucet", await this.faucetBody());
  }

  async tradeBody(token: Address, isBuy: boolean, amountIn: bigint, opts: { ref?: Address; nonce?: bigint; deadline?: string; signer?: PrivateKeyAccount } = {}) {
    const trade = {
      user: this.address,
      token,
      isBuy,
      amountIn: amountIn.toString(),
      minOut: "0",
      ref: opts.ref ?? zeroAddress,
      nonce: (opts.nonce ?? (await this.nonce())).toString(),
      deadline: opts.deadline ?? deadline(),
    };
    const sig = await (opts.signer ?? this.account).signTypedData({
      domain: domainFor(31337, this.dep.vault),
      types: tradeTypes,
      primaryType: "Trade",
      message: { ...trade, amountIn: BigInt(trade.amountIn), minOut: 0n, nonce: BigInt(trade.nonce), deadline: BigInt(trade.deadline) },
    });
    return { trade, sig };
  }

  async trade(token: Address, isBuy: boolean, amountIn: bigint, ref?: Address) {
    return this.submit("/actions/trade", await this.tradeBody(token, isBuy, amountIn, { ref }));
  }

  async withdrawBody(token: Address, amount: bigint, to: Address) {
    const withdraw = { user: this.address, token, amount: amount.toString(), to, nonce: (await this.nonce()).toString(), deadline: deadline() };
    const sig = await this.account.signTypedData({
      domain: domainFor(31337, this.dep.vault),
      types: withdrawTypes,
      primaryType: "Withdraw",
      message: { ...withdraw, amount, nonce: BigInt(withdraw.nonce), deadline: BigInt(withdraw.deadline) },
    });
    return { withdraw, sig };
  }

  async launchBody(name: string, symbol: string, initialBuy: bigint) {
    const launch = { user: this.address, name, symbol, image: "", initialBuy: initialBuy.toString(), nonce: (await this.nonce()).toString(), deadline: deadline() };
    const sig = await this.account.signTypedData({
      domain: domainFor(31337, this.dep.vault),
      types: launchTypes,
      primaryType: "Launch",
      message: { ...launch, initialBuy, nonce: BigInt(launch.nonce), deadline: BigInt(launch.deadline) },
    });
    return { launch, sig };
  }
}
