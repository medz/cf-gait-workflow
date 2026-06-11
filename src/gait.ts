import { NonRetryableError } from "cloudflare:workflows";
import {
  exports,
  WorkflowEntrypoint,
  WorkflowStep,
  type WorkflowEvent,
} from "cloudflare:workers";
import type { Binding, GaitEmittrtWorkerEntrypoint } from "./events";
import type { Constructor } from "./utils";

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

export function createGait<T extends Rpc.Serializable<T> | unknown = unknown>({
  event,
  step,
  binding = "GAIT_EMITTER",
}: CreateGaitParams<T>): Gait {
  const emitter: GaitEmittrtWorkerEntrypoint =
    binding in exports && (exports as any)[binding];
  if (!emitter) {
    throw new NonRetryableError("// TODO", "gait:emitter");
  }

  const ctx = {
    event,
    step,
    emit: emitter.emit.bind(emitter),
  } satisfies Ctx<T>;
  return { sleep: sleep.bind(ctx) };
}

type Plan<T> = (
  event: Readonly<WorkflowEvent<T>>,
  gait: Gait,
) => Promise<unknown>;

export function defineGaitWorkflowEntrypoint<
  Env = Cloudflare.Env,
  T extends Rpc.Serializable<T> | unknown = unknown,
>(
  binding: Binding | undefined,
  plan: Plan<T>,
): Constructor<typeof WorkflowEntrypoint<Env, T>> {
  return class extends WorkflowEntrypoint<Env, T> {
    override run(
      event: Readonly<WorkflowEvent<T>>,
      step: WorkflowStep,
    ): Promise<unknown> {
      return plan(event, createGait({ event, step, binding }));
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
      if (params instanceof Date) return this.step.sleepUntil(name, params);
      if (typeof params === "number") return this.step.sleep(name, params);
      if ("duration" in params) return this.step.sleep(name, params.duration);
      return this.step.sleepUntil(name, params.timestamp);
    } catch (error) {
      this.emit("sleep:error", { error, ...ctx });
      throw new NonRetryableError("//TODO", "gait:sleep");
    } finally {
      this.emit("sleep:complete", ctx);
    }
  });
}
