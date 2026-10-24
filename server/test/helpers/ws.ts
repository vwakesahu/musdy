import { ServerMsg } from "shared";

export class TestSocket {
  readonly messages: ServerMsg[] = [];
  private waiters: { pred: (m: ServerMsg) => boolean; resolve: (m: ServerMsg) => void }[] = [];
  private constructor(private ws: WebSocket) {
    ws.onmessage = (e) => {
      const msg = ServerMsg.parse(JSON.parse(String(e.data)));
      this.messages.push(msg);
      this.waiters = this.waiters.filter((w) => (w.pred(msg) ? (w.resolve(msg), false) : true));
    };
  }

  static open(url: string): Promise<TestSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      const s = new TestSocket(ws);
      ws.onopen = () => resolve(s);
      ws.onerror = () => reject(new Error(`could not connect to ${url}`));
    });
  }

  send(msg: unknown) {
    this.ws.send(typeof msg === "string" ? msg : JSON.stringify(msg));
  }

  // first message, already received or future, matching pred
  next(pred: (m: ServerMsg) => boolean, timeoutMs = 10000): Promise<ServerMsg> {
    const hit = this.messages.find(pred);
    if (hit) return Promise.resolve(hit);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timed out waiting for socket message")), timeoutMs);
      this.waiters.push({ pred, resolve: (m) => (clearTimeout(timer), resolve(m)) });
    });
  }

  clear() {
    this.messages.length = 0;
  }

  close() {
    this.ws.close();
  }
}
