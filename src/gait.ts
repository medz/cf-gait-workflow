import { NonRetryableError } from "cloudflare:workflows";
import {
  exports,
  WorkflowEntrypoint,
  type WorkflowStepConfig,
  type WorkflowStepContext,
  type WorkflowStep,
  type WorkflowEvent,
  type WorkflowStepRollbackOptions,
  waitUntil,
} from "cloudflare:workers";
import type {
  Args,
  Defs,
  GaitEmitterWorkerEntrypoint,
  GaitEventOptions,
} from "./events";
import type { Constructor, MaybePromise, Values } from "./utils";

type CreateGaitParams<T> = {
  binding?: string;
  event: WorkflowEvent<T>;
  step: WorkflowStep;
};

type Ctx<T> = {
  event: WorkflowEvent<T>;
  step: WorkflowStep;
  emit: OmitThisParameter<typeof emit>;
};

type SleepParams =
  | number
  | Date
  | { duration: WorkflowSleepDuration }
  | { timestamp: Date | number };

type StepCallback<T extends Rpc.Serializable<T>> = (
  ctx: WorkflowStepContext,
) => Promise<T>;

type GaitStep = {
  <T extends Rpc.Serializable<T>>(
    name: string,
    callback: StepCallback<T>,
    rollbackOptions?: WorkflowStepRollbackOptions<T>,
  ): Promise<T>;
  <T extends Rpc.Serializable<T>>(
    name: string,
    config: WorkflowStepConfig,
    callback: StepCallback<T>,
    rollbackOptions?: WorkflowStepRollbackOptions<T>,
  ): Promise<T>;
};

type Gait = {
  step: GaitStep;
  sleep: OmitThisParameter<typeof sleep>;
  event: OmitThisParameter<typeof event>;
};

export class NonRetryableWithRawError<T> extends NonRetryableError {
  public constructor(
    public readonly raw: T,
    message: string,
    name?: string,
  ) {
    super(message, name);
  }
}

export function createGaitWorkflow<
  T extends Rpc.Serializable<T> | unknown = unknown,
>({
  event: workflowEvent,
  step: workflowStep,
  binding = "GaitEmitter",
}: CreateGaitParams<T>): Gait {
  const emitter: GaitEmitterWorkerEntrypoint =
    binding in exports && (exports as any)[binding];
  if (!emitter) {
    throw new NonRetryableError(
      `Gait emitter binding "${binding}" was not found`,
      "gait:emitter",
    );
  }

  const ctx = {
    event: workflowEvent,
    step: workflowStep,
    emit: emit.bind(emitter),
  } satisfies Ctx<T>;
  return {
    step: step.bind(ctx) as GaitStep,
    sleep: sleep.bind(ctx),
    event: event.bind(ctx),
  };
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
  bindingOrPlan: string | Plan<T>,
  nullablePlan?: Plan<T> | void,
): Constructor<typeof WorkflowEntrypoint<Env, T>> {
  const binding = typeof bindingOrPlan === "string" ? bindingOrPlan : void 0;
  const plan = nullablePlan
    ? nullablePlan
    : typeof bindingOrPlan === "function"
      ? bindingOrPlan
      : void 0;
  if (!plan) {
    throw new Error("defineGaitWorkflowEntrypoint requires a plan function");
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

async function step<This, T extends Rpc.Serializable<T>>(
  this: Ctx<This>,
  name: string,
  callback: StepCallback<T>,
  rollbackOptions?: WorkflowStepRollbackOptions<T>,
): Promise<T>;
async function step<This, T extends Rpc.Serializable<T>>(
  this: Ctx<This>,
  name: string,
  config: WorkflowStepConfig,
  callback: StepCallback<T>,
  rollbackOptions?: WorkflowStepRollbackOptions<T>,
): Promise<T>;
async function step<This, T extends Rpc.Serializable<T>>(
  this: Ctx<This>,
  name: string,
  configOrCallback: WorkflowStepConfig | StepCallback<T>,
  callbackOrRollbackOptions?: StepCallback<T> | WorkflowStepRollbackOptions<T>,
  rollbackOptions?: WorkflowStepRollbackOptions<T>,
): Promise<T> {
  const hasConfig = typeof configOrCallback !== "function";
  const callback = hasConfig
    ? (callbackOrRollbackOptions as StepCallback<T>)
    : configOrCallback;
  const options = hasConfig
    ? rollbackOptions
    : (callbackOrRollbackOptions as WorkflowStepRollbackOptions<T> | undefined);

  const run: StepCallback<T> = async (ctx) => {
    try {
      this.emit("step:start", ctx);
      return await callback(ctx).then((output) => {
        this.emit("step:complete", { ...ctx, output });
        return output;
      });
    } catch (error) {
      this.emit("step:error", { error, ...ctx });
      throw error;
    }
  };

  if (hasConfig) {
    return this.step.do(name, configOrCallback, run, options);
  }

  return this.step.do(name, run, options);
}

async function sleep<This>(
  this: Ctx<This>,
  name: string,
  params: SleepParams,
): Promise<void> {
  const step = { name, count: 1 };

  try {
    this.emit("sleep:start", { params, step });

    if (params instanceof Date) {
      return await this.step
        .sleepUntil(name, params)
        .then(() => this.emit("sleep:complete", { step }));
    } else if (typeof params === "number") {
      return await this.step
        .sleep(name, params)
        .then(() => this.emit("sleep:complete", { step }));
    } else if ("duration" in params) {
      return await this.step
        .sleep(name, params.duration)
        .then(() => this.emit("sleep:complete", { step }));
    } else {
      return await this.step
        .sleepUntil(name, params.timestamp)
        .then(() => this.emit("sleep:complete", { step }));
    }
  } catch (error) {
    this.emit("sleep:error", { step, error });
    throw new NonRetryableWithRawError(
      error,
      `Gait sleep step "${name}" failed`,
      "gait:sleep",
    );
  }
}

async function event<This, T extends Rpc.Serializable<T>>(
  this: Ctx<This>,
  name: string,
  options: GaitEventOptions,
) {
  return this.step.do<any>(
    "gait:event",
    { timeout: options.timeout },
    async (ctx) => {
      const step = { name, count: ctx.step.count };
      this.emit("event:start", { step, options });

      try {
        return await this.step.waitForEvent<T>(name, options).then((output) => {
          this.emit("event:complete", { step, output });
          return output;
        });
      } catch (error) {
        this.emit("event:error", { step, error });
        throw new NonRetryableWithRawError(
          error,
          `Gait event step "${name}" failed`,
          "gait:event",
        );
      }
    },
  );
}

type OmitArgs = Values<{
  [K in keyof Defs]: [e: K, ctx: Omit<Defs[K], "timestamp">];
}>;

function emit(
  this: Pick<GaitEmitterWorkerEntrypoint, "emit">,
  ...[e, ctx]: OmitArgs
) {
  return waitUntil(
    Promise.resolve(
      this.emit(...([e, { ...ctx, timestamp: Date.now() }] as Args)),
    ),
  );
}
