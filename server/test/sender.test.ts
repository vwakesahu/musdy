import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createPublicClient, createTestClient, createWalletClient, http, parseEther, TimeoutError, type Hash } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { anvil as anvilChain } from "viem/chains";
import type { Wallet } from "../src/chain";
import { Sender, type Fees } from "../src/sender";
import { ANVIL_READY, KEYS, startAnvil, type Anvil } from "./helpers/anvil";

// a locally signed value transfer, the sender broadcasts it
const signSend = async (wallet: Wallet, to: `0x${string}`, value: bigint, nonce: number, fees?: Fees) =>
  wallet.signTransaction(await wallet.prepareTransactionRequest({ to, value, nonce, gas: 21_000n, ...fees }));

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
    const send = (nonce: number) => signSend(wallet, to, parseEther("0.01"), nonce);

    const hashes = await Promise.all(Array.from({ length: 10 }, () => sender.submit(send)));
    const receipts = await Promise.all(hashes.map((hash: Hash) => pub.waitForTransactionReceipt({ hash })));
    expect(receipts.every((r) => r.status === "success")).toBe(true);
    const nonces = await Promise.all(hashes.map(async (hash) => (await pub.getTransaction({ hash })).nonce));
    expect(nonces).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

    await expect(sender.submit(() => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    // a send that used a nonce then failed client side must not leave a gap
    await expect(sender.submit((n) => signSend(wallet, to, parseEther("1000000"), n))).rejects.toThrow();
    const next = await sender.submit(send);
    expect((await pub.getTransaction({ hash: next })).nonce).toBe(10);
    await pub.waitForTransactionReceipt({ hash: next });
    expect(await pub.getBalance({ address: to })).toBe(parseEther("0.11"));
  });

  test("another party spending the cached nonce makes the next submit resync once and land", async () => {
    const pub = createPublicClient({ chain: anvilChain, transport: http(node.rpc), pollingInterval: 200 });
    const key = generatePrivateKey();
    const account = privateKeyToAccount(key);
    const testClient = createTestClient({ mode: "anvil", chain: anvilChain, transport: http(node.rpc) });
    await testClient.setBalance({ address: account.address, value: parseEther("10") });
    const wallet = createWalletClient({ chain: anvilChain, transport: http(node.rpc), account });
    const sender = new Sender(wallet, pub, "shared");
    const to = privateKeyToAccount(generatePrivateKey()).address;
    const send = (nonce: number) => signSend(wallet, to, parseEther("0.01"), nonce);

    await pub.waitForTransactionReceipt({ hash: await sender.submit(send) });
    // someone outside the sender uses the same key, so the sender's cached nonce is now spent
    const outsider = createWalletClient({ chain: anvilChain, transport: http(node.rpc), account });
    await pub.waitForTransactionReceipt({ hash: await outsider.sendTransaction({ to, value: parseEther("0.01") }) });

    const hash = await sender.submit(send);
    const receipt = await pub.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe("success");
    expect((await pub.getTransaction({ hash })).nonce).toBe(2);
    expect(await pub.getBalance({ address: to })).toBe(parseEther("0.03"));
  });

  test("the watchdog replaces a stuck nonce at a higher fee and only the replacement mines", async () => {
    const pub = createPublicClient({ chain: anvilChain, transport: http(node.rpc), pollingInterval: 200 });
    const wallet = createWalletClient({ chain: anvilChain, transport: http(node.rpc), account: privateKeyToAccount(KEYS.RELAYER_KEY as `0x${string}`) });
    const testClient = createTestClient({ mode: "anvil", chain: anvilChain, transport: http(node.rpc) });
    const sender = new Sender(wallet, pub, "stuck", { stuckMs: 200 });
    const to = privateKeyToAccount(generatePrivateKey()).address;
    await testClient.setAutomine(false);
    try {
      const first = await sender.submit((nonce, fees) => signSend(wallet, to, parseEther("0.01"), nonce, fees));
      expect(await sender.watchdog()).toEqual([]);
      const a = await pub.getTransaction({ hash: first });
      await Bun.sleep(300);
      const [second] = await sender.watchdog();
      expect(second).toBeDefined();
      expect(sender.hashesFor(first)).toEqual([first, second!]);
      const b = await pub.getTransaction({ hash: second! });
      expect(b.nonce).toBe(a.nonce);
      expect(b.maxFeePerGas! > a.maxFeePerGas!).toBe(true);
      await testClient.mine({ blocks: 1 });
      expect((await pub.getTransactionReceipt({ hash: second! })).status).toBe("success");
      await expect(pub.getTransactionReceipt({ hash: first })).rejects.toThrow();
      expect(await pub.getBalance({ address: to })).toBe(parseEther("0.01"));
    } finally {
      await testClient.setAutomine(true);
    }
  });

  test("a send whose answer is lost keeps its hash and mines, a definitive rejection still throws", async () => {
    const pub = createPublicClient({ chain: anvilChain, transport: http(node.rpc), pollingInterval: 200 });
    const real = createWalletClient({ chain: anvilChain, transport: http(node.rpc), account: privateKeyToAccount(KEYS.FAUCET_KEY as `0x${string}`) });
    let lose = true;
    // the node takes the tx, then the response is lost on the way back
    const flaky = new Proxy(real, {
      get(t, p, r) {
        if (p !== "sendRawTransaction") return Reflect.get(t, p, r);
        return async (args: Parameters<typeof real.sendRawTransaction>[0]) => {
          const hash = await t.sendRawTransaction(args);
          if (lose) throw new TimeoutError({ body: {}, url: node.rpc });
          return hash;
        };
      },
    }) as Wallet;
    const sender = new Sender(flaky, pub, "flaky");
    const to = privateKeyToAccount(generatePrivateKey()).address;
    const hash = await sender.submit((nonce) => signSend(flaky, to, parseEther("0.01"), nonce));
    expect(sender.nonceOf(hash)).not.toBeNull();
    expect((await pub.waitForTransactionReceipt({ hash })).status).toBe("success");
    // the next send continues at the following nonce
    lose = false;
    const next = await sender.submit((nonce) => signSend(flaky, to, parseEther("0.01"), nonce));
    expect((await pub.getTransaction({ hash: next })).nonce).toBe((await pub.getTransaction({ hash })).nonce + 1);
    await pub.waitForTransactionReceipt({ hash: next });
    // a reused nonce is a definitive rejection
    await expect(sender.submit(() => signSend(flaky, to, 1n, 0))).rejects.toThrow(/nonce/i);
    expect(await pub.getBalance({ address: to })).toBe(parseEther("0.02"));
  });
});
