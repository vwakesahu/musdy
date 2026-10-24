import { CandleTf, SOLANA, TokenSort, type TokenInfo } from "shared";
import { buildCandles, TF_SECONDS } from "../candles";
import { HttpError } from "../errors";
import { param, type Ctx } from "../http";
import type { Store } from "../store";
import type { Views } from "../views";
import type { Market } from "./market";
import { isBase58, isEvm, mergeLists, normAddress, slugOf } from "./map";

const CANDLE_COUNT = 500;

type Target = { chainId: number | null; address: string };

export const marketRoutes = (market: Market | null, views: Views, store: Store, mezoChainId: number) => {
  const target = ({ params, query }: Ctx): Target => {
    const raw = params.address ?? "";
    const q = query.get("chainId");
    const chainId = q === null || q === "" ? null : Number(q);
    if (chainId !== null && chainId !== mezoChainId && !slugOf(chainId)) throw new HttpError(400, "bad_param", `chainId: ${q} is not supported`);
    if (chainId === null) {
      if (isEvm(raw)) return { chainId: store.token(raw) ? mezoChainId : null, address: raw };
      if (isBase58(raw)) return { chainId: SOLANA, address: raw };
    } else {
      const address = chainId === mezoChainId ? (isEvm(raw) ? raw : null) : normAddress(chainId, raw);
      if (address) return { chainId, address };
    }
    throw new HttpError(400, "bad_param", "address: not a token address for that chain");
  };

  const meme = async (t: Target): Promise<TokenInfo | null> => {
    if (!market) return null;
    if (t.chainId === null) return market.findEvm(t.address);
    return market.token({ chainId: t.chainId, address: t.address });
  };

  return {
    tokens: ({ query }: Ctx) => {
      const sort = param(TokenSort.default("trending"), query.get("sort"), "sort");
      return mergeLists(sort, views.tokens(sort), sort === "stocks" || !market ? [] : market.list(sort));
    },
    token: async (ctx: Ctx) => {
      const t = target(ctx);
      const info = t.chainId === mezoChainId ? views.token(t.address) : await meme(t);
      if (!info) throw new HttpError(404, "not_found", "unknown token");
      return info;
    },
    candles: async (ctx: Ctx) => {
      const tf = param(CandleTf.default("1m"), ctx.query.get("tf"), "tf");
      const t = target(ctx);
      if (t.chainId === mezoChainId) {
        const since = Math.floor(Date.now() / 1000) - TF_SECONDS[tf] * CANDLE_COUNT;
        return buildCandles(store.tokenTicks(t.address, since).map((r) => ({ ts: r.ts, price: r.price_f, volume: r.musd_f })), tf);
      }
      const info = await meme(t);
      if (!info || !market) throw new HttpError(404, "not_found", "unknown token");
      try {
        return (await market.candles({ chainId: info.chainId, address: info.address }, tf)) ?? [];
      } catch {
        throw new HttpError(503, "upstream_busy", "candles are rate limited upstream, try again shortly");
      }
    },
  };
};
