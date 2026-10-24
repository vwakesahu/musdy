import { parseSignature, zeroAddress, type Address } from "viem";
import {
  domainFor,
  readPermitDomain,
  launchTypes,
  permitTypes,
  tradeTypes,
  withdrawTypes,
  type Deployment,
  type LaunchBody,
  type PermitDepositBody,
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
  // the same domain reader the server verifies with
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
