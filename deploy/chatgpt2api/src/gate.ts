export const COOKIE_NAME = "c2a_gate";

const QUERY_SECRET_NAMES = new Set([
  "key",
  "token",
  "auth",
  "auth-key",
  "auth_key",
  "api_key",
  "apikey",
  "access_token",
  "secret",
  "authorization",
  "gate",
]);

export interface GateEnv {
  GATE_TOKEN?: string;
  UPSTREAM_AUTH_KEY?: string;
  STATE_BRIDGE_SECRET?: string;
  PUBLIC_ORIGIN?: string;
  CONTAINER_INSTANCE?: string;
  STATE_BUCKET?: R2Bucket;
}

export interface ContainerWake {
  fetch(request: Request): Promise<Response>;
}

export function safeEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < length; i += 1) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

export function isPublicHealth(request: Request): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  const path = new URL(request.url).pathname;
  return path === "/health" || path === "/healthz";
}

export function healthBody(): Record<string, unknown> {
  return {
    ok: true,
    service: "chatgpt2api",
    probe: "worker",
    model_e2e: false,
    accounts: "not_checked",
    persistence: "r2_snapshot",
    snapshot_interval_seconds: 15,
  };
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex",
    },
  });
}

function readBearer(header: string | null): string {
  if (!header) return "";
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] ?? "";
}

function readCookie(header: string | null, name: string): string {
  if (!header) return "";
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (key !== name) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      return "";
    }
  }
  return "";
}

export function presentedSecret(request: Request): string {
  const bearer = readBearer(request.headers.get("authorization"));
  if (bearer) return bearer;
  return readCookie(request.headers.get("cookie"), COOKIE_NAME);
}

export function isAuthorized(request: Request, gateToken: string): boolean {
  if (!gateToken) return false;
  const presented = presentedSecret(request);
  if (!presented) return false;
  return safeEqual(presented, gateToken);
}

export function secretStrong(value: string | undefined): boolean {
  return Boolean(value && value.trim().length >= 32);
}

export function isPrivateBridgeRequest(request: Request): boolean {
  const url = new URL(request.url);
  return (
    url.hostname === "state-bridge.internal" ||
    url.pathname === "/_state" ||
    url.pathname.startsWith("/_state/")
  );
}

export function serviceConfigured(env: GateEnv): boolean {
  return Boolean(
    secretStrong(env.GATE_TOKEN) &&
      secretStrong(env.UPSTREAM_AUTH_KEY) &&
      secretStrong(env.STATE_BRIDGE_SECRET),
  );
}

function wantsHtml(request: Request): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  const accept = request.headers.get("accept") ?? "";
  const dest = request.headers.get("sec-fetch-dest") ?? "";
  return accept.includes("text/html") || dest === "document";
}

function loginPage(status: number): Response {
  const html = `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>登录</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0; background: #111; color: #eee; }
  main { max-width: 28rem; margin: 12vh auto; padding: 1.5rem; }
  input, button { font: inherit; width: 100%; box-sizing: border-box; margin-top: .5rem; padding: .6rem; }
  p { line-height: 1.5; }
</style>
</head>
<body>
<main>
  <h1>管理入口</h1>
  <p>口令只放在下面的表单里提交。不要把口令写进地址栏或查询参数。</p>
  <form method="post" action="/_gate/login" autocomplete="off">
    <label for="token">管理员口令</label>
    <input id="token" name="token" type="password" autocomplete="current-password" required>
    <button type="submit">进入</button>
  </form>
  <p>进入后，应用自己的登录页还会再要一次口令。把同一把管理员口令填进那个表单，仍然不要放到地址栏。</p>
</main>
</body>
</html>`;
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'",
      "x-robots-tag": "noindex",
    },
  });
}

function cookieHeader(token: string, secure: boolean): string {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=43200",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

async function handleLogin(request: Request, env: GateEnv): Promise<Response> {
  if (!env.GATE_TOKEN) return json({ ok: false, error: "unauthorized", probe: "worker" }, 401);
  let token = "";
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data")) {
    const form = await request.formData();
    token = String(form.get("token") ?? "");
  } else if (type.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
    token = typeof body?.token === "string" ? body.token : "";
  }
  if (!token || !safeEqual(token, env.GATE_TOKEN)) {
    return loginPage(401);
  }
  const secure = new URL(request.url).protocol === "https:";
  return new Response(null, {
    status: 303,
    headers: {
      location: "/",
      "set-cookie": cookieHeader(env.GATE_TOKEN, secure),
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
    },
  });
}

export function stripSecretQuery(url: URL): URL {
  const clean = new URL(url.toString());
  const doomed: string[] = [];
  for (const key of clean.searchParams.keys()) {
    if (QUERY_SECRET_NAMES.has(key.toLowerCase())) doomed.push(key);
  }
  for (const key of doomed) clean.searchParams.delete(key);
  return clean;
}

export function buildProxiedRequest(request: Request, upstreamAuthKey: string): Request {
  const url = stripSecretQuery(new URL(request.url));
  const headers = new Headers(request.headers);
  headers.delete("cookie");
  headers.delete("authorization");
  headers.delete("proxy-authorization");
  headers.delete("x-api-key");
  headers.set("authorization", `Bearer ${upstreamAuthKey}`);
  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
    redirect: "manual",
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    init.duplex = "half";
  }
  return new Request(url, init);
}

export async function handleRequest(
  request: Request,
  env: GateEnv,
  wake: ContainerWake,
): Promise<Response> {
  if (isPrivateBridgeRequest(request)) {
    return json({ ok: false, error: "not_found", probe: "worker" }, 404);
  }

  if (isPublicHealth(request)) {
    if (request.method === "HEAD") return new Response(null, { status: 200, headers: json(healthBody(), 200).headers });
    return json(healthBody(), 200);
  }

  const url = new URL(request.url);
  if (url.pathname === "/_gate" && request.method === "GET") return loginPage(200);
  if (url.pathname === "/_gate/login" && request.method === "POST") return handleLogin(request, env);

  if (!env.GATE_TOKEN || !isAuthorized(request, env.GATE_TOKEN)) {
    if (wantsHtml(request)) return loginPage(401);
    return json({ ok: false, error: "unauthorized", probe: "worker" }, 401);
  }

  if (!serviceConfigured(env)) {
    return json(
      { ok: false, error: "service_not_configured", probe: "worker", model_e2e: false },
      503,
    );
  }

  return wake.fetch(buildProxiedRequest(request, env.UPSTREAM_AUTH_KEY ?? ""));
}
