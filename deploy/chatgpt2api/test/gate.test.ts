import assert from "node:assert/strict";
import { test } from "node:test";

import { instanceType, pinContainerStart } from "../src/container-env.ts";
import {
  buildProxiedRequest,
  handleRequest,
  healthBody,
  isAuthorized,
  isPublicHealth,
  type ContainerWake,
  type GateEnv,
} from "../src/gate.ts";

const SECRET = "gate-secret-value-0123456789abcdef";
const UPSTREAM = "upstream-secret-value-0123456789abcd";

function env(overrides: Partial<GateEnv> = {}): GateEnv {
  return {
    GATE_TOKEN: SECRET,
    UPSTREAM_AUTH_KEY: UPSTREAM,
    R2_ACCESS_KEY_ID: "r2-access-key-id",
    R2_SECRET_ACCESS_KEY: "r2-secret-access-key",
    R2_ACCOUNT_ID: "29a44cf6b1d2c5d00f51960def5bb48d",
    R2_BUCKET_NAME: "chatgpt2api-state",
    R2_PREFIX: "state",
    PUBLIC_ORIGIN: "https://api.aigifmeme.com",
    CONTAINER_INSTANCE: "standard-1",
    ...overrides,
  };
}

function recorder(): { wake: ContainerWake; calls: Request[] } {
  const calls: Request[] = [];
  return {
    calls,
    wake: {
      async fetch(request: Request) {
        calls.push(request);
        return new Response("proxied", { status: 200 });
      },
    },
  };
}

test("public health stays on the worker and does not wake the container", async () => {
  const { wake, calls } = recorder();
  for (const url of [
    "https://api.aigifmeme.com/health",
    "https://chatgpt2api.example.workers.dev/healthz",
  ]) {
    const response = await handleRequest(new Request(url), env(), wake);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), healthBody());
  }
  assert.equal(calls.length, 0);
});

test("missing credentials fail closed before the container wakes", async () => {
  const { wake, calls } = recorder();
  const hosts = ["https://api.aigifmeme.com/v1/chat/completions", "https://chatgpt2api.example.workers.dev/admin"];
  for (const url of hosts) {
    const response = await handleRequest(new Request(url, { method: "POST" }), env({ GATE_TOKEN: "" }), wake);
    assert.equal(response.status, 401);
  }
  const query = new Request(`https://api.aigifmeme.com/v1/models?token=${SECRET}`);
  const queryResponse = await handleRequest(query, env(), wake);
  assert.equal(queryResponse.status, 401);
  assert.equal(isAuthorized(query, SECRET), false);
  assert.equal(calls.length, 0);
});

test("a browser without a cookie gets the form and still does not wake the container", async () => {
  const { wake, calls } = recorder();
  const response = await handleRequest(
    new Request("https://api.aigifmeme.com/?auth-key=should-not-stick", {
      headers: { accept: "text/html" },
    }),
    env(),
    wake,
  );
  assert.equal(response.status, 401);
  const html = await response.text();
  assert.match(html, /method="post"/);
  assert.doesNotMatch(html, /should-not-stick/);
  assert.doesNotMatch(html, /gate-secret-value/);
  assert.equal(calls.length, 0);
});

test("login sets an HttpOnly cookie and does not put the secret in the URL", async () => {
  const { wake, calls } = recorder();
  const body = new URLSearchParams({ token: SECRET });
  const response = await handleRequest(
    new Request("https://api.aigifmeme.com/_gate/login", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    }),
    env(),
    wake,
  );
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/");
  const cookie = response.headers.get("set-cookie") ?? "";
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.doesNotMatch(response.headers.get("location") ?? "", /gate-secret/);
  assert.equal(calls.length, 0);

  const next = await handleRequest(
    new Request("https://api.aigifmeme.com/accounts", { headers: { cookie, accept: "text/html" } }),
    env(),
    wake,
  );
  assert.equal(next.status, 200);
  assert.equal(calls.length, 1);
});

