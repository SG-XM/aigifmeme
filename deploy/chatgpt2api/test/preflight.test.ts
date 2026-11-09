import assert from "node:assert/strict";
import { test } from "node:test";

import { evaluate } from "../ops/preflight.ts";

const digest = "sha256:fb6bf418e8f281552a756f65df5d10cae1fe29bc9044a5e9326a32923bd225a9";
const git = "1f96b49b2bf35e607a2c587e3fb9d40c5acb475d";

function files(image: string) {
  return {
    dockerfile: `git ${git}\nFROM ghcr.io/basketikun/chatgpt2api@${digest}\n`,
    wrangler:
      '{\n  "name": "chatgpt2api",\n  "routes": [{ "pattern": "api.aigifmeme.com", "custom_domain": true }],\n  "image": "' +
      image +
      '"\n}\n',
    pin: JSON.stringify({
      upstream: { linux_amd64_digest: digest, git, tag: "v1.7.0" },
      cloudflare_image: image,
    }),
  };
}

test("preflight blocks the placeholder digest", () => {
  const errors = evaluate(
    files("registry.cloudflare.com/29a44cf6b1d2c5d00f51960def5bb48d/chatgpt2api@sha256:REPLACE_AFTER_REGISTRY_PUSH"),
  );
  assert.ok(errors.some((error) => error.includes("not pinned")));
});

test("preflight accepts a digest-pinned Cloudflare image", () => {
  const image =
    "registry.cloudflare.com/29a44cf6b1d2c5d00f51960def5bb48d/chatgpt2api@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  assert.deepEqual(evaluate(files(image)), []);
});
