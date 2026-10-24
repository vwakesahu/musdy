import { erc20Abi, getAddress, type Address, type Chain, type PublicClient, type Transport } from "viem";
import { vaultAbi, type Deployment } from "shared";
import type { Hub } from "./hub";
import { log, errMessage } from "./log";
import { readMany } from "./reads";
import type { Store } from "./store";

type Bal = { token: Address; amount: string };

// pushes vault and wallet balances to user:<addr> for every address that said hello
export class Watcher {
  private last = new Map<string, string>();

  constructor(
    private pub: PublicClient<Transport, Chain>,
    private store: Store,
    private hub: Hub,
    private dep: Deployment,
    private block: () => number,
  ) {}

  private async read(addr: string): Promise<{ vault: Bal[]; wallet: Bal[] } | null> {
    const user = getAddress(addr);
    const vaultTokens = [...new Set([this.dep.musd.toLowerCase(), ...this.store.heldTokens(addr)])].map((t) => getAddress(t));
    const walletTokens = [this.dep.musd, this.dep.btc];
    const res = await readMany<bigint>(this.pub, [
      ...vaultTokens.map((t) => ({ address: this.dep.vault, abi: vaultAbi, functionName: "balanceOf", args: [user, t] }) as const),
      ...walletTokens.map((t) => ({ address: t, abi: erc20Abi, functionName: "balanceOf", args: [user] }) as const),
    ]);
    if (res.some((r) => r === null)) return null;
    const vault = vaultTokens.map((token, i) => ({ token, amount: res[i]!.toString() })).filter((b, i) => i === 0 || b.amount !== "0");
    const wallet = walletTokens.map((token, i) => ({ token, amount: res[vaultTokens.length + i]!.toString() }));
    return { vault, wallet };
  }

  async push(addr: string, force: boolean) {
    const a = addr.toLowerCase();
    const snap = await this.read(a);
    if (!snap) return log("watcher.read_failed", { address: a });
    const key = JSON.stringify(snap);
    if (!force && this.last.get(a) === key) return;
    this.last.set(a, key);
    const block = this.block();
    this.hub.publish(`user:${a}`, (topic) => ({ type: "balances", topic, block, ...snap }));
  }

  async tick() {
    const watched = new Set(this.hub.watchedAddresses());
    for (const a of this.last.keys()) if (!watched.has(a)) this.last.delete(a);
    await Promise.all(
      [...watched].map((a) => this.push(a, false).catch((e) => log("watcher.error", { address: a, error: errMessage(e) }))),
    );
  }
}
