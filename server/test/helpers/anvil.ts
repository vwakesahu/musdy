import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Deployment } from "shared";
import { startApp, type App, type AppOpts } from "../../src/app";
import { Env } from "../../src/env";

const ROOT = resolve(import.meta.dir, "../../..");
const DEPLOYMENTS = join(ROOT, "shared/deployments.json");
const DEPLOY_SCRIPT = join(ROOT, "contracts/script/DeployLocal.s.sol");

const envExample = (): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const line of readFileSync(join(ROOT, ".env.example"), "utf8").split("\n")) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]!] = m[2]!;
  }
  return out;
};
export const KEYS = envExample();

const hasBin = (bin: string) => Bun.which(bin) !== null;
export const ANVIL_READY = hasBin("anvil");

const local = (): unknown => (JSON.parse(readFileSync(DEPLOYMENTS, "utf8")) as Record<string, unknown>)["31337"];
export const CONTRACTS_READY = ANVIL_READY && hasBin("forge") && existsSync(DEPLOY_SCRIPT) && !!local();
export const SKIP_NOTE = CONTRACTS_READY ? "" : " [skipped: shared/deployments.json has no 31337 yet, merge the contracts first]";

export interface Anvil {
  rpc: string;
  ws: string;
  stop(): void;
}

export const startAnvil = async (): Promise<Anvil> => {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const proc = Bun.spawn(["anvil", "--port", String(port), "--silent"], { stdout: "ignore", stderr: "pipe" });
  const rpc = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }) });
      if (r.ok) return { rpc, ws: `ws://127.0.0.1:${port}`, stop: () => proc.kill() };
    } catch {
      await Bun.sleep(100);
    }
  }
  proc.kill();
  throw new Error(`anvil did not start on ${port}`);
};

// runs the real DeployLocal script, then puts deployments.json back so shared/ never changes
export const deployLocal = async (rpc: string): Promise<Deployment> => {
  const before = readFileSync(DEPLOYMENTS, "utf8");
  try {
    const proc = Bun.spawn(["forge", "script", "script/DeployLocal.s.sol", "--broadcast", "--rpc-url", rpc, "--private-key", KEYS.DEPLOYER_KEY!], {
      cwd: join(ROOT, "contracts"),
      env: { ...process.env, RPC_URL: rpc, DEPLOYER_KEY: KEYS.DEPLOYER_KEY! },
      stdout: "pipe",
      stderr: "pipe",
    });
    const code = await proc.exited;
    if (code !== 0) throw new Error(`DeployLocal failed: ${await new Response(proc.stderr).text()}`);
    const written = (JSON.parse(readFileSync(DEPLOYMENTS, "utf8")) as Record<string, unknown>)["31337"];
    return Deployment.parse(written);
  } finally {
    writeFileSync(DEPLOYMENTS, before);
  }
};

export interface Stack {
  anvil: Anvil;
  dep: Deployment;
  app: App;
  env: Env;
  stop(): Promise<void>;
}

export const tempDb = () => join(mkdtempSync(join(tmpdir(), "musdy-")), "test.db");

type Overrides = Partial<Record<keyof Env, string>>;

export const startStack = async (overrides: Overrides | ((anvil: Anvil) => Overrides) = {}, opts: AppOpts = {}): Promise<Stack> => {
  const anvil = await startAnvil();
  const dep = await deployLocal(anvil.rpc);
  const env = Env.parse({
    PORT: "0",
    CHAIN_ID: "31337",
    RPC_URL: anvil.rpc,
    RPC_WS: anvil.ws,
    RELAYER_KEY: KEYS.RELAYER_KEY,
    FAUCET_KEY: KEYS.FAUCET_KEY,
    DB_PATH: tempDb(),
    // actors pick their ip with x-forwarded-for
    TRUST_PROXY: "1",
    MARKET: "0",
    ...(typeof overrides === "function" ? overrides(anvil) : overrides),
  });
  const app = await startApp(env, dep, opts);
  return {
    anvil,
    dep,
    app,
    env,
    stop: async () => {
      await app.stop();
      anvil.stop();
    },
  };
};

export const rpcCounter = (target: () => string) => {
  const counts = new Map<string, number>();
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const body = await req.text();
      try {
        const parsed = JSON.parse(body) as { method: string } | { method: string }[];
        for (const c of Array.isArray(parsed) ? parsed : [parsed]) counts.set(c.method, (counts.get(c.method) ?? 0) + 1);
      } catch {
      }
      const r = await fetch(target(), { method: "POST", headers: { "content-type": "application/json" }, body });
      return new Response(await r.text(), { status: r.status, headers: { "content-type": "application/json" } });
    },
  });
  return {
    url: `http://127.0.0.1:${server.port}`,
    count: (...methods: string[]) => methods.reduce((n, m) => n + (counts.get(m) ?? 0), 0),
    reset: () => counts.clear(),
    stop: () => server.stop(true),
  };
};
