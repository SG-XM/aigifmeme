import type { GateEnv } from "./gate";

// workers-types 5.20261109.1 includes "basic" on ContainerStartupOptions.instance.
// The scheduling-policy page still says ctx.container.start() does not accept
// "basic". The limits table defines basic as 1 GiB, which is the smallest
// practical size above lite. Custom sizes cannot be 1 GiB: they require at
// least 1 vCPU and 3 GiB of memory per vCPU. Default is basic. If a runtime
// rejects it, set CONTAINER_INSTANCE to lite or standard-1.
export const INSTANCE_TYPES = ["lite", "basic", "standard-1", "standard-2", "standard-3", "standard-4"] as const;
export type InstanceType = (typeof INSTANCE_TYPES)[number];

const ALLOWED = new Set<string>(INSTANCE_TYPES);

export function instanceType(value: string | undefined): InstanceType {
  const name = value?.trim() || "basic";
  if (!ALLOWED.has(name)) {
    throw new Error("unsupported container instance");
  }
  return name as InstanceType;
}

export function buildContainerEnv(env: GateEnv): Record<string, string> {
  return {
    STATE_BRIDGE_SECRET: env.STATE_BRIDGE_SECRET ?? "",
    STATE_BRIDGE_URL: "http://state-bridge.internal",
    CHATGPT2API_AUTH_KEY: env.UPSTREAM_AUTH_KEY ?? "",
    CHATGPT2API_BASE_URL: env.PUBLIC_ORIGIN?.trim() || "https://api.aigifmeme.com",
    STORAGE_BACKEND: "json",
    STATE_SYNC_INTERVAL_SECONDS: "15",
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
    const selected = instance();
    if (!ALLOWED.has(selected)) throw new Error("unsupported container instance");
    return start({
      ...options,
      image: imageRef,
      instance: selected,
      enableInternet: true,
    });
  };
}
