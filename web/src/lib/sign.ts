import { bytesToHex, parseSignature, zeroAddress, type Address } from "viem";
import {
  domainFor,
  intentTypes,
  readPermitDomain,
  launchTypes,
  permitTypes,
  tradeTypes,
  transferWithAuthorizationTypes,
  withdrawTypes,
  type Deployment,
  type IntentBody,
  type LaunchBody,
  type PermitDepositBody,
  type SweepBody,
  type TradeBody,
  type WithdrawBody,
} from "shared";
import { publicClient } from "./chain";
import { api } from "./http";
import type { Signer } from "./signer";

const deadline = () => BigInt(Math.floor(Date.now() / 1000) + 600);
const nonceOf = async (user: Address) => BigInt((await api.nonce(user)).nonce);

export type TradeInput = { token: Address; isBuy: boolean; amountIn: bigint; minOut: bigint; ref?: Address };

export async function signTrade(signer: Signer, dep: Deployment, t: TradeInput): Promise<TradeBody> {
  const message = {
    user: signer.address,
    token: t.token,
    isBuy: t.isBuy,
    amountIn: t.amountIn,
    minOut: t.minOut,
    ref: t.ref ?? zeroAddress,
    nonce: await nonceOf(signer.address),
    deadline: deadline(),
  };
  const sig = await signer.signTypedData({ domain: domainFor(dep.chainId, dep.vault), types: tradeTypes, primaryType: "Trade", message });
  return {
    trade: {
      ...message,
      amountIn: message.amountIn.toString(),
      minOut: message.minOut.toString(),
      nonce: message.nonce.toString(),
      deadline: message.deadline.toString(),
    },
    sig,
  };
}

export type IntentInput = { chainId: number; token: string; isBuy: boolean; amountIn: bigint; minOut: bigint; ref?: Address };

export async function signIntent(signer: Signer, dep: Deployment, t: IntentInput): Promise<IntentBody> {
  const message = {
    user: signer.address,
    isBuy: t.isBuy,
    chainId: BigInt(t.chainId),
    token: t.token,
    amountIn: t.amountIn,
    minOut: t.minOut,
    ref: t.ref ?? zeroAddress,
    nonce: await nonceOf(signer.address),
    deadline: deadline(),
  };
  const sig = await signer.signTypedData({ domain: domainFor(dep.chainId, dep.vault), types: intentTypes, primaryType: "Intent", message });
  return {
    intent: {
      ...message,
      chainId: message.chainId.toString(),
      amountIn: message.amountIn.toString(),
      minOut: message.minOut.toString(),
      nonce: message.nonce.toString(),
      deadline: message.deadline.toString(),
    },
    sig,
  };
}

export async function signWithdraw(signer: Signer, dep: Deployment, w: { token: Address; amount: bigint; to: Address }): Promise<WithdrawBody> {
  const message = { user: signer.address, ...w, nonce: await nonceOf(signer.address), deadline: deadline() };
  const sig = await signer.signTypedData({ domain: domainFor(dep.chainId, dep.vault), types: withdrawTypes, primaryType: "Withdraw", message });
  return {
    withdraw: { ...message, amount: w.amount.toString(), nonce: message.nonce.toString(), deadline: message.deadline.toString() },
    sig,
  };
}

export async function signLaunch(
  signer: Signer,
  dep: Deployment,
  l: { name: string; symbol: string; image: string; initialBuy: bigint },
): Promise<LaunchBody> {
  const message = { user: signer.address, ...l, nonce: await nonceOf(signer.address), deadline: deadline() };
  const sig = await signer.signTypedData({ domain: domainFor(dep.chainId, dep.vault), types: launchTypes, primaryType: "Launch", message });
  return {
    launch: { ...message, initialBuy: l.initialBuy.toString(), nonce: message.nonce.toString(), deadline: message.deadline.toString() },
    sig,
  };
}

export async function signPermit(signer: Signer, dep: Deployment, token: Address, amount: bigint): Promise<PermitDepositBody> {
  const owner = signer.address;
  const { domain, nonce } = await readPermitDomain(publicClient, dep.chainId, token, owner);
  const dl = deadline();
  const sig = await signer.signTypedData({
    domain,
    types: permitTypes,
    primaryType: "Permit",
    message: { owner, spender: dep.vault, value: amount, nonce, deadline: dl },
  });
  const { r, s, v, yParity } = parseSignature(sig);
  return { owner, token, amount: amount.toString(), deadline: dl.toString(), v: Number(v ?? BigInt(yParity + 27)), r, s };
}

// every native usdc these sweeps accept (base, arbitrum, optimism, ethereum) signs under this domain
const USDC_DOMAIN = { name: "USD Coin", version: "2" };

export async function signSweep(signer: Signer, s: { chainId: number; token: Address; amount: bigint; solver: Address }): Promise<SweepBody> {
  const nonce = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const message = { from: signer.address, to: s.solver, value: s.amount, validAfter: 0n, validBefore, nonce };
  const sig = await signer.signTypedData({
    domain: { ...USDC_DOMAIN, chainId: s.chainId, verifyingContract: s.token },
    types: transferWithAuthorizationTypes,
    primaryType: "TransferWithAuthorization",
    message,
  });
  return { owner: signer.address, chainId: s.chainId, token: s.token, value: s.amount.toString(), validAfter: "0", validBefore: validBefore.toString(), nonce, sig };
}
