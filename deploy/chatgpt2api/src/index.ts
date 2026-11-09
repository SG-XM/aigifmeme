import { Container, ContainerProxy } from "@cloudflare/containers";

import { buildContainerEnv, instanceType, pinContainerStart } from "./container-env";
import { handleRequest, serviceConfigured, type GateEnv } from "./gate";
import { BRIDGE_HOST, handleStateBridge } from "./state-bridge";

export { ContainerProxy };

export interface Env extends GateEnv {
  CHATGPT2API: DurableObjectNamespace<Chatgpt2ApiContainer>;
  STATE_BUCKET: R2Bucket;
}

const pinnedStarts = new WeakSet<object>();

export class Chatgpt2ApiContainer extends Container<Env> {
  defaultPort = 80;
  sleepAfter = "5m";
  enableInternet = true;

  constructor(ctx: ConstructorParameters<typeof Container>[0], env: Env) {
    super(ctx, env);
    this.envVars = buildContainerEnv(env);
    const runtime = this.ctx.container;
    if (runtime && !pinnedStarts.has(runtime)) {
      const instance = instanceType(env.CONTAINER_INSTANCE);
      runtime.start = pinContainerStart(
        runtime.start.bind(runtime),
        () => runtime.images.base,
        () => instance,
      ) as typeof runtime.start;
      pinnedStarts.add(runtime);
    }
  }

  override async fetch(request: Request): Promise<Response> {
    if (!serviceConfigured(this.env)) {
      return Response.json(
        { ok: false, error: "service_not_configured", probe: "worker", model_e2e: false },
        { status: 503, headers: { "cache-control": "no-store" } },
      );
    }
    await this.startAndWaitForPorts({
      ports: 80,
      cancellationOptions: {
        instanceGetTimeoutMS: 180_000,
        portReadyTimeoutMS: 180_000,
      },
    });
    return this.containerFetch(request, 80);
  }

  override onError(error: unknown): void {
    const message = error instanceof Error ? error.name : "container_error";
    console.error("container error", message);
  }
}

Chatgpt2ApiContainer.outboundByHost = {
  [BRIDGE_HOST]: (request: Request, env: Env) => handleStateBridge(request, env.STATE_BUCKET, env.STATE_BRIDGE_SECRET),
};

const wakeHolder = {
  fetch(env: Env, request: Request): Promise<Response> {
    return env.CHATGPT2API.getByName("singleton").fetch(request);
  },
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env, {
      fetch: (proxied) => wakeHolder.fetch(env, proxied),
    });
  },
};
