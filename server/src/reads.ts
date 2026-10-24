import type { Chain, ContractFunctionParameters, PublicClient, Transport } from "viem";

// many reads in one go: multicall3 where the chain has it, else a batched json-rpc round trip. failures become null
export const readMany = async <T>(pub: PublicClient<Transport, Chain>, calls: ContractFunctionParameters[]): Promise<(T | null)[]> => {
  if (!calls.length) return [];
  if (pub.chain.contracts?.multicall3) {
    const res = await pub.multicall({ contracts: calls, allowFailure: true });
    return res.map((r) => (r.status === "success" ? (r.result as T) : null));
  }
  const res = await Promise.allSettled(calls.map((c) => pub.readContract(c)));
  return res.map((r) => (r.status === "fulfilled" ? (r.value as T) : null));
};
