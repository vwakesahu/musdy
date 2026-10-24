import type { Chain, Hash, PublicClient, Transport } from "viem";
import type { Wallet } from "./chain";
import { log } from "./log";

// one account, one queue. nonces are handed out in order and resynced from the chain after any send error
export class Sender {
  private queue: Promise<unknown> = Promise.resolve();
  private nonce: number | null = null;

  constructor(
    readonly wallet: Wallet,
    private pub: PublicClient<Transport, Chain>,
    readonly name: string,
  ) {}

  get address() {
    return this.wallet.account.address;
  }

  submit(send: (nonce: number) => Promise<Hash>): Promise<Hash> {
    const run = async () => {
      if (this.nonce === null) this.nonce = await this.pub.getTransactionCount({ address: this.address, blockTag: "pending" });
      const nonce = this.nonce;
      try {
        const hash = await send(nonce);
        this.nonce = nonce + 1;
        log("sender.sent", { sender: this.name, nonce, hash });
        return hash;
      } catch (e) {
        this.nonce = null;
        throw e;
      }
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => undefined);
    return p;
  }
}
