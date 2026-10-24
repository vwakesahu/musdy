# spec, milestone 1

each one is testable. the package that proves it is in docs/contract.md.

AC1 login. a new user signs in with email or google through privy and lands on the feed with a mezo address and a $0.00 balance. on local anvil the dev login (`NEXT_PUBLIC_DEV_KEY`) does the same without privy.

AC2 auto deposit. MUSD or BTC that arrives in the user's own mezo address gets swept into the vault without the user paying gas. the app notices the wallet balance over the socket, signs a permit silently, the relayer submits `depositWithPermit`. the balance updates live.

AC3 faucet. on testnet and local, one tap gives 1,000 MUSD into the vault, once per address per 24 hours.

AC4 buy. on a token page the user picks $10, $50, $100 or a custom amount and buys. no wallet popup, no gas. the position shows up and cash drops within one block after the relayer sends it.

AC5 sell. sell 25%, 50% or 100% of a position back to MUSD, same flow.

AC6 launch. the user creates a coin with name, symbol, image url and an optional first buy. it shows under new on discover with its curve progress and anyone can buy it.

AC7 graduation. when a coin's curve sells out, its MUSD and remaining supply go into a mezo pools pool in the same tx, LP is burned, and trading continues through the pool with no change for the user.

AC8 feed. every trade from anyone shows on the global feed within one block. who, buy or sell, how much in dollars, which coin, when, and a copy button.

AC9 copy. copy on a feed item buys the same coin with the same dollar amount, capped at the user's cash. the new trade carries `ref` and the feed shows "copied <handle>".

AC10 pnl. portfolio and profile show each position's cost, value and pnl, and the total. the leaderboard ranks users by pnl for 24h, 7d and all time.

AC11 profile and follow. the user sets a handle. they follow someone and the following feed shows only people they follow.

AC12 withdraw. withdraw MUSD or any pool token to any address, gasless. a coin still on its curve can't leave the vault before graduation and the app says why.

AC13 escape hatch. a user can always pull their funds by calling `withdraw` on the vault directly, without our server.

AC14 live everywhere. prices, balances, the feed and curve progress update over the socket, no refresh. if the socket drops the client reconnects and the server replays the last 50 feed items.
