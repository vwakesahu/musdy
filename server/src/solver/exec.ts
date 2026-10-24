import {
  AddressLookupTableAccount,
  Connection,
  Keypair,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import { createPublicClient, createWalletClient, http, keccak256, toHex, type Account, type Chain, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrum, base, bsc, mainnet } from "viem/chains";
import { SOLANA } from "shared";
import { log } from "../log";
import type { Quote, StepItem, SvmTxData, EvmTxData } from "./relay";

export interface StepRunner {
  evmAddress: string;
  solanaAddress: string | null;
  run(q: Quote): Promise<string[]>;
  received(chainId: number, hashes: string[], token: string, recipient: string): Promise<bigint | null>;
}

export const parseSolanaKey = (raw: string): Keypair => {
  const t = raw.trim();
  return Keypair.fromSecretKey(t.startsWith("[") ? Uint8Array.from(JSON.parse(t) as number[]) : bs58.decode(t));
};

const isSvm = (d: unknown): d is SvmTxData => !!d && Array.isArray((d as SvmTxData).instructions);
const isEvm = (d: unknown): d is EvmTxData => !!d && typeof (d as EvmTxData).to === "string" && typeof (d as EvmTxData).chainId === "number";

export class LiveRunner implements StepRunner {
  private account: Account;
  private chains: Record<number, Chain>;
  private sol: { kp: Keypair; conn: Connection } | null;

  constructor(opts: { key: Hex; solanaKey?: string; rpc: { base?: string; bsc?: string; solana?: string } }) {
    this.account = privateKeyToAccount(opts.key);
    const at = (c: Chain, url?: string): Chain => (url ? { ...c, rpcUrls: { default: { http: [url] } } } : c);
    this.chains = { [base.id]: at(base, opts.rpc.base), [bsc.id]: at(bsc, opts.rpc.bsc), [mainnet.id]: mainnet, [arbitrum.id]: arbitrum };
    this.sol = opts.solanaKey
      ? { kp: parseSolanaKey(opts.solanaKey), conn: new Connection(opts.rpc.solana ?? "https://api.mainnet-beta.solana.com", "confirmed") }
      : null;
  }

  get evmAddress() {
    return this.account.address;
  }
  get solanaAddress() {
    return this.sol?.kp.publicKey.toBase58() ?? null;
  }

  async run(q: Quote): Promise<string[]> {
    const hashes: string[] = [];
    for (const step of q.steps) {
      for (const item of step.items ?? []) {
        if (item.status === "complete") continue;
        if (step.kind !== "transaction") throw new Error(`relay step ${step.id} needs a ${step.kind}, the solver only sends transactions`);
        hashes.push(await this.send(step.id, item));
      }
    }
    return hashes;
  }

  private async send(id: string, item: StepItem): Promise<string> {
    const d = item.data;
    if (isSvm(d)) return this.sendSolana(d);
    if (isEvm(d)) return this.sendEvm(id === "approve" ? maxApproval(d) : d);
    throw new Error(`relay step ${id} has no transaction data`);
  }

  // relay reports a same chain swap as "no need to execute" with no amounts, so the receipt's transfer logs are the truth
  async received(chainId: number, hashes: string[], token: string, recipient: string): Promise<bigint | null> {
    const chain = this.chains[chainId];
    if (!chain || !hashes.length) return null;
    const pub = createPublicClient({ chain, transport: http() });
    const topic = keccak256(toHex("Transfer(address,address,uint256)"));
    let sum = 0n;
    let seen = false;
    for (const hash of hashes) {
      const r = await pub.getTransactionReceipt({ hash: hash as Hex }).catch(() => null);
      for (const l of r?.logs ?? []) {
        if (l.address.toLowerCase() !== token.toLowerCase() || l.topics[0] !== topic || !l.topics[2]) continue;
        if (`0x${l.topics[2].slice(26)}`.toLowerCase() !== recipient.toLowerCase()) continue;
        sum += BigInt(l.data);
        seen = true;
      }
    }
    return seen ? sum : null;
  }

  private async sendEvm(d: EvmTxData): Promise<string> {
    const chain = this.chains[d.chainId];
    if (!chain) throw new Error(`no rpc for chain ${d.chainId}`);
    const wallet = createWalletClient({ chain, transport: http(), account: this.account });
    const pub = createPublicClient({ chain, transport: http(), pollingInterval: 500 });
    const hash = await wallet.sendTransaction({
      to: d.to as Hex,
      data: (d.data ?? "0x") as Hex,
      value: BigInt(d.value ?? "0"),
      gas: d.gas !== undefined ? BigInt(d.gas) : undefined,
    });
    const r = await pub.waitForTransactionReceipt({ hash, timeout: 180_000 });
    if (r.status !== "success") throw new Error(`relay step reverted on chain ${d.chainId}: ${hash}`);
    log("solver.step_sent", { chainId: d.chainId, hash });
    return hash;
  }

  private async sendSolana(d: SvmTxData): Promise<string> {
    if (!this.sol) throw new Error("solana steps need SOLVER_SOLANA_KEY");
    const { kp, conn } = this.sol;
    const ixs = d.instructions.map(
      (i) =>
        new TransactionInstruction({
          programId: new PublicKey(i.programId),
          keys: i.keys.map((k) => ({ pubkey: new PublicKey(k.pubkey), isSigner: k.isSigner, isWritable: k.isWritable })),
          data: Buffer.from(i.data, "hex"),
        }),
    );
    const tables = (await Promise.all((d.addressLookupTableAddresses ?? []).map((a) => conn.getAddressLookupTable(new PublicKey(a)).then((r) => r.value)))).filter(
      (t): t is AddressLookupTableAccount => t !== null,
    );
    const latest = await conn.getLatestBlockhash("confirmed");
    const msg = new TransactionMessage({ payerKey: kp.publicKey, recentBlockhash: latest.blockhash, instructions: ixs }).compileToV0Message(tables);
    const tx = new VersionedTransaction(msg);
    tx.sign([kp]);
    const sig = await conn.sendTransaction(tx, { maxRetries: 5 });
    const res = await conn.confirmTransaction({ signature: sig, ...latest }, "confirmed");
    if (res.value.err) throw new Error(`solana step failed: ${JSON.stringify(res.value.err)}`);
    log("solver.step_sent", { chainId: SOLANA, hash: sig });
    return sig;
  }
}

// one unlimited approval to relay's spender means later trades are a single swap tx
const maxApproval = (d: EvmTxData): EvmTxData => {
  const data = (d.data ?? "0x") as Hex;
  if (!data.startsWith("0x095ea7b3") || data.length !== 138) return d;
  return { ...d, data: `${data.slice(0, 74)}${"f".repeat(64)}` as Hex };
};
