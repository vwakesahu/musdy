import type { ServerWebSocket } from "bun";
import { ClientMsg, type FeedItem, type ServerMsg } from "shared";
import { log } from "./log";

export interface WsData {
  id: number;
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

const MAX_TOPICS = 200;
const MAX_FRAME = 4096;

export const normTopic = (topic: string) => topic.toLowerCase();

export class Hub {
  private topics = new Map<string, Set<Ws>>();
  private watched = new Map<string, number>();
  private nextId = 1;

  constructor(private deps: HubDeps) {}

  newData(): WsData {
    return { id: this.nextId++, address: null, subs: new Set() };
  }

  send(ws: Ws, msg: ServerMsg) {
    ws.send(JSON.stringify(msg));
  }

  open(ws: Ws) {
    this.send(ws, this.deps.welcome());
  }

  message(ws: Ws, raw: string | Buffer) {
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
    const topic = normTopic(msg.topic);
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
  }

  private unwatch(addr: string) {
    const n = (this.watched.get(addr) ?? 1) - 1;
    if (n <= 0) this.watched.delete(addr);
    else this.watched.set(addr, n);
  }

  hasSubscribers(topic: string): boolean {
    return (this.topics.get(normTopic(topic))?.size ?? 0) > 0;
  }

  publish(topic: string, make: (topic: string) => ServerMsg) {
    const t = normTopic(topic);
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
