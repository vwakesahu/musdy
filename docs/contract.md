# contract

the only source of truth for the abi, events, socket messages, http routes, env and ports. code form lives in `shared/` and `contracts/src/interfaces/`. nobody redefines a shape locally. a worker that needs a change stops and tells the lead.

## packages and ports

contracts (foundry) writes abis to `shared/abi/` with `contracts/export-abi.sh` and addresses to `shared/deployments.json`. server (bun) on :8080, http and websocket on the same port. web (next) on :3000. anvil on :8545 with chain id 31337.

## on chain

solidity 0.8.28, evm london (mezo has no PUSH0), openzeppelin 5.1 vendored in `contracts/lib`. no upgradeability, no `tx.origin`, no `selfdestruct`, every state change emits an event, reentrancy guard on everything that moves tokens.

### MusdyVault

implements `IMusdyVault`. holds everyone's money as an internal ledger `balanceOf[user][token]`. MUSD is cash, everything else is a position.

constructor `(musd, btc, router, launchpad, feeRecipient, feeBps, owner)`. `factory` is read from `router.defaultFactory()`. feeBps starts at 50, max 100.

`deposit(token, amount, onBehalfOf)` pulls from msg.sender, credits onBehalfOf. crediting someone else only works for MUSD and BTC, any other token must be deposited for yourself. emits `Deposited`.

`depositWithPermit(owner, token, amount, deadline, v, r, s)` calls `permit(owner, vault, amount, deadline, v, r, s)` on the token then pulls from owner and credits owner. anyone can submit it, that's how the relayer sweeps. if the permit call reverts but allowance is already enough it still goes through (front run safe). emits `Deposited`.

`withdraw(token, amount, to)` is the escape hatch, msg.sender pulls its own balance. never depends on the relayer.

`executeTrade(Trade, sig)`, `executeWithdraw(Withdraw, sig)`, `executeLaunch(Launch, sig)` are submitted by anyone, usually the relayer. each checks the eip712 signature of `user` (ECDSA, eoa only), `nonce == nonces[user]` then increments it, and `block.timestamp <= deadline`. reverts `BadSignature`, `BadNonce`, `Expired`.

trade semantics. every trade is MUSD against one token. on a buy `amountIn` is MUSD, fee = amountIn * feeBps / 10000 goes to feeRecipient's internal balance, the rest is swapped, user gets tokens, `minOut` is checked on tokens. on a sell `amountIn` is tokens, the swap returns MUSD, fee is taken from that, user gets the rest, `minOut` is checked on the net MUSD. venue is the launchpad if `launchpad.isCurve(token)`, otherwise whichever of the volatile and stable mezo pools holds the larger MUSD reserve (volatile on a tie), ignoring a pool with a zero reserve on either side, else `NoRoute`. a curve buy can be partially filled when it sells out the curve, the unused MUSD stays in the user's balance and `musdAmount` reflects what was used. emits `Traded(user, token, isBuy, musdAmount, tokenAmount, fee, ref, venue)` where musdAmount is MUSD that left the user on a buy (fee included) and MUSD that reached the user on a sell (fee excluded).

`executeWithdraw` moves the internal balance out to `to`. launch tokens still on the curve revert inside the token transfer, that's on purpose.

`executeLaunch` calls `launchpad.createToken(name, symbol, image, user)` and if `initialBuy > 0` buys it on the curve from the user's MUSD with the same fee rule. emits `Launched` and, for the buy, `Traded`.

`quote(token, isBuy, amountIn)` returns `(amountOut, fee)` with the same math and venue choice, view only.

`setFee(recipient, bps)` owner only, `FeeTooHigh` above 100. emits `FeeSet`.

invariants, each one becomes an `invariant_` test. for every token, the sum of all internal balances is at most `token.balanceOf(vault)`. a user's balance only goes down through their own signature or their own `withdraw` call. nonces only go up by one per executed action. the vault never holds an allowance to the router or launchpad after a call returns.

### MusdyLaunchpad and MusdyToken

implements `IMusdyLaunchpad`. pump style constant product curve priced in MUSD.

constructor `(musd, router, virtualMusd, owner)`. `virtualToken` starts at 1,073,000,000e18, `TOTAL_SUPPLY` is 1,000,000,000e18, `CURVE_SUPPLY` is 793,100,000e18. testnet and local deploy with virtualMusd 1,500e18, which graduates at about 4,250 MUSD raised.

