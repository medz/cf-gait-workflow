import {
  createGaitWorkflow,
  defineGaitEmitter,
  defineGaitWorkflowEntrypoint,
} from "../src";
import type { Args } from "../src/events";

export type RecordedEvent = {
  event: Args[0];
  ctx: Args[1];
};

const events: RecordedEvent[] = [];

export function clearEvents(): void {
  events.length = 0;
}

export function getEvents(): RecordedEvent[] {
  return structuredClone(events);
}

export const GaitEmitter = defineGaitEmitter((event, ctx) => {
  events.push({ event, ctx } as RecordedEvent);
});

export const CustomEmitter = defineGaitEmitter((event, ctx) => {
  events.push({ event, ctx } as RecordedEvent);
});

export const StepWorkflow = defineGaitWorkflowEntrypoint(
  async (event, gait) => {
    const mode = (event.payload as { mode?: string }).mode;

    if (mode === "missing-emitter") {
      createGaitWorkflow({
        event,
        step: {
          do: async () => undefined,
        } as never,
        binding: "MissingEmitter",
      });
    }

    const first = await gait.step("plain step", async (ctx) => ({
      attempt: ctx.attempt,
      name: ctx.step.name,
    }));

    const configured = await gait.step(
      "configured step",
      { retries: { limit: 2, delay: 1 } },
      async () => {
        if (mode === "step-error") {
          throw new Error("step failed");
        }

        return { ok: true };
      },
    );

    return { first, configured };
  },
);

export const CustomBindingWorkflow = defineGaitWorkflowEntrypoint(
  "CustomEmitter",
  async (_event, gait) => {
    return await gait.step("custom binding step", async () => "custom");
  },
);

export const SleepWorkflow = defineGaitWorkflowEntrypoint(
  async (event, gait) => {
    const mode = (event.payload as { mode?: string }).mode;

    if (mode === "number") {
      await gait.sleep("number sleep", 10);
    } else if (mode === "duration") {
      await gait.sleep("duration sleep", { duration: "1 second" });
    } else if (mode === "date") {
      await gait.sleep("date sleep", new Date(Date.now() + 1_000));
    } else {
      await gait.sleep("timestamp sleep", { timestamp: Date.now() + 1_000 });
    }

    return { slept: mode };
  },
);

export const EventWorkflow = defineGaitWorkflowEntrypoint(
  async (_event, gait) => {
    const result = await gait.event("approval", {
      type: "approval",
      timeout: "1 minute",
    });

    return {
      payload: result.payload,
      type: result.type,
    };
  },
);

export const EventTimeoutWorkflow = defineGaitWorkflowEntrypoint(
  async (_event, gait) => {
    await gait.event("approval timeout", {
      type: "approval-timeout",
      timeout: "1 minute",
    });
  },
);

export default {
  fetch() {
    return Response.json({ ok: true });
  },
};
