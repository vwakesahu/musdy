# musdy

fomo on mezo. you log in with email or google, you get one USD balance that's MUSD on mezo, and you buy and sell anything from it. bitcoin, tokenized stocks, and coins people launch right here. you see what everyone else is buying, live, and you copy them in one tap. nobody sees gas, a bridge or a chain switch. musdy.fun

## how it works

your money sits in `MusdyVault` on mezo as an internal ledger, MUSD is cash and everything else is a position. you never send a transaction yourself. the app signs an eip712 message (trade, withdraw, launch) and our relayer submits it and pays the BTC gas. the vault checks your signature and nonce, so the relayer can't move your money, it can only deliver what you signed. if our server dies you call `withdraw` on the vault yourself and leave.

deposits are automatic. send MUSD or BTC to your mezo address, the server sees it, the app signs a permit in the background and the relayer sweeps it into the vault. both tokens support erc2612 on mezo, BTC just names its nonce getter `nonce(owner)` instead of `nonces`.

trades are always MUSD against one token. if the token has a mezo pools pool the vault swaps there, if it's a coin launched on musdy it trades on `MusdyLaunchpad`'s bonding curve. when a curve sells out it graduates in the same tx, its MUSD and the last 206.9M tokens go into a new mezo pool and the LP is burned. the fee is 0.5% in MUSD.

the server indexes every vault and launchpad event into sqlite, works out prices from pool reserves and the curve, keeps cost basis and pnl per user, and pushes the feed, prices and balances over one websocket.

## what's in the repo

`contracts/` is foundry. `MusdyVault`, `MusdyLaunchpad`, `MusdyToken`, mocks of mezo pools for local, and a fork suite that runs against real mezo testnet. evm is london because mezo has no PUSH0.

`server/` is bun. relayer, indexer, pricing, pnl, the socket and the http api, all in `server/src`, one file per job.

`web/` is next 16. privy for login and the embedded wallet, wagmi and viem, vaul for the bottom sheets, lightweight-charts for the chart.

`shared/` is the contract between them. abis, zod schemas for every socket message and http body, the eip712 types, chain config and deployed addresses. nobody defines a shape anywhere else.

`docs/` has the brief, the spec with every acceptance criterion, the interface contract, the style guide and the review log.

## envs

one `.env` at the repo root, copy `.env.example`. for local it already works, it's all anvil keys.

`NEXT_PUBLIC_PRIVY_APP_ID` comes from dashboard.privy.io, turn on email, google and apple and embedded wallets for evm. without it the app shows a setup screen, local still works through the dev login.

`RELAYER_KEY` pays every user's gas, on testnet it needs test BTC from faucet.test.mezo.org. `FAUCET_KEY` holds MUSD for the testnet faucet button, borrow it against test BTC on testnet.mezo.org. leave it empty and the faucet is off.

`NEXT_PUBLIC_DEV_KEY` is a login for local e2e only, the app refuses it on any chain but 31337.

## running it

```
pnpm install
anvil --block-time 1
cd contracts && forge script script/DeployLocal.s.sol --broadcast --rpc-url http://127.0.0.1:8545
cd server && bun --env-file=../.env src/index.ts
cd web && pnpm dev
```

tests. `forge test` in contracts, `bun test` in server (it starts its own anvil), and the playwright specs in `web/e2e` need anvil, the server and the web up, `BASE_URL` if web isn't on :3000.

## testnet

deploys are run by a human with their own key, never from ci.

```
cd contracts
DEPLOYER_KEY=<your key> forge script script/DeployMezo.s.sol --broadcast --rpc-url https://rpc.test.mezo.org
./export-abi.sh
```

that writes key "31611" into `shared/deployments.json`. then run the server with `CHAIN_ID=31611`, `RPC_URL=https://rpc.test.mezo.org`, `RPC_WS=wss://rpc-ws.test.mezo.org` and funded relayer and faucet keys, and build the web with `NEXT_PUBLIC_CHAIN_ID=31611`.

## a few rules

commits are one line, `feat:`, `fix:`, `chore:`, `update:`, `refactor:`, eight words max, no trailers. comments only when something isn't obvious, one line. shapes live in `shared/` and nowhere else. phones get bottom sheets, never dialogs, and no input under 16px or ios zooms in.
