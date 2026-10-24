import type { ServerWebSocket } from "bun";
import { ClientMsg, topicKey, type FeedItem, type ServerMsg } from "shared";
import { log } from "./log";

export interface WsData {
  id: number;
  ip: string;
  // token bucket for inbound messages
  tokens: number;
  refilled: number;
  address: string | null;
  // lowercase topics this socket is subscribed to
  subs: Set<string>;
}
export type Ws = ServerWebSocket<WsData>;

export interface HubDeps {
  welcome(): ServerMsg;
  // newest 50 trades for a trade topic, oldest first, or null if the topic has no replay
  replay(topic: string): FeedItem[] | null;
  onHello?(address: string): void;
  onSubscribe?(topic: string): void;
}

export const MAX_TOPICS = 64;
export const MAX_FRAME = 4096;
export const MAX_SOCKETS_PER_IP = 32;
// inbound messages per second per socket, with a burst of two seconds
export const MSG_RATE = 20;
const MSG_BURST = MSG_RATE * 2;
export const CLOSE_RATE_LIMIT = 1008;

export class Hub {
  private topics = new Map<string, Set<Ws>>();
  private watched = new Map<string, number>();
  private perIp = new Map<string, number>();
  private nextId = 1;

  constructor(private deps: HubDeps) {}

  // call before upgrading. null means the ip already has too many sockets
  admit(ip: string): WsData | null {
    const n = this.perIp.get(ip) ?? 0;
    if (n >= MAX_SOCKETS_PER_IP) return null;
    this.perIp.set(ip, n + 1);
    return { id: this.nextId++, ip, tokens: MSG_BURST, refilled: Date.now(), address: null, subs: new Set() };
  }

  // an admitted socket that never opened
  release(data: WsData) {
    const n = (this.perIp.get(data.ip) ?? 1) - 1;
    if (n <= 0) this.perIp.delete(data.ip);
    else this.perIp.set(data.ip, n);
  }

  private allow(ws: Ws): boolean {
    const d = ws.data;
    const now = Date.now();
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
      if (ws.data.address) this.unwatch(ws.data.address);
      ws.data.address = addr;
      if (addr) {
        this.watched.set(addr, (this.watched.get(addr) ?? 0) + 1);
        this.deps.onHello?.(addr);
      }
      return;
    }
    const topic = msg.topic;
    if (msg.type === "unsubscribe") {
      ws.data.subs.delete(topic);
      this.topics.get(topic)?.delete(ws);
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
    this.deps.onSubscribe?.(topic);
  }

  close(ws: Ws) {
    for (const topic of ws.data.subs) this.topics.get(topic)?.delete(ws);
    ws.data.subs.clear();
    if (ws.data.address) this.unwatch(ws.data.address);
    ws.data.address = null;
    this.release(ws.data);
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
