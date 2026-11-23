import assert from "node:assert/strict";
import { test } from "node:test";

import { evaluate } from "../ops/preflight.ts";

const digest = "sha256:dfa33c149fded5bf65cbbe301f72d1a7bac414691a5df00a7b24a5acad6a5dc0";
const git = "aad8b4c4ac51cc73d210580298e018c471602581";

function files(image: string) {
  return {
    dockerfile: `git ${git}\nFROM ghcr.io/basketikun/chatgpt2api@${digest}\n`,
    wrangler:
      '{\n  "name": "chatgpt2api",\n  "vars": { "CONTAINER_INSTANCE": "basic" },\n  "secrets": { "required": ["STATE_BRIDGE_SECRET"] },\n  "routes": [{ "pattern": "api.aigifmeme.com", "custom_domain": true }],\n  "image": "' +
      image +
      '"\n}\n',
    pin: JSON.stringify({
      upstream: { linux_amd64_digest: digest, git, tag: "v2.0.0" },
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
