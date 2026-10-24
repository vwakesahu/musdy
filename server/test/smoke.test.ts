import { test, expect } from "bun:test";
// Boots the real server on a spare port and checks the welcome frame. Chain tests go against Anvil, never mocks.
test("welcome on connect", async () => {
  const port = 18080 + Math.floor(Math.random() * 1000);
  const proc = Bun.spawn(["bun", "src/index.ts"], { env: { ...process.env, PORT: String(port) }, stdout: "ignore", stderr: "ignore" });
  try {
    await Bun.sleep(400);
    const msg = await new Promise<string>((res, rej) => {
      const ws = new WebSocket(`ws://localhost:${port}`);
      ws.onmessage = (e) => { res(String(e.data)); ws.close(); };
      ws.onerror = rej;
    });
    expect(JSON.parse(msg).type).toBe("welcome");
  } finally { proc.kill(); }
});
