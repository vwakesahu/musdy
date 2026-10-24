import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { StepRunner } from "../../src/solver/exec";
import type { Quote, QuoteParams, RelayApi, RelayChain, RelayRequest, StatusBody } from "../../src/solver/relay";

const DIR = join(import.meta.dir, "../fixtures/relay");
export const fixture = <T>(name: string): T => JSON.parse(readFileSync(join(DIR, `${name}.json`), "utf8")) as T;

export const SOLVER_SOL = "GTtzwxqy67xx9DVESJjx28TgXqpc8xTqtiytgNMaQBTE";
export const BONK = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";

// a recorded success request from relay, with its fill rewritten to pay `amount` of `token` to `to`
export const filled = (id: string, to: string, token: string, amount: bigint, chainId: number): RelayRequest => {
  const r = fixture<{ requests: RelayRequest[] }>("requests-v2-deposit").requests[0]!;
  return {
    ...r,
    id,
    status: "success",
    recipient: to,
    data: {
      ...r.data,
      outTxs: [{ chainId, stateChanges: [{ address: to, change: { kind: "token", balanceDiff: amount.toString(), data: { tokenAddress: token } } }] }],
    },
  };
};

export class FakeRelay implements RelayApi {
  hasKey = false;
  quotes: QuoteParams[] = [];
  quoteFor: (p: QuoteParams) => Quote = () => fixture("quote-buy-solana");
  statusFor: (id: string) => StatusBody = () => fixture("status-success");
  requestFor: (id: string) => RelayRequest | null = () => null;
  byAddress = new Map<string, RelayRequest[]>();
  quoteError: Error | null = null;

  async quote(p: QuoteParams): Promise<Quote> {
    this.quotes.push(p);
    if (this.quoteError) throw this.quoteError;
    return this.quoteFor(p);
  }
  async status(id: string) {
    return this.statusFor(id);
  }
  async request(id: string) {
    return this.requestFor(id);
  }
  async byDepositAddress(a: string) {
    return this.byAddress.get(a) ?? [];
  }
  async chains(): Promise<RelayChain[]> {
    return fixture<{ chains: RelayChain[] }>("chains").chains;
  }
}

export class FakeRunner implements StepRunner {
  received(): Promise<bigint | null> {
    return Promise.resolve(null);
  }

  runs: Quote[] = [];
  fail: Error | null = null;
  constructor(
    readonly evmAddress: string,
    readonly solanaAddress: string | null = SOLVER_SOL,
  ) {}
  async run(q: Quote) {
    this.runs.push(q);
    if (this.fail) throw this.fail;
    return ["0xfeed"];
  }
}
