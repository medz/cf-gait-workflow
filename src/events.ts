import { WorkerEntrypoint, type WorkflowStepContext } from "cloudflare:workers";
import type {
  Constructor,
  MaybePromise,
  Payload,
  PickByValue,
  Values,
} from "./utils";

type Defs = {
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

type Entrypoints = PickByValue<
  Cloudflare.MainModule,
  Constructor<typeof GaitEmittrtWorkerEntrypoint<any, any>>
>;

export type Binding = keyof Entrypoints extends never
  ? string
  : keyof Entrypoints;

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
