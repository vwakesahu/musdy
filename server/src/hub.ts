import type { ServerWebSocket } from "bun";
import { ClientMsg, topicKey, type FeedItem, type ServerMsg } from "shared";
import { log } from "./log";

export interface WsData {
  id: number;
  ip: string;
  tokens: number;
  refilled: number;
  address: string | null;
  hellos: number;
  subs: Set<string>;
}
export type Ws = ServerWebSocket<WsData>;

export interface HubDeps {
  welcome(): ServerMsg;
  replay(topic: string): FeedItem[] | null;
  onHello?(address: string): void;
  onSubscribe?(topic: string, address: string | null): void;
  maxWatched?: number;
  connBurst?: number;
  connPerSec?: number;
  helloAddrsPerMin?: number;
  now?: () => number;
}

export const MAX_TOPICS = 64;
export const MAX_FRAME = 4096;
export const MAX_SOCKETS_PER_IP = 32;
export const MSG_RATE = 20;
const MSG_BURST = MSG_RATE * 2;
export const CLOSE_RATE_LIMIT = 1008;
export const MAX_HELLOS = 3;
export const MAX_WATCHED = 2000;
// upgrade bucket per ip, so a reconnect loop can't mint fresh per socket hello budgets
export const CONN_BURST = 20;
export const CONN_PER_SEC = 0.5;
export const HELLO_ADDRS_PER_MIN = 20;
const MINUTE = 60_000;

export class Hub {
  private topics = new Map<string, Set<Ws>>();
  private watched = new Map<string, number>();
  private perIp = new Map<string, number>();
  private conns = new Map<string, { tokens: number; at: number }>();
  private helloAddrs = new Map<string, Map<string, number>>();
  private swept = 0;
  private nextId = 1;
  private now: () => number;

  constructor(private deps: HubDeps) {
    this.now = deps.now ?? Date.now;
  }

  admit(ip: string): WsData | null {
    const now = this.now();
    this.sweep(now);
    const n = this.perIp.get(ip) ?? 0;
    if (n >= MAX_SOCKETS_PER_IP) return null;
    const burst = this.deps.connBurst ?? CONN_BURST;
    const b = this.conns.get(ip) ?? { tokens: burst, at: now };
    b.tokens = Math.min(burst, b.tokens + ((now - b.at) / 1000) * (this.deps.connPerSec ?? CONN_PER_SEC));
    b.at = now;
    this.conns.set(ip, b);
    if (b.tokens < 1) {
      log("ws.conn_limited", { ip });
      return null;
    }
    b.tokens -= 1;
    this.perIp.set(ip, n + 1);
    return { id: this.nextId++, ip, tokens: MSG_BURST, refilled: now, address: null, hellos: 0, subs: new Set() };
  }

  private sweep(now: number) {
    if (now - this.swept < MINUTE) return;
    this.swept = now;
    const burst = this.deps.connBurst ?? CONN_BURST;
    const rate = this.deps.connPerSec ?? CONN_PER_SEC;
    for (const [ip, b] of this.conns) if (b.tokens + ((now - b.at) / 1000) * rate >= burst) this.conns.delete(ip);
    for (const [ip, m] of this.helloAddrs) {
      for (const [a, at] of m) if (now - at >= MINUTE) m.delete(a);
      if (!m.size) this.helloAddrs.delete(ip);
    }
  }

  private helloAllowed(ip: string, addr: string): boolean {
    const now = this.now();
    const m = this.helloAddrs.get(ip) ?? new Map<string, number>();
    for (const [a, at] of m) if (now - at >= MINUTE) m.delete(a);
    if (!m.has(addr) && m.size >= (this.deps.helloAddrsPerMin ?? HELLO_ADDRS_PER_MIN)) return false;
    m.set(addr, now);
    this.helloAddrs.set(ip, m);
    return true;
  }

  release(data: WsData) {
    const n = (this.perIp.get(data.ip) ?? 1) - 1;
    if (n <= 0) this.perIp.delete(data.ip);
    else this.perIp.set(data.ip, n);
  }

  private allow(ws: Ws): boolean {
    const d = ws.data;
    const now = this.now();
    d.tokens = Math.min(MSG_BURST, d.tokens + ((now - d.refilled) / 1000) * MSG_RATE);
    d.refilled = now;
    if (d.tokens < 1) return false;
    d.tokens -= 1;
    return true;
  }

