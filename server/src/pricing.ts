// prices are MUSD per 1 whole token, 1e18 scaled. MUSD has 18 decimals.
export const WAD = 10n ** 18n;
const unit = (decimals: number) => 10n ** BigInt(decimals);

export const poolPrice = (
  token: string,
  token0: string,
  reserve0: bigint,
  reserve1: bigint,
  decimals: number,
): bigint | null => {
  const isToken0 = token.toLowerCase() === token0.toLowerCase();
  const reserveToken = isToken0 ? reserve0 : reserve1;
  const reserveMusd = isToken0 ? reserve1 : reserve0;
  if (reserveToken === 0n) return null;
  return (reserveMusd * unit(decimals)) / reserveToken;
};

export const curvePrice = (virtualMusd: bigint, virtualToken: bigint): bigint | null =>
  virtualToken === 0n ? null : (virtualMusd * WAD) / virtualToken;

// execution price without the fee: buy musdAmount includes the fee, sell musdAmount excludes it
export const tradePrice = (isBuy: boolean, musdAmount: bigint, fee: bigint, tokenAmount: bigint, decimals: number): bigint => {
  if (tokenAmount === 0n) return 0n;
  const gross = isBuy ? musdAmount - fee : musdAmount + fee;
  return (gross * unit(decimals)) / tokenAmount;
};

export const valueOf = (amount: bigint, price: bigint, decimals: number): bigint => (amount * price) / unit(decimals);

export const toFloat = (x: bigint, decimals = 18): number => {
  const u = unit(decimals);
  return Number(x / u) + Number(x % u) / Number(u);
};

export const ratio = (num: bigint, den: bigint): number => (den === 0n ? 0 : toFloat((num * WAD) / den));
