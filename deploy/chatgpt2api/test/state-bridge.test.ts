import assert from "node:assert/strict";
import { test } from "node:test";

import { handleStateBridge, type StateBucket } from "../src/state-bridge.ts";

const SECRET = "bridge-secret-value-0123456789abcdef";

class FakeBucket implements StateBucket {
  objects = new Map<string, Uint8Array>();
  calls: string[] = [];

  async get(key: string) {
    this.calls.push(`get ${key}`);
    const body = this.objects.get(key);
    if (!body) return null;
    return { arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) };
  }

  async put(key: string, value: ArrayBuffer | Uint8Array | string) {
    this.calls.push(`put ${key}`);
    const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value instanceof Uint8Array ? value : new Uint8Array(value);
    this.objects.set(key, bytes);
  }

  async delete(key: string) {
    this.calls.push(`delete ${key}`);
    this.objects.delete(key);
  }
}

function request(method: string, path: string, secret?: string, body?: string): Request {
  const headers = new Headers();
  if (secret) headers.set("authorization", `Bearer ${secret}`);
  return new Request(`http://state-bridge.internal${path}`, { method, headers, body });
}

test("bridge auth failure does not touch the bucket", async () => {
  const bucket = new FakeBucket();
  const response = await handleStateBridge(request("GET", "/v1/manifest", "wrong-secret-value-0123456789abcd"), bucket, SECRET);
  assert.equal(response.status, 401);
  assert.deepEqual(bucket.calls, []);
  const missing = await handleStateBridge(request("PUT", "/v1/object?key=state/config.json"), bucket, SECRET);
  assert.equal(missing.status, 401);
  assert.deepEqual(bucket.calls, []);
});

test("bridge round trip stays inside the state prefix", async () => {
  const bucket = new FakeBucket();
  const payload = JSON.stringify({ marker: 1 });
  const put = await handleStateBridge(
    request("PUT", "/v1/object?key=state/config.json", SECRET, payload),
    bucket,
    SECRET,
  );
  assert.equal(put.status, 200);
  const got = await handleStateBridge(request("GET", "/v1/object?key=state/config.json", SECRET), bucket, SECRET);
  assert.equal(await got.text(), payload);
  const escape = await handleStateBridge(
    request("PUT", "/v1/object?key=../other-bucket/config.json", SECRET, payload),
    bucket,
    SECRET,
  );
  assert.equal(escape.status, 400);
  assert.equal(bucket.objects.has("../other-bucket/config.json"), false);
});