  send(ws: Ws, msg: ServerMsg) {
    ws.send(JSON.stringify(msg));
  }

  open(ws: Ws) {
    this.send(ws, this.deps.welcome());
  }

  message(ws: Ws, raw: string | Buffer) {
    if (!this.allow(ws)) {
      log("ws.rate_limited", { id: ws.data.id, ip: ws.data.ip });
      return ws.close(CLOSE_RATE_LIMIT, "rate limit");
    }
    const text = typeof raw === "string" ? raw : raw.toString("utf8");
    if (text.length > MAX_FRAME) return this.send(ws, { type: "error", code: "too_large", message: "message too large" });
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return this.send(ws, { type: "error", code: "bad_json", message: "message is not json" });
    }
    const parsed = ClientMsg.safeParse(json);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return this.send(ws, { type: "error", code: "bad_msg", message: issue ? `${issue.path.join(".")} ${issue.message}`.trim() : "bad message" });
    }
    const msg = parsed.data;
    if (msg.type === "hello") {
      const addr = msg.address ? msg.address.toLowerCase() : null;
      if (addr === ws.data.address) return;
      if (addr && ws.data.hellos >= MAX_HELLOS)
        return this.send(ws, { type: "error", code: "too_many_hellos", message: `at most ${MAX_HELLOS} addresses per socket` });
      if (addr && !this.watched.has(addr) && this.watched.size >= (this.deps.maxWatched ?? MAX_WATCHED))
        return this.send(ws, { type: "error", code: "server_busy", message: "the server is watching too many addresses, try again later" });
      if (addr && !this.helloAllowed(ws.data.ip, addr))
        return this.send(ws, { type: "error", code: "too_many_hellos", message: "too many addresses from this ip, try again in a minute" });
      if (ws.data.address) this.unwatch(ws.data.address);
      ws.data.address = addr;
      if (addr) {
        ws.data.hellos++;
        this.watched.set(addr, (this.watched.get(addr) ?? 0) + 1);
        this.deps.onHello?.(addr);
      }
      return;
    }
    const topic = msg.topic;
    if (msg.type === "unsubscribe") {
      ws.data.subs.delete(topic);
      this.leave(topic, ws);
      return;
    }
    if (!ws.data.subs.has(topic) && ws.data.subs.size >= MAX_TOPICS)
      return this.send(ws, { type: "error", code: "too_many_topics", message: `at most ${MAX_TOPICS} topics per socket` });
    ws.data.subs.add(topic);
    const set = this.topics.get(topic) ?? new Set<Ws>();
    set.add(ws);
    this.topics.set(topic, set);
    const items = this.deps.replay(topic);
    if (items) for (const item of items) this.send(ws, { type: "trade", topic, item, replay: true });
    this.deps.onSubscribe?.(topic, ws.data.address);
  }

  close(ws: Ws) {
    for (const topic of ws.data.subs) this.leave(topic, ws);
    ws.data.subs.clear();
    if (ws.data.address) this.unwatch(ws.data.address);
    ws.data.address = null;
    this.release(ws.data);
  }

  private leave(topic: string, ws: Ws) {
    const set = this.topics.get(topic);
    if (!set) return;
    set.delete(ws);
    if (!set.size) this.topics.delete(topic);
  }

  topicCount(): number {
    return this.topics.size;
  }

  private unwatch(addr: string) {
    const n = (this.watched.get(addr) ?? 1) - 1;
    if (n <= 0) this.watched.delete(addr);
    else this.watched.set(addr, n);
  }

  hasSubscribers(topic: string): boolean {
    return (this.topics.get(topicKey(topic))?.size ?? 0) > 0;
  }

  publish(topic: string, make: (topic: string) => ServerMsg) {
    const t = topicKey(topic);
    const set = this.topics.get(t);
    if (!set?.size) return;
    const frame = JSON.stringify(make(t));
    for (const ws of set) ws.send(frame);
  }

  publishTrade(item: FeedItem, followers: string[]) {
    const topics = [
      "feed:global",
      `token:${item.token.address}`,
      `user:${item.user.address}`,
      ...followers.map((f) => `feed:following:${f}`),
    ];
    for (const topic of topics) this.publish(topic, (t) => ({ type: "trade", topic: t, item, replay: false }));
    log("trade.published", { id: item.id, topics: topics.length });
  }

  watchedAddresses(): string[] {
    return [...this.watched.keys()];
  }
}
