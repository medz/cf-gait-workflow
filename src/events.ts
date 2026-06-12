import {
  WorkerEntrypoint,
  type WorkflowStepContext,
  type WorkflowStepEvent,
} from "cloudflare:workers";
import type { Constructor, MaybePromise, Values } from "./utils";

export type GaitEventOptions = {
  type: string;
  timeout?: WorkflowSleepDuration | number;
};

type BaseCtx = Pick<WorkflowStepContext, "step"> & { timestamp: number };
type StepCtx<T extends {} = {}> = BaseCtx &
  Omit<WorkflowStepContext, "step"> &
  NonNullable<T>;

export type Defs = {
  "step:start": StepCtx;
  "step:error": StepCtx<{ error: unknown }>;
  "step:complete": StepCtx<{ output: unknown }>;
  "event:start": BaseCtx & { options: GaitEventOptions };
  "event:error": BaseCtx & { error: unknown };
  "event:complete": BaseCtx & { output: WorkflowStepEvent<unknown> };
  "sleep:start": BaseCtx & {
    params:
      | number
      | Date
      | { duration: WorkflowSleepDuration }
      | { timestamp: Date | number };
  };
  "sleep:error": BaseCtx & { error: unknown };
  "sleep:complete": BaseCtx;
};

export type Args = Values<{
  [K in keyof Defs]: [e: K, ctx: Defs[K]];
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
