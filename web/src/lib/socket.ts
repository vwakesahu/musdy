import { ServerMsg, topicKey, type Address } from "shared";
import { env } from "./env";

type Handler = (msg: ServerMsg) => void;
export type SocketStatus = "idle" | "connecting" | "open" | "closed";

const MIN_DELAY = 500;
const MAX_DELAY = 8000;
const SEEN_CAP = 1000;

class SocketClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<Handler>>();
  private globalHandlers = new Set<Handler>();
  private seen = new Map<string, Set<string>>();
  private address: Address | undefined;
  private delay = MIN_DELAY;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private statusListeners = new Set<() => void>();
  status: SocketStatus = "idle";

  private setStatus(s: SocketStatus) {
    this.status = s;
    for (const l of this.statusListeners) l();
  }

  onStatus(l: () => void) {
    this.statusListeners.add(l);
    return () => {
      this.statusListeners.delete(l);
    };
  }

  connect() {
    if (typeof window === "undefined" || this.ws || this.timer) return;
    this.setStatus("connecting");
    const ws = new WebSocket(env.socketUrl);
    this.ws = ws;
    ws.onopen = () => {
      this.delay = MIN_DELAY;
      this.setStatus("open");
      this.send({ type: "hello", ...(this.address ? { address: this.address } : {}) });
      for (const topic of this.handlers.keys()) this.send({ type: "subscribe", topic });
    };
    ws.onmessage = (ev) => this.receive(ev.data);
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.setStatus("closed");
      this.timer = setTimeout(() => {
        this.timer = null;
        this.connect();
      }, this.delay);
      this.delay = Math.min(this.delay * 2, MAX_DELAY);
    };
  }

  // hello is sent once per connection, so a new identity means a fresh connection
  identify(address: Address | undefined) {
    if (address?.toLowerCase() === this.address?.toLowerCase()) return;
    this.address = address;
    const ws = this.ws;
    if (ws) {
      this.ws = null;
      ws.close();
      this.connect();
    }
  }

  subscribe(raw: string, handler: Handler) {
    const topic = topicKey(raw);
    let set = this.handlers.get(topic);
    if (!set) {
      set = new Set();
      this.handlers.set(topic, set);
      this.send({ type: "subscribe", topic });
    }
    set.add(handler);
    this.connect();
    return () => {
      const s = this.handlers.get(topic);
      if (!s) return;
      s.delete(handler);
      if (s.size === 0) {
        this.handlers.delete(topic);
        this.seen.delete(topic);
        this.send({ type: "unsubscribe", topic });
      }
    };
  }

  onAny(handler: Handler) {
    this.globalHandlers.add(handler);
    this.connect();
    return () => {
      this.globalHandlers.delete(handler);
    };
  }

  private send(msg: { type: "hello"; address?: Address } | { type: "subscribe" | "unsubscribe"; topic: string }) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private receive(raw: unknown) {
    if (typeof raw !== "string") return;
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return;
    }
    const parsed = ServerMsg.safeParse(json);
    if (!parsed.success) return;
    const msg = parsed.data;
    for (const h of this.globalHandlers) h(msg);
    if (!("topic" in msg)) return;
    const topic = topicKey(msg.topic);
    if (msg.type === "trade" && !this.firstSeen(topic, msg.item.id)) return;
    const set = this.handlers.get(topic);
    if (set) for (const h of set) h(msg);
  }

  private firstSeen(topic: string, id: string) {
    let s = this.seen.get(topic);
    if (!s) {
      s = new Set();
      this.seen.set(topic, s);
    }
    if (s.has(id)) return false;
    s.add(id);
    if (s.size > SEEN_CAP) s.delete(s.values().next().value as string);
    return true;
  }
}

export const socket = new SocketClient();
