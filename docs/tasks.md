# tasks, milestone 1

one package per worker, file disjoint. each task is done when its test passes and `docs/review_log.md` has its line.

## contracts (owns `contracts/`, writes `shared/abi/` and `shared/deployments.json` only through its scripts)

C1 `MockERC20Permit`, `MockPoolFactory`, `MockPool`, `MockRouter` in `src/mocks/`. test: a swap and an addLiquidity through the mock router match constant product with 0.3% fee.
C2 `MusdyToken` and `MusdyLaunchpad`. test: `test_launch_*`, `test_curve_buy_sell_*`, fuzz on buy then sell never returns more MUSD than paid, `test_graduation_*` creates the pool, burns LP, unlocks transfers, `invariant_curve_*`.
C3 `MusdyVault`. test: `test_deposit_*`, `test_depositWithPermit_*` including a front run permit, `test_trade_*` on pool and curve, `test_trade_ref`, `test_withdraw_*`, `test_escapeHatch`, `test_launch_*` through the vault, signature, nonce and deadline failures, `invariant_vault_*` from docs/contract.md.
C4 fork suite in `test/fork/` against mezo testnet: deposit MUSD (deal), buy and sell NVDA and BTC through the real router via the vault, launch and graduate a coin into a real mezo pool.
C5 `script/DeployLocal.s.sol`, `script/DeployMezo.s.sol`, run `export-abi.sh`. done check: `anvil` then `forge script script/DeployLocal.s.sol --broadcast --rpc-url http://127.0.0.1:8545` writes deployments.json key "31337" and abis come from the real contracts.

## server (owns `server/`)

S1 config and chain clients from env and `shared/deployments.json`, sqlite schema and migrations, `/health` and `/config`.
S2 indexer. backfill from startBlock in chunks, then follow new blocks. stores Traded, Deposited, Withdrawn, Launched, TokenCreated, CurveTrade, Graduated. reorg safe enough for cometbft instant finality, still idempotent by txHash:logIndex.
S3 prices and candles. pool reserves through multicall each block, curve price from CurveTrade, BTC price from the MUSD/BTC pool. 1m, 5m, 1h, 1d candles from trades.
S4 positions, average cost, pnl per window, leaderboard.
S5 relayer. the signed POSTs, all checks from docs/contract.md, one nonce managed sender, tx status to the socket. faucet with the 24h limit.
S6 wallet watcher. MUSD and BTC balances of every address that said hello, pushed as `balances`.
S7 socket. topics, replay of 50, following fan out, per message zod validation.
S8 profiles and follows with personal_sign checks.
tests: everything in docs/contract.md's AC list for server, run against a live anvil with DeployLocal applied, never a mocked chain. `bun test` must start anvil itself or use one on :8545.

## web (owns `web/`)

W1 providers. privy (email, google, apple, embedded wallet created on login, no signature prompts), dev login for 31337, wagmi on mezo, react query, one socket client in `src/lib/socket.ts`.
W2 shell. phone first, bottom tab bar with feed, explore, launch (center, raised), portfolio, profile. desktop is the same column centered, per docs/style_guide.md.
W3 feed. global and following tabs, live items sliding in, copy button.
W4 explore. trending, new launches with curve progress, stocks and BTC, search.
W5 token page. price, change, chart (lightweight-charts), trades tape, buy and sell bottom sheet with $10 $50 $100 custom and 25 50 100%, quote preview with fee and impact.
W6 portfolio. big total, cash, positions with pnl, deposit sheet (your mezo address, copy, QR, faucet button), withdraw sheet, auto deposit running in the background.
W7 launch. name, symbol, image url, first buy, preview card.
W8 profile and leaderboard. handle edit, follow, pnl windows, positions, trades.
tests: `pnpm typecheck`, `next build`, playwright specs from docs/contract.md against anvil, server and web all live, phone width 390 and desktop 1440, screenshots into `out/shots/`.
