import { NonRetryableError } from "cloudflare:workflows";
import {
  exports,
  WorkflowEntrypoint,
  type WorkflowStep,
  type WorkflowEvent,
} from "cloudflare:workers";
import type { Binding, GaitEmittrtWorkerEntrypoint } from "./events";
import type { Constructor, MaybePromise } from "./utils";

type CreateGaitParams<T> = {
  binding?: Binding;
  event: WorkflowEvent<T>;
  step: WorkflowStep;
};

type Gait = {
  sleep: OmitThisParameter<typeof sleep>;
};

type Ctx<T> = {
  event: WorkflowEvent<T>;
  step: WorkflowStep;
  emit: InstanceType<typeof GaitEmittrtWorkerEntrypoint>["emit"];
};

export function createGaitWorkflow<
  T extends Rpc.Serializable<T> | unknown = unknown,
>({ event, step, binding = "GaitEmitter" }: CreateGaitParams<T>): Gait {
  const emitter: GaitEmittrtWorkerEntrypoint =
    binding in exports && (exports as any)[binding];
  if (!emitter) {
    throw new NonRetryableError("// TODO", "gait:emitter");
  }

  const ctx = {
    event,
    step,
    emit: emitter.emit,
  } satisfies Ctx<T>;
  return { sleep: sleep.bind(ctx) };
}

type Plan<T> = (
  event: Readonly<WorkflowEvent<T>>,
  gait: Gait,
) => MaybePromise<unknown>;

export function defineGaitWorkflowEntrypoint<
  Env = Cloudflare.Env,
  T extends Rpc.Serializable<T> | unknown = unknown,
>(plan: Plan<T>): Constructor<typeof WorkflowEntrypoint<Env, T>>;
export function defineGaitWorkflowEntrypoint<
  Env = Cloudflare.Env,
  T extends Rpc.Serializable<T> | unknown = unknown,
>(
  binding: string,
  plan: Plan<T>,
): Constructor<typeof WorkflowEntrypoint<Env, T>>;
export function defineGaitWorkflowEntrypoint<
  Env = Cloudflare.Env,
  T extends Rpc.Serializable<T> | unknown = unknown,
>(
  bindingOrPlan: Binding | Plan<T>,
  nullablePlan?: Plan<T> | void,
): Constructor<typeof WorkflowEntrypoint<Env, T>> {
  const binding = typeof bindingOrPlan === "string" ? bindingOrPlan : void 0;
  const plan = nullablePlan
    ? nullablePlan
    : typeof bindingOrPlan === "function"
      ? bindingOrPlan
      : void 0;
  if (!plan) {
    throw new Error("// TODO");
  }

  return class extends WorkflowEntrypoint<Env, T> {
    override async run(
      event: Readonly<WorkflowEvent<T>>,
      step: WorkflowStep,
    ): Promise<unknown> {
      return await plan(event, createGaitWorkflow({ event, step, binding }));
    }
  };
}

async function sleep<This>(
  this: Ctx<This>,
  name: string,
  params:
    | number
    | Date
    | { duration: WorkflowSleepDuration }
    | { timestamp: Date | number },
): Promise<void> {
  await this.step.do(`gait:sleep`, async (ctx) => {
    try {
      this.emit("sleep:start", { params, ...ctx });

      if (params instanceof Date) {
        return await this.step.sleepUntil(name, params);
      } else if (typeof params === "number") {
        return await this.step.sleep(name, params);
      } else if ("duration" in params) {
        return await this.step.sleep(name, params.duration);
      } else {
        return await this.step.sleepUntil(name, params.timestamp);
      }
    } catch (error) {
      this.emit("sleep:error", { error, ...ctx });
      throw new NonRetryableError("//TODO", "gait:sleep");
    } finally {
      this.emit("sleep:complete", ctx);
    }
  });
}
