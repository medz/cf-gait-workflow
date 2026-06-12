import {
  env,
  withExports,
  type WorkflowEvent,
  type WorkflowStep,
  type WorkflowStepConfig,
  type WorkflowStepContext,
} from "cloudflare:workers";
import { introspectWorkflowInstance } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import {
  createGaitWorkflow,
  defineGaitEmitter,
  NonRetryableWithRawError,
} from "../src";
import type { Args, GaitEmitterWorkerEntrypoint } from "../src/events";

type TestEnv = {
  STEP_WORKFLOW: Workflow<{ mode?: string }>;
  SLEEP_WORKFLOW: Workflow<{ mode: "number" | "duration" | "date" | "timestamp" }>;
  EVENT_WORKFLOW: Workflow;
};

type Emitted = Args;

const testEnv = env as TestEnv;

const workflowEvent = {
  payload: {},
  timestamp: new Date(0),
  instanceId: "instance",
  workflowName: "workflow",
} satisfies WorkflowEvent<unknown>;

const defaultConfig = {
  retries: { limit: 5, delay: 1_000, backoff: "exponential" as const },
  timeout: "10 minutes" as WorkflowSleepDuration,
};

function createWorkflowStep(overrides: Partial<WorkflowStep> = {}) {
  let count = 0;
  const step: WorkflowStep = {
    do: vi.fn(async (name: string, configOrCallback: unknown, callbackOrRollback?: unknown) => {
      const hasConfig = typeof configOrCallback !== "function";
      const config = hasConfig ? configOrCallback : defaultConfig;
      const callback = hasConfig ? callbackOrRollback : configOrCallback;

      return await (callback as (ctx: WorkflowStepContext) => Promise<unknown>)({
        step: { name, count: ++count },
        attempt: 1,
        config: config as WorkflowStepConfig,
      });
    }),
    sleep: vi.fn(async () => undefined),
    sleepUntil: vi.fn(async () => undefined),
    waitForEvent: vi.fn(async () => ({
      payload: { approved: true },
      timestamp: new Date(1),
      type: "approval",
    })),
    ...overrides,
  } as never;

  return step;
}

function withGait<T>(
  fn: (params: { events: Emitted[]; step: WorkflowStep }) => T,
  step = createWorkflowStep(),
) {
  const events: Emitted[] = [];
  const emitter: Pick<GaitEmitterWorkerEntrypoint, "emit"> = {
    emit: (...args) => {
      events.push(args);
    },
  };

  return withExports({ GaitEmitter: emitter, CustomEmitter: emitter }, () =>
    fn({ events, step }),
  ) as T;
}

function createGait(step: WorkflowStep) {
  return createGaitWorkflow({
    event: workflowEvent,
    step,
  });
}

function eventNames(events: Emitted[]) {
  return events.map(([event]) => event);
}

function expectTimestamp(ctx: Args[1]) {
  expect(ctx.timestamp).toEqual(expect.any(Number));
  expect(ctx.timestamp).toBeGreaterThan(0);
}

describe("defineGaitEmitter", () => {
  it("passes through caller-provided timestamp without rewriting it", async () => {
    const calls: Emitted[] = [];
    const Emitter = defineGaitEmitter((...args) => {
      calls.push(args);
    });
    const waitUntil = vi.fn((promise: Promise<unknown>) => promise);
    const emitter = new Emitter({ waitUntil } as never, {} as never);

    emitter.emit("step:start", {
      step: { name: "x", count: 1 },
      attempt: 1,
      config: defaultConfig,
      timestamp: 123,
    });

    await waitUntil.mock.results[0].value;

    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe("step:start");
    expect(calls[0][1].timestamp).toBe(123);
  });
});

describe("createGaitWorkflow", () => {
  it("throws a clear non-retryable error when the emitter binding is missing", () => {
    withExports({}, () => {
      expect(() =>
        createGaitWorkflow({
          event: workflowEvent,
          step: createWorkflowStep(),
          binding: "MissingEmitter",
        }),
      ).toThrow('Gait emitter binding "MissingEmitter" was not found');
    });
  });

  it("uses an explicit emitter binding", async () => {
    await withGait(async ({ events, step }) => {
      const gait = createGaitWorkflow({
        event: workflowEvent,
        step,
        binding: "CustomEmitter",
      });

      await expect(gait.step("custom step", async () => "ok")).resolves.toBe("ok");

      expect(eventNames(events)).toEqual(["step:start", "step:complete"]);
      expect(events[0][1].step.name).toBe("custom step");
      expectTimestamp(events[0][1]);
    });
  });
});

