import type { GateEnv } from "./gate";

export const INSTANCE_TYPES = ["lite", "standard-1", "standard-2", "standard-3", "standard-4"] as const;
export type InstanceType = (typeof INSTANCE_TYPES)[number];

const ALLOWED = new Set<string>(INSTANCE_TYPES);

export function instanceType(value: string | undefined): InstanceType {
  const name = value?.trim() || "standard-1";
  if (!ALLOWED.has(name)) {
    throw new Error("unsupported container instance");
  }
  return name as InstanceType;
}

export function buildContainerEnv(env: GateEnv): Record<string, string> {
  return {
    R2_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID ?? "",
    R2_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY ?? "",
    R2_ACCOUNT_ID: env.R2_ACCOUNT_ID ?? "",
    R2_BUCKET_NAME: env.R2_BUCKET_NAME ?? "",
    R2_PREFIX: env.R2_PREFIX?.trim() || "state",
    CHATGPT2API_AUTH_KEY: env.UPSTREAM_AUTH_KEY ?? "",
    CHATGPT2API_BASE_URL: env.PUBLIC_ORIGIN?.trim() || "https://api.aigifmeme.com",
    STORAGE_BACKEND: "json",
  };
}

export function pinContainerStart(
  start: (options?: Record<string, unknown>) => unknown,
  image: () => string,
  instance: () => string,
): (options?: Record<string, unknown>) => unknown {
  return (options = {}) => {
    const imageRef = image();
    if (!imageRef || imageRef.includes("REPLACE_AFTER_REGISTRY_PUSH")) {
      throw new Error("container image is not pinned");
    }
    return start({
      ...options,
      image: imageRef,
      instance: instance(),
      enableInternet: true,
    });
  };
}