test("authorized proxy strips query secrets and injects the upstream key", async () => {
  const { wake, calls } = recorder();
  const response = await handleRequest(
    new Request("https://chatgpt2api.example.workers.dev/v1/chat/completions?api_key=leak", {
      method: "POST",
      headers: {
        authorization: `Bearer ${SECRET}`,
        cookie: "c2a_gate=nope",
        "content-type": "application/json",
      },
      body: JSON.stringify({ model: "probe", stream: true }),
    }),
    env(),
    wake,
  );
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  const forwarded = calls[0];
  assert.equal(forwarded.headers.get("authorization"), `Bearer ${UPSTREAM}`);
  assert.equal(forwarded.headers.get("cookie"), null);
  assert.equal(new URL(forwarded.url).search, "");
  assert.equal(isPublicHealth(forwarded), false);
});

test("a short gate token is treated as not configured", async () => {
  const { wake, calls } = recorder();
  const response = await handleRequest(
    new Request("https://api.aigifmeme.com/v1/models", {
      headers: { authorization: "Bearer short-token" },
    }),
    env({ GATE_TOKEN: "short-token", UPSTREAM_AUTH_KEY: "short-token" }),
    wake,
  );
  assert.equal(response.status, 503);
  assert.equal(calls.length, 0);
});

test("incomplete persistence config does not wake the container", async () => {
  const { wake, calls } = recorder();
  const response = await handleRequest(
    new Request("https://api.aigifmeme.com/v1/models", {
      headers: { authorization: `Bearer ${SECRET}` },
    }),
    env({ R2_SECRET_ACCESS_KEY: "" }),
    wake,
  );
  assert.equal(response.status, 503);
  assert.equal(calls.length, 0);
});

test("instance pin rejects the placeholder image and forces the singleton size", () => {
  assert.equal(instanceType(undefined), "standard-1");
  assert.throws(() => instanceType("basic"), /unsupported/);
  const seen: Record<string, unknown>[] = [];
  const wrapped = pinContainerStart(
    (options) => {
      seen.push(options ?? {});
    },
    () => "registry.cloudflare.com/29a44cf6b1d2c5d00f51960def5bb48d/chatgpt2api@sha256:abc",
    () => "standard-1",
  );
  wrapped({ env: { STORAGE_BACKEND: "json" }, enableInternet: false });
  assert.equal(seen[0].image, "registry.cloudflare.com/29a44cf6b1d2c5d00f51960def5bb48d/chatgpt2api@sha256:abc");
  assert.equal(seen[0].instance, "standard-1");
  assert.equal(seen[0].enableInternet, true);
  assert.deepEqual(seen[0].env, { STORAGE_BACKEND: "json" });
  assert.throws(
    () =>
      pinContainerStart(
        () => undefined,
        () => "registry.cloudflare.com/acct/chatgpt2api@sha256:REPLACE_AFTER_REGISTRY_PUSH",
        () => "standard-1",
      )(),
    /not pinned/,
  );
});

test("buildProxiedRequest keeps a streaming body", async () => {
  let released = false;
  const release = Promise.withResolvers<void>();
  const stream = new ReadableStream({
    async pull(controller) {
      controller.enqueue(new TextEncoder().encode("data: one\n\n"));
      await release.promise;
      released = true;
      controller.enqueue(new TextEncoder().encode("data: two\n\n"));
      controller.close();
    },
  });
  const request = new Request("https://api.aigifmeme.com/v1/chat/completions", {
    method: "POST",
    body: stream,
    duplex: "half",
  });
  const proxied = buildProxiedRequest(request, UPSTREAM);
  const reader = proxied.body?.getReader();
  assert.ok(reader);
  const first = await reader.read();
  assert.equal(released, false);
  assert.match(new TextDecoder().decode(first.value), /data: one/);
  release.resolve();
  const second = await reader.read();
  assert.match(new TextDecoder().decode(second.value), /data: two/);
});
