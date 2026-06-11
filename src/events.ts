import { WorkerEntrypoint, type WorkflowStepContext } from "cloudflare:workers";
import type {
  Constructor,
  MaybePromise,
  Payload,
  Values,
} from "./utils";

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

type Ctx<T> = WorkflowStepContext & Payload<T> & { timestamp: Date };
type OnArgs = Values<{
  [K in keyof Defs]: [e: K, ctx: Ctx<Defs[K]>];
}>;
type EmitArgs = Values<{
  [K in keyof Defs]: [e: K, ctx: Omit<Ctx<Defs[K]>, "timestamp">];
}>;

export abstract class GaitEmittrtWorkerEntrypoint<
  Env = Cloudflare.Env,
  Props = {},
> extends WorkerEntrypoint<Env, Props> {
  abstract emit(...args: EmitArgs): void;
}

export function defineGaitEmitter<Env = Cloudflare.Env, Props = {}>(
  fn: (...arts: OnArgs) => MaybePromise<void>,
): Constructor<typeof GaitEmittrtWorkerEntrypoint<Env, Props>> {
  return class extends GaitEmittrtWorkerEntrypoint<Env, Props> {
    emit(...[e, ctx]: EmitArgs): void {
      return this.ctx.waitUntil(
        Promise.try(() =>
          fn(...([e, { ...ctx, timestamp: new Date() }] as OnArgs)),
        ),
      );
    }
  };
}
