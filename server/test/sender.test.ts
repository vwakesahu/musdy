import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createPublicClient, createWalletClient, http, parseEther, type Hash } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { anvil as anvilChain } from "viem/chains";
import { Sender } from "../src/sender";
import { ANVIL_READY, KEYS, startAnvil, type Anvil } from "./helpers/anvil";

describe.skipIf(!ANVIL_READY)("nonce managed sender on anvil", () => {
  let node: Anvil;
  beforeAll(async () => {
    node = await startAnvil();
  });
  afterAll(() => node?.stop());

  test("concurrent sends get consecutive nonces and all land, a failed send resyncs", async () => {
    const pub = createPublicClient({ chain: anvilChain, transport: http(node.rpc), pollingInterval: 200 });
    const wallet = createWalletClient({ chain: anvilChain, transport: http(node.rpc), account: privateKeyToAccount(KEYS.RELAYER_KEY as `0x${string}`) });
    const sender = new Sender(wallet, pub, "test");
    const to = privateKeyToAccount(generatePrivateKey()).address;
    const send = (nonce: number) => wallet.sendTransaction({ to, value: parseEther("0.01"), nonce });

    const hashes = await Promise.all(Array.from({ length: 10 }, () => sender.submit(send)));
    const receipts = await Promise.all(hashes.map((hash: Hash) => pub.waitForTransactionReceipt({ hash })));
    expect(receipts.every((r) => r.status === "success")).toBe(true);
    const nonces = await Promise.all(hashes.map(async (hash) => (await pub.getTransaction({ hash })).nonce));
    expect(nonces).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

    await expect(sender.submit(() => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    // a send that used a nonce then failed client side must not leave a gap
    await expect(sender.submit((n) => wallet.sendTransaction({ to, value: parseEther("1000000"), nonce: n }))).rejects.toThrow();
    const next = await sender.submit(send);
    expect((await pub.getTransaction({ hash: next })).nonce).toBe(10);
    await pub.waitForTransactionReceipt({ hash: next });
    expect(await pub.getBalance({ address: to })).toBe(parseEther("0.11"));
  });
});
