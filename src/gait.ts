import { NonRetryableError } from "cloudflare:workflows";
import { exports, WorkflowStep, type WorkflowEvent } from "cloudflare:workers";
import type { Binding, GaitEmittrtWorkerEntrypoint } from "./events";

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
    throw new NonRetryableError("// TODO", "gait:init");
  }

  const ctx = {
    event,
    step,
    emit: emitter.emit.bind(emitter),
  } satisfies Ctx<T>;
  return { sleep: sleep.bind(ctx) };
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
    this.emit("sleep:start", { params, ...ctx });
    try {
      if (params instanceof Date) return this.step.sleepUntil(name, params);
      if (typeof params === "number") return this.step.sleep(name, params);
      if ("duration" in params) return this.step.sleep(name, params.duration);
      return this.step.sleepUntil(name, params.timestamp);
    } catch (error) {
      this.emit("sleep:error", { error, ...ctx });
      throw error;
    } finally {
      this.emit("sleep:complete", ctx);
    }
  });
}