describe("gait.step", () => {
  it("delegates to step.do and emits output on completion", async () => {
    await withGait(async ({ events, step }) => {
      const gait = createGait(step);

      await expect(
        gait.step("plain step", async (ctx) => ({
          attempt: ctx.attempt,
          name: ctx.step.name,
        })),
      ).resolves.toEqual({ attempt: 1, name: "plain step" });

      expect(step.do).toHaveBeenCalledWith(
        "plain step",
        expect.any(Function),
        undefined,
      );
      expect(eventNames(events)).toEqual(["step:start", "step:complete"]);
      expectTimestamp(events[0][1]);
      expect(events[1][1]).toMatchObject({
        step: { name: "plain step" },
        output: { attempt: 1, name: "plain step" },
      });
    });
  });

  it("preserves config and rollback options when delegating to step.do", async () => {
    await withGait(async ({ events, step }) => {
      const gait = createGait(step);
      const config = { retries: { limit: 2, delay: 1 } };
      const rollbackOptions = {
        rollback: vi.fn(async () => undefined),
      };

      await expect(
        gait.step("configured step", config, async () => "done", rollbackOptions),
      ).resolves.toBe("done");

      expect(step.do).toHaveBeenCalledWith(
        "configured step",
        config,
        expect.any(Function),
        rollbackOptions,
      );
      expect((events[0][1] as WorkflowStepContext).config).toBe(config);
      expect(events[1][1]).toMatchObject({ output: "done" });
    });
  });

  it("emits step:error and rethrows callback failures", async () => {
    const raw = new Error("step failed");

    await withGait(async ({ events, step }) => {
      const gait = createGait(step);

      await expect(
        gait.step("failing step", async () => {
          throw raw;
        }),
      ).rejects.toBe(raw);

      expect(eventNames(events)).toEqual(["step:start", "step:error"]);
      expect(events[1][1]).toMatchObject({
        step: { name: "failing step" },
        error: raw,
      });
    });
  });
});

describe("gait.sleep", () => {
  it("delegates number and duration inputs to step.sleep", async () => {
    await withGait(async ({ events, step }) => {
      const gait = createGait(step);

      await gait.sleep("number sleep", 10);
      await gait.sleep("duration sleep", { duration: "1 second" });

      expect(step.sleep).toHaveBeenNthCalledWith(1, "number sleep", 10);
      expect(step.sleep).toHaveBeenNthCalledWith(2, "duration sleep", "1 second");
      expect(eventNames(events)).toEqual([
        "sleep:start",
        "sleep:complete",
        "sleep:start",
        "sleep:complete",
      ]);
      expect(events[0][1]).toMatchObject({ params: 10 });
      expect(events[2][1]).toMatchObject({ params: { duration: "1 second" } });
    });
  });

  it("delegates Date and timestamp inputs to step.sleepUntil", async () => {
    await withGait(async ({ events, step }) => {
      const gait = createGait(step);
      const date = new Date(Date.now() + 1_000);
      const timestamp = Date.now() + 2_000;

      await gait.sleep("date sleep", date);
      await gait.sleep("timestamp sleep", { timestamp });

      expect(step.sleepUntil).toHaveBeenNthCalledWith(1, "date sleep", date);
      expect(step.sleepUntil).toHaveBeenNthCalledWith(
        2,
        "timestamp sleep",
        timestamp,
      );
      expect(eventNames(events)).toEqual([
        "sleep:start",
        "sleep:complete",
        "sleep:start",
        "sleep:complete",
      ]);
      expect(events[0][1]).toMatchObject({ params: date });
      expect(events[2][1]).toMatchObject({ params: { timestamp } });
    });
  });

  it("wraps sleep failures with the raw error", async () => {
    const raw = new Error("sleep failed");
    const step = createWorkflowStep({
      sleep: vi.fn(async () => {
        throw raw;
      }),
    });

    await withGait(async ({ events }) => {
      const gait = createGait(step);

      await expect(gait.sleep("bad sleep", 10)).rejects.toMatchObject({
        raw,
        message: 'Gait sleep step "bad sleep" failed',
      });
      await expect(gait.sleep("bad sleep", 10)).rejects.toBeInstanceOf(
        NonRetryableWithRawError,
      );

      expect(eventNames(events)).toEqual([
        "sleep:start",
        "sleep:error",
        "sleep:start",
        "sleep:error",
      ]);
      expect(events[1][1]).toMatchObject({ error: raw });
    }, step);
  });
});

