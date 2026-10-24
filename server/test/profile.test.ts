import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { followMessage, profileMessage, type Profile } from "shared";
import { applyFollow, applyProfile, checkIssued, parseIssued } from "../src/auth";
import { openDb } from "../src/db";
import { HttpError } from "../src/errors";
import { Store } from "../src/store";
import { CONTRACTS_READY, SKIP_NOTE, startStack, tempDb, type Stack } from "./helpers/anvil";
import { get, post } from "./helpers/actors";

const user = () => privateKeyToAccount(generatePrivateKey());
const iso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();
const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    return e instanceof HttpError ? e.code : String(e);
  }
};

describe("personal_sign checks", () => {
  const store = new Store(openDb(tempDb()));

  test("issued must be iso 8601 and is valid for 5 minutes", () => {
    const now = Date.now();
    expect(parseIssued(new Date(now).toISOString())).toBe(now);
    expect(parseIssued("2026-10-24T10:00:00+02:00")).toBe(Date.parse("2026-10-24T08:00:00Z"));
    expect(parseIssued(String(now))).toBeNull();
    expect(parseIssued("2026-10-24")).toBeNull();
    expect(parseIssued("yesterday")).toBeNull();
    expect(() => checkIssued(new Date(now - 6 * 60_000).toISOString(), now)).toThrow("older than 5 minutes");
    expect(() => checkIssued(new Date(now + 5 * 60_000).toISOString(), now)).toThrow("future");
    expect(checkIssued(new Date(now - 4 * 60_000).toISOString(), now)).toBe(now - 4 * 60_000);
  });

  test("set a handle, refuse a taken one, a stale one and a forged one", async () => {
    const a = user();
    const b = user();
    const issued = iso();
    const body = { address: a.address, handle: "satoshi", issued, sig: await a.signMessage({ message: profileMessage("satoshi", issued) }) };
    expect(await code(applyProfile(store, body))).toBe("ok");
    expect(store.profile(a.address)?.handle).toBe("satoshi");

    const taken = { address: b.address, handle: "satoshi", issued, sig: await b.signMessage({ message: profileMessage("satoshi", issued) }) };
    expect(await code(applyProfile(store, taken))).toBe("handle_taken");
    const old = iso(-6 * 60_000);
    expect(await code(applyProfile(store, { ...body, issued: old, sig: await a.signMessage({ message: profileMessage("satoshi", old) }) }))).toBe("expired");
    expect(await code(applyProfile(store, { ...body, sig: await b.signMessage({ message: profileMessage("satoshi", issued) }) }))).toBe("bad_signature");
    expect(await code(applyProfile(store, { ...body, handle: "Bad Handle!" }))).toBe("bad_body");
  });

  test("follow and unfollow, refusing replays and self follows", async () => {
    const a = user();
    const b = user();
    const t1 = iso(-1000);
    const follow = { address: a.address, target: b.address, follow: true, issued: t1, sig: await a.signMessage({ message: followMessage(b.address, true, t1) }) };
    expect(await code(applyFollow(store, follow))).toBe("ok");
    expect(store.followCounts(b.address)).toEqual({ followers: 1, following: 0 });
    expect(store.followers(b.address)).toEqual([a.address.toLowerCase()]);

    const t2 = iso();
    expect(await code(applyFollow(store, { ...follow, follow: false, issued: t2, sig: await a.signMessage({ message: followMessage(b.address, false, t2) }) }))).toBe("ok");
    expect(store.followCounts(b.address).followers).toBe(0);
    expect(await code(applyFollow(store, follow))).toBe("stale");
    expect(await code(applyFollow(store, { ...follow, target: a.address }))).toBe("self_follow");
    expect(await code(applyFollow(store, { ...follow, follow: false, issued: iso(500) }))).toBe("bad_signature");
  });
});

describe.skipIf(!CONTRACTS_READY)(`profile over http${SKIP_NOTE}`, () => {
  let s: Stack;
  beforeAll(async () => {
    s = await startStack();
  }, 120000);
  afterAll(async () => s && (await s.stop()));

  test("POST /profile returns the profile with the handle, follows show in counts", async () => {
    const a = user();
    const b = user();
    const issued = iso();
    const r = await post(s.app.url, "/profile", { address: a.address, handle: "alice_1", issued, sig: await a.signMessage({ message: profileMessage("alice_1", issued) }) });
    expect(r.status).toBe(200);
    const p = r.body as unknown as Profile;
    expect(p.user).toEqual({ address: a.address, handle: "alice_1", avatar: null });
    expect(p.balanceMusd).toBe("0");

    const f = await post(s.app.url, "/follow", { address: b.address, target: a.address, follow: true, issued, sig: await b.signMessage({ message: followMessage(a.address, true, issued) }) });
    expect(f).toEqual({ status: 200, body: { ok: true } });
    const again = (await get<Profile>(s.app.url, `/users/${a.address}`)).body;
    expect([again.followers, again.following, again.followedByViewer]).toEqual([1, 0, null]);
    expect((await get<Profile>(s.app.url, `/users/${a.address}?viewer=${b.address}`)).body.followedByViewer).toBe(true);
    expect((await get<Profile>(s.app.url, `/users/${b.address}?viewer=${a.address}`)).body.followedByViewer).toBe(false);

    const bad = await post(s.app.url, "/profile", { address: a.address, handle: "alice_2", issued, sig: await b.signMessage({ message: profileMessage("alice_2", issued) }) });
    expect([bad.status, bad.body.code]).toEqual([401, "bad_signature"]);
  });
});
