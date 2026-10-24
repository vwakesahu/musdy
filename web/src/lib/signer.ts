import type { Address, Hex, TypedDataDefinition } from "viem";

// what every login method gives the app: an address that can sign silently
export type Signer = {
  address: Address;
  signTypedData: (data: TypedDataDefinition) => Promise<Hex>;
  signMessage: (message: string) => Promise<Hex>;
};
