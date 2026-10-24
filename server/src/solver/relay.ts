import { errMessage, log } from "../log";

export interface RelayCurrency {
  chainId: number;
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  metadata?: { logoURI?: string };
}
export interface RelayAmount {
  currency: RelayCurrency;
  amount: string;
  amountUsd?: string;
  minimumAmount?: string;
}

export interface EvmTxData {
  from: string;
  to: string;
  data?: string;
  value?: string;
  chainId: number;
  gas?: string | number;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}
export interface SvmTxData {
  instructions: { keys: { pubkey: string; isSigner: boolean; isWritable: boolean }[]; programId: string; data: string }[];
  addressLookupTableAddresses?: string[];
}
export interface StepItem {
  status: string;
  data?: EvmTxData | SvmTxData | Record<string, unknown>;
  check?: { endpoint: string; method: string };
}
export interface Step {
  id: string;
  kind: "transaction" | "signature";
  requestId?: string;
  depositAddress?: string;
  items: StepItem[];
}
export interface Quote {
  requestId?: string;
  steps: Step[];
  fees?: Record<string, RelayAmount>;
  details: { currencyIn: RelayAmount; currencyOut: RelayAmount; recipient?: string };
}

export interface QuoteParams {
  user: string;
  recipient: string;
  originChainId: number;
  originCurrency: string;
  destinationChainId: number;
  destinationCurrency: string;
  amount: string;
  tradeType: "EXACT_INPUT";
  useDepositAddress?: boolean;
  refundTo?: string;
}

export type RelayStatus = "waiting" | "depositing" | "pending" | "submitted" | "success" | "failure" | "refund" | "unknown";
export interface StatusBody {
  status: RelayStatus;
  txHashes?: string[];
  inTxHashes?: string[];
  failReason?: string | null;
}

interface StateChange {
  address: string;
  change: { kind: string; balanceDiff: string; data?: { tokenAddress?: string } };
}
interface OutTx {
  chainId?: number;
  stateChanges?: StateChange[] | null;
}
export interface RelayRequest {
  id: string;
  status: RelayStatus;
  recipient?: string;
  depositAddress?: { address?: string } | null;
  data?: {
    failReason?: string | null;
    outTxs?: OutTx[];
    metadata?: { currencyOut?: RelayAmount };
    route?: { actual?: { destination?: { outputCurrency?: RelayAmount } } };
  };
}

export interface RelayChain {
  id: number;
  displayName: string;
  iconUrl?: string;
  currency?: { symbol?: string };
}

export interface RelayApi {
  readonly hasKey: boolean;
  quote(p: QuoteParams): Promise<Quote>;
  status(requestId: string): Promise<StatusBody>;
  request(id: string): Promise<RelayRequest | null>;
  byDepositAddress(address: string): Promise<RelayRequest[]>;
  chains(): Promise<RelayChain[]>;
}

export class RelayError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const FINAL: RelayStatus[] = ["success", "refund"];

const sameAddr = (a: string | undefined, b: string) => !!a && (a.startsWith("0x") ? a.toLowerCase() === b.toLowerCase() : a === b);

// relay's own accounting: what reached the recipient in that currency, else the route's actual output
export const amountOut = (r: RelayRequest, recipient: string, currency: string): bigint | null => {
  let sum = 0n;
  let seen = false;
  for (const tx of r.data?.outTxs ?? [])
    for (const s of tx.stateChanges ?? []) {
      if (s.change.kind !== "token" || !sameAddr(s.address, recipient) || !sameAddr(s.change.data?.tokenAddress, currency)) continue;
      const d = BigInt(s.change.balanceDiff);
      if (d > 0n) {
        sum += d;
        seen = true;
      }
    }
  if (seen) return sum;
  const out = r.data?.route?.actual?.destination?.outputCurrency ?? r.data?.metadata?.currencyOut;
  if (out && sameAddr(r.recipient, recipient) && sameAddr(out.currency.address, currency)) return BigInt(out.amount);
  return null;
};

export class RelayHttp implements RelayApi {
  constructor(
    private base = "https://api.relay.link",
    private key?: string,
    private fetchFn: typeof fetch = fetch,
  ) {}

  get hasKey() {
    return !!this.key;
  }

  private async call<T>(path: string, init: RequestInit = {}, tries = 4): Promise<T> {
    const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json" };
    if (this.key) headers["x-api-key"] = this.key;
    for (let i = 0; ; i++) {
      let r: Response;
      try {
        r = await this.fetchFn(this.base + path, { ...init, headers, signal: AbortSignal.timeout(20_000) });
      } catch (e) {
        if (i + 1 >= tries) throw new RelayError(502, "relay_unreachable", errMessage(e));
        await Bun.sleep(500 * 2 ** i);
        continue;
      }
      if ((r.status === 429 || r.status >= 500) && i + 1 < tries) {
        log("relay.retry", { path: path.split("?")[0], status: r.status });
        await Bun.sleep(1000 * 2 ** i);
        continue;
      }
      const body = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      if (!r.ok) throw new RelayError(r.status, String(body.errorCode ?? body.code ?? "relay_error"), String(body.message ?? `relay answered ${r.status}`));
      return body as T;
    }
  }

  quote(p: QuoteParams): Promise<Quote> {
    return this.call<Quote>("/quote/v2", { method: "POST", body: JSON.stringify(p) });
  }

  status(requestId: string): Promise<StatusBody> {
    return this.call<StatusBody>(`/intents/status/v3?requestId=${encodeURIComponent(requestId)}`);
  }

  // /requests/v3 needs an api key, the deprecated v2 has the same request shape without one
  private requests(q: string): Promise<{ requests?: RelayRequest[] }> {
    return this.call(`/requests/${this.key ? "v3" : "v2"}?${q}`);
  }

  async request(id: string): Promise<RelayRequest | null> {
    return (await this.requests(`id=${encodeURIComponent(id)}`)).requests?.[0] ?? null;
  }

  async byDepositAddress(address: string): Promise<RelayRequest[]> {
    return (await this.requests(`depositAddress=${encodeURIComponent(address)}&sortBy=updatedAt&sortDirection=desc&limit=20`)).requests ?? [];
  }

  async chains(): Promise<RelayChain[]> {
    return (await this.call<{ chains?: RelayChain[] }>("/chains")).chains ?? [];
  }
}
