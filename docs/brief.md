# brief

musdy is fomo on mezo. you log in with google, you get one USD balance that's MUSD on mezo, and you buy and sell anything from it. bitcoin, tokenized stocks, coins people launch on musdy, and later anything on solana, base or bsc. you see what everyone else is buying, live, and you can copy them in one tap. the domain is musdy.fun.

the end goal is fomo's feel with mezo underneath. privy login, deposit from anywhere, it lands as MUSD on mezo, every trade settles back to MUSD on mezo, nobody ever sees gas, a bridge or a chain switch.

## decisions so far

built feature by feature, not around the buildathon waves. web first, phone first layout, dark. the reference is fomo (fomo.family), we copy its craft and never its content. mezo testnet first (chain 31611), mainnet later. privy for login and the embedded wallet, google only. our relayer pays all gas, users only sign, no metering for now (decided 2026-10-24). MUSD is the unit of account for everything, fee is 0.5% per trade in MUSD. no upgradeable contracts, single owner for fee settings. persistence is sqlite on the box. repo is github.com/vwakesahu/musdy, private for now.

## first milestone

login, the vault with gasless deposits, buy and sell anything that has a MUSD pool on mezo, a pump style launchpad on mezo that graduates into mezo pools, the live feed, copy trade, pnl, leaderboard, profiles and follows, withdraw. everything in docs/spec.md.

## later milestones, in order

deposits from any chain (relay into base, our solver credits MUSD on mezo instantly and rebalances over wormhole). cross chain buy and sell through intents, base then solana then bsc. idle MUSD earning in mezo earn. borrow MUSD against BTC inside the app. card and apple pay onramp. perps, take profit and stop loss, alerts, theses.

## facts we built on

mezo is cosmos sdk with cometbft, 3 to 4 second blocks, instant finality, evm on the london fork so no PUSH0. MUSD and BTC both have erc2612 permit, BTC's nonce getter is `nonce(owner)` and its domain is name "BTC" version "1". mezo pools is aerodrome style, router `0x9a1f…D7E9` and factory `0x4947…Ce1A` on testnet, pool creation is permissionless. relay doesn't support mezo, checked 2026-10-24.