describe("gait.event", () => {
  it("delegates to waitForEvent and emits output on completion", async () => {
    await withGait(async ({ events, step }) => {
      const gait = createGait(step);

      await expect(
        gait.event("approval", { type: "approval", timeout: "1 minute" }),
      ).resolves.toMatchObject({
        payload: { approved: true },
        type: "approval",
      });

      expect(step.do).toHaveBeenCalledWith(
        "gait:event",
        { timeout: "1 minute" },
        expect.any(Function),
      );
      expect(step.waitForEvent).toHaveBeenCalledWith("approval", {
        type: "approval",
        timeout: "1 minute",
      });
      expect(eventNames(events)).toEqual(["event:start", "event:complete"]);
      expect(events[0][1]).toMatchObject({
        step: { name: "approval", count: 1 },
        options: { type: "approval", timeout: "1 minute" },
      });
      expect(events[1][1]).toMatchObject({
        output: { payload: { approved: true }, type: "approval" },
      });
    });
  });

  it("wraps waitForEvent failures with the raw error", async () => {
    const raw = new Error("event failed");
    const step = createWorkflowStep({
      waitForEvent: vi.fn(async () => {
        throw raw;
      }),
    });

    await withGait(async ({ events }) => {
      const gait = createGait(step);

      await expect(
        gait.event("approval", { type: "approval", timeout: "1 minute" }),
      ).rejects.toMatchObject({
        raw,
        message: 'Gait event step "approval" failed',
      });
      await expect(
        gait.event("approval", { type: "approval", timeout: "1 minute" }),
      ).rejects.toBeInstanceOf(NonRetryableWithRawError);

      expect(eventNames(events)).toEqual([
        "event:start",
        "event:error",
        "event:start",
        "event:error",
      ]);
      expect(events[0][1]).toMatchObject({ step: { count: 1 } });
      expect(events[1][1]).toMatchObject({ error: raw });
      expect(events[2][1]).toMatchObject({ step: { count: 2 } });
    }, step);
  });
});

describe("Cloudflare Workflows integration", () => {
  it("runs a real workflow that uses gait.step", async () => {
    await using instance = await introspectWorkflowInstance(
      testEnv.STEP_WORKFLOW,
      "integration-step",
    );

    await testEnv.STEP_WORKFLOW.create({ id: "integration-step", params: {} });

    await instance.waitForStatus("complete");
    await expect(instance.getOutput()).resolves.toEqual({
      first: { attempt: 1, name: "plain step" },
      configured: { ok: true },
    });
  });

  it("runs a real workflow that uses gait.sleep", async () => {
    await using instance = await introspectWorkflowInstance(
      testEnv.SLEEP_WORKFLOW,
      "integration-sleep",
    );

    await instance.modify(async (m) => {
      await m.disableSleeps();
    });

    await testEnv.SLEEP_WORKFLOW.create({
      id: "integration-sleep",
      params: { mode: "timestamp" },
    });

    await instance.waitForStatus("complete");
    await expect(instance.getOutput()).resolves.toEqual({ slept: "timestamp" });
  });

  it("runs a real workflow that uses gait.event", async () => {
    await using instance = await introspectWorkflowInstance(
      testEnv.EVENT_WORKFLOW,
      "integration-event",
    );

    await instance.modify(async (m) => {
      await m.mockEvent({
        type: "approval",
        payload: { approved: true },
      });
    });

    await testEnv.EVENT_WORKFLOW.create({ id: "integration-event" });

    await instance.waitForStatus("complete");
    await expect(instance.getOutput()).resolves.toEqual({
      payload: { approved: true },
      type: "approval",
    });
  });
});
