import { safeEqual, secretStrong } from "./gate.ts";

export const BRIDGE_HOST = "state-bridge.internal";
export const STATE_PREFIX = "state";
const MANIFEST_KEY = `${STATE_PREFIX}/_manifest.json`;

export interface StateBucket {
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
  put(key: string, value: ArrayBuffer | Uint8Array | string): Promise<unknown>;
  delete(key: string): Promise<unknown>;
}

export function safeStateKey(raw: string | null): string | null {
  if (!raw) return null;
  const key = raw.trim();
  if (!key.startsWith(`${STATE_PREFIX}/`)) return null;
  if (key.includes("\\") || key.includes("..") || key.includes("//")) return null;
  if (key.slice(`${STATE_PREFIX}/`.length).length === 0) return null;
  return key;
}

function unauthorized(): Response {
  return Response.json({ ok: false, error: "unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } });
}

function authorized(request: Request, secret: string | undefined): boolean {
  if (!secretStrong(secret)) return false;
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!match?.[1]) return false;
  return safeEqual(match[1], secret ?? "");
}

export async function handleStateBridge(
  request: Request,
  bucket: StateBucket,
  secret: string | undefined,
): Promise<Response> {
  if (!authorized(request, secret)) return unauthorized();
  const url = new URL(request.url);
  if (url.pathname === "/v1/manifest") {
    if (request.method === "GET") {
      const object = await bucket.get(MANIFEST_KEY);
      if (!object) return Response.json({ missing: true }, { status: 404 });
      return new Response(await object.arrayBuffer(), {
        status: 200,
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      });
    }
    if (request.method === "PUT") {
      const body = await request.arrayBuffer();
      await bucket.put(MANIFEST_KEY, body);
      return Response.json({ ok: true });
    }
  }
  if (url.pathname === "/v1/object") {
    const key = safeStateKey(url.searchParams.get("key"));
    if (!key) return Response.json({ ok: false, error: "bad_key" }, { status: 400 });
    if (request.method === "GET") {
      const object = await bucket.get(key);
      if (!object) return Response.json({ missing: true }, { status: 404 });
      return new Response(await object.arrayBuffer(), { status: 200, headers: { "cache-control": "no-store" } });
    }
    if (request.method === "PUT") {
      await bucket.put(key, await request.arrayBuffer());
      return Response.json({ ok: true });
    }
    if (request.method === "DELETE") {
      await bucket.delete(key);
      return Response.json({ ok: true });
    }
  }
  return Response.json({ ok: false, error: "not_found" }, { status: 404 });
}
