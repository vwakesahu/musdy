import { ClientMsg, type ServerMsg } from "shared";

const PORT = Number(process.env.PORT ?? 8080);
const send = (ws: { send: (s: string) => void }, m: ServerMsg) => ws.send(JSON.stringify(m));

Bun.serve({
  port: PORT,
  fetch(req, server) {
    if (server.upgrade(req)) return;
    return new Response("ok");
  },
  websocket: {
    open(ws) { send(ws, { type: "welcome", serverTime: Date.now() }); },
    message(ws, raw) {
      const parsed = ClientMsg.safeParse(JSON.parse(String(raw)));
      if (!parsed.success) return send(ws, { type: "error", code: "bad_msg", message: parsed.error.message });
      if (parsed.data.type === "subscribe") ws.subscribe(parsed.data.topic);
    },
  },
});
console.log(`socket server on :${PORT}`);
