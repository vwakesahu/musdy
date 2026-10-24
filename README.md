<img src="web/public/brand/app-icon-512.png" width="72" alt="musdy" />

# musdy

fomo on mezo. log in with google and you get one dollar balance. buy bitcoin, stocks and coins people launch on musdy from it, see what everyone else is buying as it happens, and copy any trade in one tap. no gas, no bridges, no wallet popups. musdy.fun

## what you can do

- see a live feed of every buy and sell, who made it, how big, and what they've made on it since.
- copy a trade in one tap, same coin, same dollar amount.
- buy and sell bitcoin, tokenized stocks and launched coins from the same balance.
- launch your own coin in one step with a name, a ticker and an optional first buy.
- follow traders, check their pnl, climb the leaderboard.
- deposit by sending MUSD or BTC to your address, it lands in your balance on its own.

## how it works

your balance is MUSD, mezo's dollar backed by bitcoin, held for you in the musdy vault on mezo. you never send a transaction. you sign what you want, our relayer delivers it and pays the gas. the vault only does what you signed, so the relayer can't touch your money, and you can always withdraw straight from the vault without us.

bitcoin and stocks trade through mezo pools. a coin launched on musdy starts on a bonding curve, and when the curve sells out it moves into its own mezo pool with the liquidity locked forever. every trade costs 0.5%.

## running it

```
pnpm install
anvil --block-time 1
cd contracts && forge script script/DeployLocal.s.sol --broadcast --rpc-url http://127.0.0.1:8545
cd server && bun --env-file=../.env src/index.ts
cd web && pnpm dev
```

copy `.env.example` to `.env` first. the rest of what a developer needs is in docs/development.md.
