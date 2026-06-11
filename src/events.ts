import { WorkerEntrypoint, type WorkflowStepContext } from "cloudflare:workers";
import type { Constructor, MaybePromise, Payload, Values } from "./utils";

export type GaitEventOptions = {
  type: string;
  timeout?: WorkflowSleepDuration | number;
};

type Defs = Record<"step:start" | "sleep:complete", void> &
  Record<"step:error" | "sleep:error" | "event:error", { error: unknown }> &
  Record<"step:complete" | "event:complete", { output: unknown }> & {
    "sleep:start": {
      params:
        | number
        | Date
        | { duration: WorkflowSleepDuration }
        | { timestamp: Date | number };
    };
    "event:start": { options: GaitEventOptions };
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
