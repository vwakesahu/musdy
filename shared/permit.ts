import { parseAbi, type PublicClient } from "viem";
import { btcPermitDomain } from "./eip712";
import type { Address } from "./types";

export const permitReadAbi = parseAbi([
  "function eip712Domain() view returns (bytes1 fields, string name, string version, uint256 chainId, address verifyingContract, bytes32 salt, uint256[] extensions)",
  "function nonces(address owner) view returns (uint256)",
  "function nonce(address owner) view returns (uint256)",
]);

export type PermitDomain = { name: string; version: string; chainId: number; verifyingContract: Address };

type Reader = Pick<PublicClient, "readContract">;

// a token that answers eip712Domain() uses nonces(owner). only a token without eip712Domain() is treated as the BTC precompile
export async function readPermitDomain(client: Reader, chainId: number, token: Address, owner: Address): Promise<{ domain: PermitDomain; nonce: bigint }> {
  let domain: PermitDomain | null = null;
  try {
    const [, name, version, cid, verifyingContract] = await client.readContract({ address: token, abi: permitReadAbi, functionName: "eip712Domain" });
    domain = { name, version, chainId: Number(cid), verifyingContract };
  } catch {
    domain = null;
  }
  if (domain) return { domain, nonce: await client.readContract({ address: token, abi: permitReadAbi, functionName: "nonces", args: [owner] }) };
  const nonce = await client.readContract({ address: token, abi: permitReadAbi, functionName: "nonce", args: [owner] });
  return { domain: btcPermitDomain(chainId, token), nonce };
}
