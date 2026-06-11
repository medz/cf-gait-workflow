import { WorkerEntrypoint, type WorkflowStepContext } from "cloudflare:workers";
import type { Constructor, MaybePromise, Payload, Values } from "./utils";

type Defs = {
  "step:start": {};
  "step:error": { error: unknown };
  "step:complete": {};
  "sleep:start": {
    params:
      | number
      | Date
      | { duration: WorkflowSleepDuration }
      | { timestamp: Date | number };
  };
  "sleep:error": { error: unknown };
  "sleep:complete": {};
};

type Ctx<T> = WorkflowStepContext & Payload<T> & { timestamp: number };
export type Args = Values<{
  [K in keyof Defs]: [e: K, ctx: Ctx<Defs[K]>];
}>;

export abstract class GaitEmitterWorkerEntrypoint<
  Env = Cloudflare.Env,
  Props = {},
> extends WorkerEntrypoint<Env, Props> {
  abstract emit(...args: Args): void;
}

export function defineGaitEmitter<Env = Cloudflare.Env, Props = {}>(
  fn: (...args: Args) => MaybePromise<void>,
): Constructor<typeof GaitEmitterWorkerEntrypoint<Env, Props>> {
  return class extends GaitEmitterWorkerEntrypoint<Env, Props> {
    emit(...[e, ctx]: Args): void {
      return this.ctx.waitUntil(Promise.try(() => fn(...([e, ctx] as Args))));
    }
  };
}
