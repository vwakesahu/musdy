import { createWalletClient, erc20Abi, http, type Chain, type Hash, type PublicClient, type Transport } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { IntentBody, type Deployment } from "shared";
import { HttpError } from "../errors";
import { param, qAddress, type Ctx } from "../http";
import type { Hub } from "../hub";
import { log } from "../log";
import type { PriceBook } from "../price-book";
import type { Relayer } from "../relayer";
import { Sender, type SenderOpts } from "../sender";
import type { Store } from "../store";
import type { Views } from "../views";
import { SWEEP_ROUTES, type SolverEnv } from "./config";
import { Deposits } from "./deposits";
import { LiveRunner, type StepRunner } from "./exec";
import { MezoOps } from "./mezo";
import { RelayHttp, type RelayApi } from "./relay";
import { Solver, type IntentEvent } from "./solver";
import { SolverStore } from "./store";
import { ExternalUsdc, LiveUsdcChain, Sweeps, type UsdcChain } from "./sweep";

export interface SolverOpts {
  relay?: RelayApi;
  runner?: StepRunner;
  pollMs?: number;
  depositTickMs?: number;
  usdcChains?: UsdcChain[];
  externalEveryMs?: number;
}

export interface SolverKit {
  solver: Solver | null;
  deposits: Deposits;
  external: ExternalUsdc | null;
  onIntent(ev: IntentEvent): void;
  handlers: { intent(ctx: Ctx): unknown; depositChains(ctx: Ctx): unknown; depositAddress(ctx: Ctx): unknown; sweep(ctx: Ctx): unknown };
  start(): Promise<void>;
  stop(): void;
}

const off = () => new HttpError(503, "solver_off", "cross chain trading is off, the server has no SOLVER_KEY");

export const makeSolver = (
  env: SolverEnv,
  d: { pub: PublicClient<Transport, Chain>; chain: Chain; rpcUrl: string; dep: Deployment; store: Store; views: Views; book: PriceBook; hub: Hub; relayer: Relayer; onExternal?: (addr: string) => void },
  opts: SolverOpts & { sender?: SenderOpts } = {},
): SolverKit => {
  const relay = opts.relay ?? new RelayHttp(env.RELAY_URL, env.RELAY_API_KEY);
  const sstore = new SolverStore(d.store);
  let sender: Sender | null = null;
  let ops: MezoOps | null = null;
  let solver: Solver | null = null;
  let usdc: UsdcChain[] = [];
  if (env.SOLVER_KEY) {
    const account = privateKeyToAccount(env.SOLVER_KEY);
    usdc = opts.usdcChains ?? SWEEP_ROUTES.map((r) => new LiveUsdcChain(r, r.rpc(env), account));
    const wallet = createWalletClient({ chain: d.chain, transport: http(d.rpcUrl), account });
    sender = new Sender(wallet, d.pub, "solver", opts.sender);
    ops = new MezoOps(d.pub, d.dep, sender, d.relayer);
    const runner =
      opts.runner ??
      new LiveRunner({ key: env.SOLVER_KEY, solanaKey: env.SOLVER_SOLANA_KEY, rpc: { base: env.BASE_RPC_URL, bsc: env.BSC_RPC_URL, solana: env.SOLANA_RPC_URL } });
    solver = new Solver({ relay, runner, ops, store: sstore, views: d.views, book: d.book, hub: d.hub, pollMs: opts.pollMs });
  }
  const deposits = new Deposits({
    relay,
    store: sstore,
    hub: d.hub,
    ops,
    tickMs: opts.depositTickMs,
    receipt: (hash) => d.pub.getTransactionReceipt({ hash }).then((r) => r.status === "success", () => null),
  });
  const external = ops ? new ExternalUsdc({ chains: usdc, watched: () => d.hub.watchedAddresses(), onChange: (a) => d.onExternal?.(a), everyMs: opts.externalEveryMs }) : null;
  const sweeps = ops
    ? new Sweeps({
        chains: usdc,
        store: sstore,
        hub: d.hub,
        deposits,
        solver: ops.address,
        external,
        musdWallet: () => d.pub.readContract({ address: d.dep.musd, abi: erc20Abi, functionName: "balanceOf", args: [ops!.address] }),
      })
    : null;
  let active = false;

  return {
    get solver() {
      return active ? solver : null;
    },
    deposits,
    get external() {
      return active ? external : null;
    },
    onIntent: (ev) => {
      if (active) solver?.onEvent(ev);
      else log("solver.intent_ignored", { id: ev.id, kind: ev.kind });
    },
    handlers: {
      intent: ({ body }) => {
        const s = active ? solver : null;
        if (!s) throw off();
        return d.relayer.intent(body, (i) => s.check(i)).then((tx) => {
          // speed over certainty: the fill starts once the signed intent is accepted, the onchain open only has to land before settle
          const it = IntentBody.parse(body).intent;
          s.onEvent({ kind: "opened", id: tx.id as Hash, user: it.user, txHash: "0x" as Hash, block: 0, logIndex: 0, ts: Math.floor(Date.now() / 1000), isBuy: it.isBuy, chainId: Number(it.chainId), token: it.token, amountIn: BigInt(it.amountIn), minOut: BigInt(it.minOut), ref: it.ref });
          return tx;
        });
      },
      depositChains: () => deposits.chains(),
      depositAddress: ({ params }) => {
        const user = param(qAddress, params.address, "address");
        const chainId = Number(params.chainId);
        if (!Number.isInteger(chainId)) throw new HttpError(400, "bad_param", "chainId: not a number");
        if (!active) throw off();
        return deposits.address(user, chainId);
      },
      sweep: ({ body }) => {
        const s = active ? sweeps : null;
        if (!s) throw new HttpError(503, "solver_off", "USDC sweeps are off, the server has no SOLVER_KEY");
        return s.accept(body);
      },
    },
    start: async () => {
      if (!ops || !solver || !sender) {
        log("solver.off", { reason: "no SOLVER_KEY" });
        return;
      }
      const onChain = await ops.solverOnChain();
      if (onChain.toLowerCase() !== ops.address.toLowerCase()) {
        log("solver.off", { reason: "vault.solver is a different address", vault: onChain, key: ops.address });
        return;
      }
      sender.start();
      await solver.start();
      deposits.start();
      sweeps?.start();
      external?.start();
      active = true;
      log("solver.on", { address: ops.address, relayKey: relay.hasKey });
    },
    stop: () => {
      solver?.stop();
      deposits.stop();
      sweeps?.stop();
      external?.stop();
      sender?.stop();
    },
  };
};
