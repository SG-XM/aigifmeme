import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface PreflightFiles {
  dockerfile: string;
  wrangler: string;
  pin: string;
}

const IMAGE_RE =
  /^registry\.cloudflare\.com\/29a44cf6b1d2c5d00f51960def5bb48d\/chatgpt2api@sha256:[a-f0-9]{64}$/;

export function evaluate(files: PreflightFiles): string[] {
  const errors: string[] = [];
  const pin = JSON.parse(files.pin) as {
    upstream: { linux_amd64_digest: string; git: string; tag: string };
    cloudflare_image: string;
  };
  const digest = pin.upstream.linux_amd64_digest;
  if (!files.dockerfile.includes(digest)) {
    errors.push("Dockerfile does not pin the upstream linux/amd64 digest");
  }
  if (!files.dockerfile.includes(pin.upstream.git)) {
    errors.push("Dockerfile does not record the upstream git revision");
  }
  if (pin.upstream.tag !== "v1.7.0") {
    errors.push("image pin is not upstream tag v1.7.0");
  }
  if (!files.wrangler.includes(pin.cloudflare_image)) {
    errors.push("wrangler.jsonc image does not match image-pin.json");
  }
  if (!files.wrangler.includes('"name": "chatgpt2api"')) {
    errors.push("worker name must stay chatgpt2api");
  }
  if (files.wrangler.includes("aigifmeme.com/*") || files.wrangler.includes('"pattern": "aigifmeme.com"')) {
    errors.push("this worker must not take the site hostname");
  }
  if (!files.wrangler.includes("api.aigifmeme.com")) {
    errors.push("custom domain api.aigifmeme.com is missing");
  }
  if (pin.cloudflare_image.includes("REPLACE_AFTER_REGISTRY_PUSH") || !IMAGE_RE.test(pin.cloudflare_image)) {
    errors.push(
      "Cloudflare image digest is not pinned yet. Build and push from a Docker host, then replace REPLACE_AFTER_REGISTRY_PUSH.",
    );
  }
  return errors;
}

function readProject(): PreflightFiles {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  return {
    dockerfile: readFileSync(join(root, "Dockerfile"), "utf8"),
    wrangler: readFileSync(join(root, "wrangler.jsonc"), "utf8"),
    pin: readFileSync(join(root, "image-pin.json"), "utf8"),
  };
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  const errors = evaluate(readProject());
  if (errors.length > 0) {
    for (const error of errors) console.error(error);
    process.exit(1);
  }
  console.log("preflight ok");
}