`createToken(name, symbol, image, creator)` deploys a `MusdyToken`, mints the whole supply to the launchpad. anyone. name 1 to 32 bytes, symbol 1 to 10, image up to 256, else `BadMetadata`. emits `TokenCreated`.

`buy(token, musdIn, minTokensOut, to)` requires `to == msg.sender` so locked tokens can only reach the buyer, never a pool before graduation. it pulls MUSD from msg.sender, tokensOut = vT - k / (vM + musdIn). if that passes the remaining curve supply it caps, computes musdUsed for the cap and refunds the rest to msg.sender. then if tokensSold == CURVE_SUPPLY it graduates in the same call. emits `CurveTrade`.

`sell(token, tokensIn, minMusdOut, to)` pulls tokens, musdOut = vM - k / (vT + tokensIn). emits `CurveTrade`.

graduation. `factory.getPool(token, musd, false)` or `createPool`, `PoolNotEmpty` if it already has LP supply (it can't, the pool can never receive the locked token), then all raised MUSD and the remaining 206,900,000e18 tokens go straight to the pool and `pool.mint(0x000000000000000000000000000000000000dEaD)`. marks graduated, unlocks token transfers, emits `Graduated`.

`MusdyToken` is a plain erc20 with 18 decimals. before graduation a transfer reverts unless `from` or `to` is the launchpad, so nobody can seed a pool at a bad price before graduation. the launchpad flips it once.

invariants. realMusd equals the MUSD the launchpad holds for that token until graduation. tokensSold never passes CURVE_SUPPLY. price only goes up on buys and down on sells. after graduation curve buy and sell revert `AlreadyGraduated`.

### local stand ins

anvil has no mezo. `contracts/src/mocks/` has `MockERC20Permit` (for MUSD and BTC), `MockPoolFactory`, `MockPool`, `MockRouter`, and `MockBtcPermit` which copies the BTC precompile (permit domain name "BTC", nonce getter `nonce(owner)`, no `eip712Domain()`), constant product with 0.3% fee, matching the `IMezoPools` subset exactly. they're for local dev and tests only. a fork test suite runs the vault against the real mezo testnet router and MUSD (`forge test --match-path test/fork/*` with `--fork-url mezo_testnet`).

### deploy

`script/DeployLocal.s.sol` deploys mocks, MUSD, BTC, NVDA, TSLA, GOOGL, seeds MUSD pools at testnet prices, deploys launchpad and vault, mints 1,000,000 MUSD to the faucet account (anvil account 1), writes `shared/deployments.json` under key "31337". `script/DeployMezo.s.sol` deploys launchpad and vault against the real testnet addresses in `shared/chains.ts` and writes key "31611". `deployments.json` is a map from chain id string to a `Deployment` (see `shared/types.ts`).

## socket

code form is `shared/socket.ts`. one websocket at `ws://host:8080/ws`.

topics are lowercase on the wire, both sides build them with `topicKey` from shared. client sends `hello {address?}` once, then `subscribe {topic}` and `unsubscribe {topic}`. topics are `feed:global`, `feed:following:<addr>`, `token:<addr>`, `user:<addr>`, `tokens`, `prices`.

server sends `welcome {serverTime, block, chainId}` on connect. `trade {topic, item, replay}` for every `Traded` event to feed:global, token:<token>, user:<trader>, and feed:following:<x> for every x following the trader. on subscribe to a feed, token or user topic the newest 50 trades are replayed oldest first with replay true. `token {topic, token}` on tokens when a coin launches, graduates, or its card changes. `prices {topic, block, prices}` once per block with only what moved. `balances {topic, block, vault, wallet}` on user:<addr> after any change, wallet is the user's own MUSD and BTC outside the vault, which drives auto deposit. `tx {topic, tx}` on user:<addr> for pending, confirmed, failed of anything the relayer sent for them. `error {code, message}` for bad messages, rate limits and caps, the web shows it, never drops it.

the client reconnects with backoff 0.5s doubling to 8s, resubscribes, and dedupes trades by id.

## http

code form is `shared/http.ts`, the `routes` map has every path and what it returns. json in and out, bigints as decimal strings, errors are `{code, message}` with a 4xx or 5xx. the signed POSTs answer with a `TxStatus` right away and the rest comes over the socket.

the server checks every signed body before spending gas: schema, deadline, nonce matches chain, signature recovers to user (for permits that's the permit signature over the token's own domain and nonce), and a `simulateContract` passes. the indexer only tracks MUSD, BTC, the tokens in deployments.json and tokens the launchpad created, everything else in a Deposited or Withdrawn event is ignored. a failed simulation is a 400 with the revert name, never a sent tx.

profile, follow and faucet use personal_sign messages from `shared/eip712.ts`, valid for 5 minutes. the faucet also has a per ip limit and a global hourly cap, and `/health` says whether it's on, the web never guesses that from the chain id.

the relayer locks `user:nonce` (and `owner:token` for permits) synchronously before its first await, so a duplicate POST is a 409 and never a second broadcast. a tx whose receipt times out stays pending until the chain nonce says otherwise.

## env

contracts. `RPC_URL`, `DEPLOYER_KEY` (local is anvil account 0, testnet is the creator's own key, never in the repo).

server. `PORT` 8080, `CHAIN_ID`, `RPC_URL`, `RPC_WS`, `RELAYER_KEY` (pays gas, needs test BTC), `FAUCET_KEY` (holds MUSD, optional, faucet off without it), `DB_PATH` default `./musdy.db`, `FAUCET_HOURLY_CAP` default 50, `TRUST_PROXY` (1 only behind a proxy you control, then the client ip is the rightmost x-forwarded-for entry the proxy added).

the relayer pays all gas for every signed action, no cash or rate based metering for now (decided 2026-10-24). permit domains are read with `readPermitDomain` from shared on both sides, and signed messages carry `issued` in the `zIssued` format.

web. `NEXT_PUBLIC_PRIVY_APP_ID`, `NEXT_PUBLIC_CHAIN_ID`, `NEXT_PUBLIC_RPC_URL`, `NEXT_PUBLIC_SERVER_URL` (http://localhost:8080), `NEXT_PUBLIC_SOCKET_URL` (ws://localhost:8080/ws), `NEXT_PUBLIC_DEV_KEY` (local e2e only, a throwaway anvil key, the app refuses it on any chain but 31337).

## acceptance criteria to tests

AC1 web e2e `login.spec.ts`. AC2 contracts `test_depositWithPermit_*` and `test_fork_depositWithPermit`, server `deposit.test.ts`, e2e `deposit.spec.ts` for MUSD and BTC. AC3 server `faucet.test.ts`. AC4 and AC5 contracts `test_trade_*`, server `trade.test.ts`, e2e `trade.spec.ts`. AC6 contracts `test_launch_*`, e2e `launch.spec.ts`. AC7 contracts `test_graduation_*`, `invariant_curve_*`. AC8 server `feed.test.ts`, e2e `feed.spec.ts`. AC9 contracts `test_trade_ref`, e2e `copy.spec.ts`. AC10 server `pnl.test.ts`, `leaderboard.test.ts`. AC11 server `profile.test.ts`, e2e `profile.spec.ts`. AC12 contracts `test_withdraw_*`, e2e `withdraw.spec.ts`. AC13 contracts `test_escapeHatch`. AC14 server `socket.test.ts` kills and reconnects a client and checks the replay.

## cross chain, milestone 2

the user's cash stays MUSD in the vault. coins on solana, base and bsc are bought and sold by our solver through relay, the user never sees a chain.

vault. `solver` is an owner set address. `executeIntent(Intent, sig)` checks the signature like the other actions. a buy moves `amountIn` MUSD from the user's balance to the solver's balance and emits `IntentOpened(id, user, isBuy, chainId, token, amountIn, minOut, ref)` where id is the eip712 digest. a sell moves no MUSD and emits the same event. `settleIntent(id, user, musdToUser, tokenAmount, ok)` is solver only, moves `musdToUser` from the solver's balance to the user (the sell proceeds, or the refund of a failed buy) and emits `IntentSettled(id, user, musdToUser, tokenAmount, ok)`. an intent settles once. a buy that isn't settled within 1 hour can be refunded by the user with `refundIntent(id)`.

solver. holds USDC on base and MUSD on mezo. a buy quotes relay from base USDC to the coin on its chain, recipient is the solver's wallet on that chain, then settles with the token amount received. a sell quotes relay from the coin back to base USDC and settles the MUSD value. positions in coins on other chains are a ledger in the server, backed by the solver's wallets and the IntentSettled events. this is custodial for v1, said plainly in the app.

deposits. `GET /deposit/chains` lists solana, base, bsc, ethereum and arbitrum. `GET /deposit/:address/:chainId` returns an open relay deposit address for that user and chain whose destination is USDC on base to the solver, reusable. when relay fills it the solver credits MUSD to the user with `deposit(MUSD, amount, user)`.

discovery. trending and new coins on solana, base and bsc come from dexscreener's public api with their real images, candles from geckoterminal's public api. no keys.
