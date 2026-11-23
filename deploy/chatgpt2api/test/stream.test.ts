import assert from "node:assert/strict";
import { test } from "node:test";

import { handleRequest, type GateEnv } from "../src/gate.ts";

const env: GateEnv = {
  GATE_TOKEN: "gate-secret-value-0123456789abcdef",
  UPSTREAM_AUTH_KEY: "upstream-secret-value-0123456789abcd",
  STATE_BRIDGE_SECRET: "bridge-secret-value-0123456789abcdef",
};

test("SSE bytes are returned before the upstream stream finishes", async () => {
  const release = Promise.withResolvers<void>();
  let finished = false;
  const stream = new ReadableStream({
    async pull(controller) {
      controller.enqueue(new TextEncoder().encode("data: hi\n\n"));
      await release.promise;
      finished = true;
      controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  const response = await handleRequest(
    new Request("https://api.aigifmeme.com/v1/chat/completions", {
      method: "POST",
      headers: { authorization: "Bearer gate-secret-value-0123456789abcdef" },
      body: JSON.stringify({ stream: true }),
    }),
    env,
    {
      fetch() {
        return Promise.resolve(
          new Response(stream, {
            headers: { "content-type": "text/event-stream" },
          }),
        );
      },
    },
  );
  assert.equal(response.headers.get("content-type"), "text/event-stream");
  const reader = response.body?.getReader();
  assert.ok(reader);
  const first = await reader.read();
  assert.equal(finished, false);
  assert.match(new TextDecoder().decode(first.value), /data: hi/);
  release.resolve();
  const rest = await reader.read();
  assert.match(new TextDecoder().decode(rest.value), /DONE/);
});
