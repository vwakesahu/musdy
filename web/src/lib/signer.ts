import type { Address, Hex, TypedDataDefinition } from "viem";

export type Signer = {
  address: Address;
  signTypedData: (data: TypedDataDefinition) => Promise<Hex>;
  signMessage: (message: string) => Promise<Hex>;
};
