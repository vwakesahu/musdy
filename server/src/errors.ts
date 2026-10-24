import { BaseError, ContractFunctionRevertedError, decodeErrorResult, parseAbi } from "viem";
import { launchpadAbi } from "shared";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const isError = <T extends { type: string }>(x: T): x is Extract<T, { type: "error" }> => x.type === "error";

// errors that can bubble out of the launchpad, tokens and openzeppelin during a vault call
const extraErrors = [
  ...launchpadAbi.filter(isError),
  ...parseAbi([
    "error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)",
    "error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed)",
    "error ERC2612ExpiredSignature(uint256 deadline)",
    "error ERC2612InvalidSigner(address signer, address owner)",
    "error ReentrancyGuardReentrantCall()",
    "error SafeERC20FailedOperation(address token)",
    "error Locked()",
    "error OnlyLaunchpad()",
  ]),
];

// turns a failed simulation into the revert's error name, or null if it was not a revert
export const revertOf = (e: unknown): { code: string; message: string } | null => {
  if (!(e instanceof BaseError)) return null;
  const r = e.walk((x) => x instanceof ContractFunctionRevertedError);
  if (!(r instanceof ContractFunctionRevertedError)) return null;
  if (r.data?.errorName) return { code: r.data.errorName, message: r.shortMessage };
  if (r.raw && r.raw !== "0x") {
    try {
      const d = decodeErrorResult({ abi: extraErrors, data: r.raw });
      return { code: d.errorName, message: r.shortMessage };
    } catch {
      return { code: r.signature ?? "Reverted", message: r.shortMessage };
    }
  }
  return { code: "Reverted", message: r.reason ?? r.shortMessage };
};

export const simulationError = (e: unknown): HttpError => {
  const rev = revertOf(e);
  if (rev) return new HttpError(400, rev.code, rev.message);
  return new HttpError(502, "rpc_error", e instanceof BaseError ? e.shortMessage : e instanceof Error ? e.message : String(e));
};
