import { erc20Abi, maxUint256, type Address, type Chain, type Hash, type PublicClient, type Transport } from "viem";
import { vaultAbi, type Deployment } from "shared";
import { simulationError } from "../errors";
import { log } from "../log";
import type { Relayer } from "../relayer";
import { signCall, type Sender } from "../sender";

export type Outcome = { hash: Hash; ok: boolean; error: string | null };

const GAS_BUFFER_PCT = 130n;

// the solver's own mezo wallet: settles intents and credits bridged deposits through the vault
export class MezoOps {
  private approval: Promise<void> | null = null;

  constructor(
    private pub: PublicClient<Transport, Chain>,
    private dep: Deployment,
    readonly sender: Sender,
    private relayer: Relayer,
  ) {}

  get address(): Address {
    return this.sender.address;
  }

  private async call(functionName: string, args: readonly unknown[], address: Address = this.dep.vault, abi: readonly unknown[] = vaultAbi, onSent?: (h: Hash) => void): Promise<Outcome> {
    const account = this.sender.wallet.account;
    let request: Awaited<ReturnType<PublicClient<Transport, Chain>["simulateContract"]>>["request"];
    let gas: bigint;
    try {
      ({ request } = await this.pub.simulateContract({ account, address, abi, functionName, args } as Parameters<PublicClient<Transport, Chain>["simulateContract"]>[0]));
      const est = ((await this.pub.estimateContractGas(request as Parameters<PublicClient<Transport, Chain>["estimateContractGas"]>[0])) * GAS_BUFFER_PCT) / 100n;
      gas = est > 600_000n ? est : 600_000n;
    } catch (e) {
      throw simulationError(e);
    }
    const hash = await this.sender.submit((nonce, fees) => signCall(this.sender.wallet, { address, abi, functionName, args, gas, nonce, ...fees }));
    onSent?.(hash);
    const out = await this.relayer.mined(this.sender, hash);
    if (!out) throw new Error(`${functionName} did not finish before shutdown`);
    return out;
  }

  private ensureApproval(): Promise<void> {
    this.approval ??= (async () => {
      const allowance = await this.pub.readContract({ address: this.dep.musd, abi: erc20Abi, functionName: "allowance", args: [this.address, this.dep.vault] });
      if (allowance >= maxUint256 / 2n) return;
      const r = await this.call("approve", [this.dep.vault, maxUint256], this.dep.musd, erc20Abi);
      if (!r.ok) throw new Error(`solver approve ${r.error}`);
      log("solver.approved", { hash: r.hash });
    })().catch((e: unknown) => {
      this.approval = null;
      throw e;
    });
    return this.approval;
  }

  async deposit(amount: bigint, onBehalfOf: Address, onSent?: (h: Hash) => void): Promise<Outcome> {
    await this.ensureApproval();
    return this.call("deposit", [this.dep.musd, amount, onBehalfOf], this.dep.vault, vaultAbi, onSent);
  }

  cash(): Promise<bigint> {
    return this.pub.readContract({ address: this.dep.vault, abi: vaultAbi, functionName: "balanceOf", args: [this.address, this.dep.musd] });
  }

  async settle(id: Hash, user: Address, musdToUser: bigint, tokenAmount: bigint, ok: boolean): Promise<Outcome> {
    if (musdToUser > 0n) {
      const have = await this.cash();
      if (have < musdToUser) {
        const top = await this.deposit(musdToUser - have, this.address);
        if (!top.ok) throw new Error(`solver top up ${top.error}`);
      }
    }
    return this.call("settleIntent", [id, user, musdToUser, tokenAmount, ok]);
  }

  async settled(id: Hash): Promise<boolean> {
    const r = await this.pub.readContract({ address: this.dep.vault, abi: vaultAbi, functionName: "intents", args: [id] });
    return r[4];
  }

  async solverOnChain(): Promise<Address> {
    return this.pub.readContract({ address: this.dep.vault, abi: vaultAbi, functionName: "solver" });
  }

  feeBps(): Promise<number> {
    return this.pub.readContract({ address: this.dep.vault, abi: vaultAbi, functionName: "feeBps" });
  }
}
