import { z } from "zod";
import { routes, zAddress, zUint } from "shared";
import { HttpError } from "./errors";
import { errMessage, log } from "./log";

export type RouteName = keyof typeof routes;
export const POSTS = new Set<RouteName>(["trade", "withdraw", "launch", "deposit", "faucet", "profile", "follow"]);

export interface Ctx {
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
}
export type Handlers = Record<RouteName, (ctx: Ctx) => Promise<unknown> | unknown>;

const compiled = (Object.entries(routes) as [RouteName, string][]).map(([name, path]) => {
  const keys: string[] = [];
  const re = new RegExp("^" + path.replace(/:(\w+)/g, (_m, k: string) => (keys.push(k), "([^/]+)")) + "/?$");
  return { name, re, keys, method: POSTS.has(name) ? "POST" : "GET" };
});

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

const replacer = (_k: string, v: unknown) => (typeof v === "bigint" ? v.toString() : v);
export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, replacer), { status, headers: { "content-type": "application/json", ...CORS } });
const fail = (status: number, code: string, message: string) => json({ code, message }, status);

export const handleHttp = async (req: Request, handlers: Handlers): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const url = new URL(req.url);
  const route = compiled.find((r) => r.re.test(url.pathname));
  if (!route) return fail(404, "not_found", `no route ${url.pathname}`);
  if (req.method !== route.method) return fail(405, "method_not_allowed", `${route.name} takes ${route.method}`);
  const m = route.re.exec(url.pathname)!;
  const params = Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(m[i + 1]!)]));
  let body: unknown = null;
  if (route.method === "POST") {
    try {
      body = await req.json();
    } catch {
      return fail(400, "bad_json", "body is not json");
    }
  }
  try {
    return json(await handlers[route.name]({ params, query: url.searchParams, body }));
  } catch (e) {
    if (e instanceof HttpError) {
      log("http.rejected", { route: route.name, status: e.status, code: e.code });
      return fail(e.status, e.code, e.message);
    }
    log("http.error", { route: route.name, error: errMessage(e) });
    return fail(500, "internal", errMessage(e));
  }
};

// query and path params, validated where they enter
export const param = <S extends z.ZodTypeAny>(schema: S, value: string | null | undefined, name: string): z.infer<S> => {
  const r = schema.safeParse(value ?? undefined);
  if (!r.success) throw new HttpError(400, "bad_param", `${name}: ${r.error.issues[0]?.message ?? "invalid"}`);
  return r.data;
};

export const qAddress = zAddress;
export const qUint = zUint;
export const qBool = z.enum(["true", "false"]).transform((v) => v === "true");
export const qOptional = z.string().min(1).optional();
