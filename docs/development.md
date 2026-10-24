# development

## what's in the repo

`contracts/` is foundry. `MusdyVault`, `MusdyLaunchpad`, `MusdyToken`, mocks of mezo pools for local, and a fork suite that runs against real mezo testnet. evm is london because mezo has no PUSH0.

`server/` is bun. relayer, indexer, pricing, pnl, the socket and the http api, all in `server/src`, one file per job.

`web/` is next 16. privy for login and the embedded wallet, wagmi and viem, vaul for the bottom sheets, lightweight-charts for the chart.

`shared/` is the contract between them. abis, zod schemas for every socket message and http body, the eip712 types, chain config and deployed addresses. nobody defines a shape anywhere else.

`docs/` has the brief, the spec with every acceptance criterion, the interface contract, the style guide and the review log.

## envs

one `.env` at the repo root, copy `.env.example`. for local it already works, it's all anvil keys.

`NEXT_PUBLIC_PRIVY_APP_ID` comes from dashboard.privy.io, google is the only login method, with embedded wallets for evm turned on. the app id is public, it goes in the root `.env`. without it the app shows a setup screen, local still works through the dev login.

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

tests. `forge test` in contracts, `bun test` in server (it starts its own anvil), and the playwright specs in `web/e2e` need anvil, the server and the web up, `BASE_URL` if web isn't on :3000. run that server with `TRUST_PROXY=1` so the faucet spec can claim from fresh ips, never set it in production unless a proxy you control sets the header.

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
