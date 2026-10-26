# musdy deck facts

All DefiLlama numbers pulled from the API on 2026-10-26 (UTC). Last full day in the data is 2026-10-24; the 2026-10-25 row is partial and is excluded below. DefiLlama data can be revised later.

## 1. fomo (fomo.family, FOMO Labs)

Source: https://api.llama.fi/summary/fees/fomo?dataType=dailyRevenue (page: https://defillama.com/protocol/fomo). Fees (dataType=dailyFees) are about 5% higher than revenue.

| Window | Revenue | Dates |
|---|---|---|
| Last full day | $289,959 | 2026-10-24 |
| Last 7 full days | $2.36M (~$337K/day) | 2026-10-18 to 10-24 |
| Last 30 full days | $16.95M | 2026-09-25 to 10-24 |
| Last 90 days | $61.7M | to 2026-10-24 |
| Last 365 days | $85.3M | to 2026-10-24 |
| All-time | $87.4M | since 2025-01-31 |
| 30d annualised (x12.17) | ~$206M | from the 30d figure |
| 7d annualised (x52) | ~$123M | from the 7d figure |

**"About $2M a day" check.** That is not true today. Today's figure is about **$2M a WEEK** (7d = $2.36M). $2M a day only happened at the September 2026 peak: the best day was $1.84M on 2026-09-04 (fees that day were $2.15M), and the best 7 days (09-04 to 09-10) brought in $10.8M. September 2026 revenue was $32.5M, or $1.08M/day. Say "$2M+ a week" or "$17M in 30 days".

- Cointelegraph, 2026-09-07: fomo did $1.76M of daily revenue vs Pump.fun's $1.1M that day. Over 30 days Pump.fun had $57M vs fomo's $17.6M (cited in search results; link not fetched).
- Crypto Briefing, July 2026: fomo topped Jupiter and Phantom in 24h Solana revenue. https://cryptobriefing.com/fomo-surpasses-jupiter-phantom-solana-revenue/
- Solana Compass: $1.57M weekly revenue all-time high (July 2026). https://solanacompass.com/news/fomo-social-trading-app-hits-157m-weekly-revenue-all-time-high-on-solana and https://solanacompass.com/news/social-trading-app-fomo-briefly-tops-jupiter-and-phantom-in-solana-daily-revenue

**Revenue by chain (DefiLlama breakdown, 30 full days to 2026-10-24):**

| Chain | Revenue | Share |
|---|---|---|
| Solana | $11.07M | 65.3% |
| Robinhood Chain | $2.60M | 15.3% |
| Hyperliquid (perps) | $1.38M | 8.2% |
| BSC | $1.00M | 5.9% |
| Ethereum | $0.60M | 3.5% |
| Base | $0.23M | 1.4% |

All-time: Solana is $50.0M of the $87.4M (57%). By product over the 30 days: "fomo Wallet" (spot swaps) brought in $15.6M and Perps $1.38M.

**Funding**
- Series A, $17M, led by Benchmark, Nov 2025; total raised then was $19M. https://techcrunch.com/2025/11/06/why-benchmark-made-a-rare-crypto-bet-on-trading-app-fomo-with-17m-series-a
- Series B, $75M, led by Index Ventures at a $550M valuation, with USV and Benchmark joining, ~2026-06-23. Total raised is about $94M. https://dealroom.co/news/135412-crypto-trading-app-fomo-raises-75m-series-b-led-by-index-ventures-at-550/ and https://www.thesaasnews.com/news/fomo-raises-75m-series-b/

**Users and volume.** These are company-reported, as of the Series B in June 2026: 625K+ users, $4B cumulative trading volume, 110M social interactions (same sources as the Series B). In Nov 2025 the figures were ~$700M volume and 120K users. DefiLlama has no volume series for fomo. FLAG: we found no figure newer than June 2026.

**Fee model.** 0.5% per trade, gasless (Nov 2025 reports, e.g. https://pulse2.com/fomo-crypto-trading-app-raises-17-million-series-a/).

## 2. pump.fun (comparison)

Source: https://api.llama.fi/summary/fees/pump?dataType=dailyRevenue. pump.fun brought in $64.6M over 30 days (to 2026-10-24) and $13.3M over the last 7 days, so it earns about 3.8x fomo's revenue. Its last-365-day revenue is $480M and its all-time revenue is $1.38B.

## 3. Why Mezo

- **What MUSD is.** MUSD is Mezo's native stablecoin, "100% backed by Bitcoin reserves", pegged 1:1 to USD (DefiLlama stablecoin #303). You borrow it against BTC at fixed rates of 1-5% APR, with up to ~90% LTV and a 0.1% borrow fee. Positions below the minimum collateral ratio get liquidated. https://defillama.com/protocol/mezo-borrow, https://thedefiant.io/news/defi/mezo-building-a-global-economy-on-bitcoin
- **MUSD supply.** **$29.5M** on 2026-10-26, of which $28.85M is on Mezo and $0.63M is on Ethereum. The peak was $31.8M on 2026-07-17. Source: https://stablecoins.llama.fi/stablecoin/303 (page: https://defillama.com/stablecoin/mezo-usd)
- **Mezo chain TVL.** **$70.3M** on 2026-10-26, with a peak of $79.4M on 2026-09-22. Source: https://api.llama.fi/v2/historicalChainTvl/Mezo (page: https://defillama.com/chain/mezo)
- **BTC locked.** Mezo Earn (veBTC) holds **~804 BTC** ($62.7M) on 2026-10-26. https://defillama.com/protocol/mezo-earn
- FLAG: DefiLlama shows Mezo Borrow TVL at only $1.32M (16.6 BTC) today, down from a $29.2M peak on 2026-01-20. That is not consistent with $29.5M of MUSD outstanding if every MUSD is BTC-collateralised. The adapter may be undercounting, or the collateral may be counted elsewhere. Don't cite the Borrow TVL.
- FLAG: Mezo Bridge (Ethereum side) is $10.3M today, against a $317.5M peak on 2024-12-18. If someone checks, this shows Mezo's TVL has shrunk a lot since pre-mainnet.
- **Market size.** Data from the CoinGecko API, 2026-10-26:
  - BTC market cap is **$1.61T** at $80,050/BTC, about 60% of the $2.68T crypto market.
  - SOL market cap is **$59.7B** at $101.23.
  - So BTC is about **27x** SOL.
  - Source: https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,solana&vs_currencies=usd&include_market_cap=true
- **The argument.** Bitcoin is about 60% of all crypto value, yet fomo's revenue comes mostly from Solana (65%). BTC holders can't trade memecoins without selling BTC. musdy lets them borrow MUSD against their BTC and trade on any chain, and every trade settles back to MUSD on Mezo. That turns fomo-style volume into MUSD demand and onchain volume on Mezo, a chain with only $70M TVL and $29.5M of MUSD today, so even a small share would be material.

## 4. musdy (known, not researched)
musdy is live on Mezo testnet. It gets real fills on Base and BNB Chain mainnet via Relay. Trading is gasless, and login is Privy Google login.

## Proposed headline numbers
1. **fomo: $17M revenue in the last 30 days (~$206M annualised)**. Source: DefiLlama, 2026-09-25 to 10-24.
2. **fomo is valued at $550M (Index Ventures Series B, June 2026) on a 0.5%-per-trade model**, and 65% of its revenue comes from Solana.
3. **BTC is a $1.61T asset, 27x SOL, yet only $29.5M of MUSD exists**. Source: CoinGecko / DefiLlama, 2026-10-26.
