import { verifyMessage, type Address, type Hex } from "viem";
import { FollowBody, ProfileBody, followMessage, profileMessage, zIssued } from "shared";
import { HttpError } from "./errors";
import { parseBody } from "./relayer";
import type { Store } from "./store";

export const MESSAGE_TTL_MS = 5 * 60 * 1000;
const MAX_SKEW_MS = 60 * 1000;

export const parseIssued = (issued: string): number | null => {
  if (!zIssued.safeParse(issued).success) return null;
  const ms = Date.parse(issued);
  return Number.isNaN(ms) ? null : ms;
};

export const checkIssued = (issued: string, now = Date.now()): number => {
  const ms = parseIssued(issued);
  if (ms === null) throw new HttpError(400, "bad_issued", "issued must be an iso 8601 timestamp");
  if (now - ms > MESSAGE_TTL_MS) throw new HttpError(400, "expired", "signed message is older than 5 minutes");
  if (ms - now > MAX_SKEW_MS) throw new HttpError(400, "bad_issued", "issued is in the future");
  return ms;
};

export const checkPersonalSig = async (address: Address, message: string, signature: Hex) => {
  const ok = await verifyMessage({ address, message, signature }).catch(() => false);
  if (!ok) throw new HttpError(401, "bad_signature", "signature does not recover to address");
};

export const applyProfile = async (store: Store, body: unknown): Promise<Address> => {
  const b = parseBody(ProfileBody, body);
  checkIssued(b.issued);
  await checkPersonalSig(b.address, profileMessage(b.handle, b.issued), b.sig);
  const owner = store.profileByHandle(b.handle);
  if (owner && owner.address !== b.address.toLowerCase()) throw new HttpError(409, "handle_taken", "that handle is taken");
  store.setHandle(b.address, b.handle, Math.floor(Date.now() / 1000));
  return b.address;
};

export const applyFollow = async (store: Store, body: unknown): Promise<void> => {
  const b = parseBody(FollowBody, body);
  const issued = checkIssued(b.issued);
  if (b.address.toLowerCase() === b.target.toLowerCase()) throw new HttpError(400, "self_follow", "you can't follow yourself");
  await checkPersonalSig(b.address, followMessage(b.target, b.follow, b.issued), b.sig);
  const last = store.followIssued(b.address, b.target);
  // a replayed or older signature must not undo a newer follow or unfollow
  if (last !== null && issued <= last) throw new HttpError(400, "stale", "a newer follow action already applied");
  store.setFollow(b.address, b.target, b.follow, issued, Math.floor(Date.now() / 1000));
};
