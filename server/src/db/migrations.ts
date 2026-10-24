// append only, each entry runs once via PRAGMA user_version
export const migrations: string[] = [
  `
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE tokens (
    address TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,
    name TEXT NOT NULL,
    image TEXT,
    decimals INTEGER NOT NULL,
    kind TEXT NOT NULL,
    creator TEXT,
    created_at INTEGER NOT NULL,
    pool TEXT,
    graduated INTEGER NOT NULL DEFAULT 0,
    virtual_musd TEXT,
    virtual_token TEXT,
    virtual_token0 TEXT,
    total_supply TEXT NOT NULL DEFAULT '0'
  );
  CREATE TABLE trades (
    id TEXT PRIMARY KEY,
    block INTEGER NOT NULL,
    log_index INTEGER NOT NULL,
    ts INTEGER NOT NULL,
    tx_hash TEXT NOT NULL,
    user TEXT NOT NULL,
    token TEXT NOT NULL,
    is_buy INTEGER NOT NULL,
    musd_amount TEXT NOT NULL,
    token_amount TEXT NOT NULL,
    fee TEXT NOT NULL,
    ref TEXT,
    venue TEXT NOT NULL,
    price TEXT NOT NULL,
    price_f REAL NOT NULL,
    musd_f REAL NOT NULL
  );
  CREATE INDEX trades_order ON trades (block, log_index);
  CREATE INDEX trades_user ON trades (user, block, log_index);
  CREATE INDEX trades_token ON trades (token, block, log_index);
  CREATE INDEX trades_ts ON trades (ts);
  CREATE TABLE transfers (
    id TEXT PRIMARY KEY,
    block INTEGER NOT NULL,
    log_index INTEGER NOT NULL,
    ts INTEGER NOT NULL,
    kind TEXT NOT NULL,
    user TEXT NOT NULL,
    token TEXT NOT NULL,
    amount TEXT NOT NULL,
    to_addr TEXT
  );
  CREATE INDEX transfers_user ON transfers (user, block, log_index);
  CREATE TABLE launches (id TEXT PRIMARY KEY, block INTEGER NOT NULL, ts INTEGER NOT NULL, user TEXT NOT NULL, token TEXT NOT NULL);
  CREATE TABLE curve_trades (
    id TEXT PRIMARY KEY,
    block INTEGER NOT NULL,
    log_index INTEGER NOT NULL,
    ts INTEGER NOT NULL,
    token TEXT NOT NULL,
    trader TEXT NOT NULL,
    is_buy INTEGER NOT NULL,
    musd_amount TEXT NOT NULL,
    token_amount TEXT NOT NULL,
    virtual_musd TEXT NOT NULL,
    virtual_token TEXT NOT NULL
  );
  CREATE TABLE graduations (
    id TEXT PRIMARY KEY,
    block INTEGER NOT NULL,
    ts INTEGER NOT NULL,
    token TEXT NOT NULL,
    pool TEXT NOT NULL,
    musd_liquidity TEXT NOT NULL,
    token_liquidity TEXT NOT NULL
  );
  CREATE TABLE prices (token TEXT NOT NULL, ts INTEGER NOT NULL, block INTEGER NOT NULL, price TEXT NOT NULL);
  CREATE INDEX prices_token ON prices (token, ts);
  CREATE TABLE profiles (address TEXT PRIMARY KEY, handle TEXT UNIQUE, avatar TEXT, updated_at INTEGER NOT NULL);
  CREATE TABLE follows (follower TEXT NOT NULL, target TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (follower, target));
  CREATE INDEX follows_target ON follows (target);
  CREATE TABLE follow_issued (follower TEXT NOT NULL, target TEXT NOT NULL, issued INTEGER NOT NULL, PRIMARY KEY (follower, target));
  CREATE TABLE faucet (address TEXT PRIMARY KEY, last_at INTEGER NOT NULL);
  `,
  `
  CREATE TABLE positions (
    user TEXT NOT NULL,
    token TEXT NOT NULL,
    amount TEXT NOT NULL,
    cost TEXT NOT NULL,
    realized TEXT NOT NULL,
    bought TEXT NOT NULL,
    volume TEXT NOT NULL,
    trades INTEGER NOT NULL,
    PRIMARY KEY (user, token)
  );
  CREATE INDEX positions_token ON positions (token);
  CREATE INDEX transfers_ts ON transfers (ts);
  CREATE TABLE faucet_claims (address TEXT NOT NULL, ip TEXT NOT NULL, at INTEGER NOT NULL);
  CREATE INDEX faucet_claims_ip ON faucet_claims (ip, at);
  CREATE INDEX faucet_claims_at ON faucet_claims (at);
  `,
  `
  CREATE TABLE intents (
    id TEXT PRIMARY KEY,
    user TEXT NOT NULL,
    is_buy INTEGER NOT NULL,
    chain_id INTEGER NOT NULL,
    token TEXT NOT NULL,
    amount_in TEXT NOT NULL,
    min_out TEXT NOT NULL,
    ref TEXT,
    status TEXT NOT NULL,
    request_id TEXT,
    token_amount TEXT,
    musd_out TEXT,
    fee TEXT NOT NULL DEFAULT '0',
    error TEXT,
    opened_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX intents_status ON intents (status);
  CREATE INDEX intents_user ON intents (user, token);
  CREATE TABLE deposit_addresses (
    user TEXT NOT NULL,
    chain_id INTEGER NOT NULL,
    address TEXT NOT NULL,
    min_usd REAL NOT NULL,
    created_at INTEGER NOT NULL,
    hot_until INTEGER NOT NULL,
    checked_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user, chain_id)
  );
  CREATE INDEX deposit_addresses_checked ON deposit_addresses (checked_at);
  CREATE TABLE deposit_fills (
    request_id TEXT PRIMARY KEY,
    user TEXT NOT NULL,
    chain_id INTEGER NOT NULL,
    address TEXT NOT NULL,
    usdc TEXT NOT NULL,
    status TEXT NOT NULL,
    hash TEXT,
    error TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX deposit_fills_status ON deposit_fills (status);
  ALTER TABLE tokens ADD COLUMN chain_id INTEGER;
  ALTER TABLE tokens ADD COLUMN raw_address TEXT;
  `,
  `
  CREATE TABLE sweeps (
    id TEXT PRIMARY KEY,
    user TEXT NOT NULL,
    chain_id INTEGER NOT NULL,
    token TEXT NOT NULL,
    value TEXT NOT NULL,
    valid_after TEXT NOT NULL,
    valid_before TEXT NOT NULL,
    nonce TEXT NOT NULL,
    sig TEXT NOT NULL,
    status TEXT NOT NULL,
    hash TEXT,
    error TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX sweeps_status ON sweeps (status);
  ALTER TABLE trades ADD COLUMN market_cap TEXT;
  `,
];
