# cf-gait-workflow

Semantic tracing helpers for Cloudflare Workflows.

`cf-gait-workflow` keeps Cloudflare Workflows as the source of execution
truth while adding typed lifecycle events around workflow steps, sleeps, and
event waits. Use it when you want workflow history to stay native, but also
need structured telemetry for logs, traces, metrics, or custom observers.

## Install

```sh
bun add cf-gait-workflow
```

```sh
npm install cf-gait-workflow
```

## Quick Start

```ts
import {
  defineGaitEmitter,
  defineGaitWorkflowEntrypoint,
} from "cf-gait-workflow";

export const GaitEmitter = defineGaitEmitter((event, ctx) => {
  console.log(event, ctx);
});

export const Workflow = defineGaitWorkflowEntrypoint(async (event, gait) => {
  const result = await gait.step("fetch data", async (ctx) => {
    return {
      attempt: ctx.attempt,
      input: event.payload,
    };
  });

  await gait.sleep("cooldown", { duration: "1 minute" });

  const approval = await gait.event("approval", {
    type: "approval",
    timeout: "1 hour",
  });

  return {
    result,
    approval: approval.payload,
  };
});
```

`defineGaitWorkflowEntrypoint` creates a normal Cloudflare
`WorkflowEntrypoint`. The only difference is that your `run` plan receives a
`gait` helper next to the original workflow event.

## Emitter

Gait events are delivered to an exported Worker entrypoint. By default the
workflow looks for an export named `GaitEmitter`.

```ts
import { defineGaitEmitter } from "cf-gait-workflow";

export const GaitEmitter = defineGaitEmitter((event, ctx) => {
  console.log(JSON.stringify({ event, ctx }));
});
```

The callback is typed as the full gait event union. Every emitted context has a
numeric `timestamp` field. When events are emitted by `gait.step`,
`gait.sleep`, or `gait.event`, the timestamp is added automatically with
`Date.now()`.

If you want a different export name, pass it to
`defineGaitWorkflowEntrypoint`:

```ts
export const Events = defineGaitEmitter((event, ctx) => {
  console.log(event, ctx);
});

export const Workflow = defineGaitWorkflowEntrypoint(
  "Events",
  async (_event, gait) => {
    return await gait.step("work", async () => "ok");
  },
);
```

## Gait Helper

The helper currently exposes:

- `gait.step(name, callback, rollbackOptions?)`
- `gait.step(name, config, callback, rollbackOptions?)`
- `gait.sleep(name, params)`
- `gait.event(name, options)`

### `gait.step`

`gait.step` mirrors Cloudflare `step.do`. It preserves the original step name,
config, retry behavior, callback context, and rollback options.

```ts
await gait.step("plain step", async (ctx) => {
  return {
    name: ctx.step.name,
    count: ctx.step.count,
    attempt: ctx.attempt,
  };
});

await gait.step(
  "configured step",
  { retries: { limit: 3, delay: 1_000 } },
  async () => {
    return "done";
  },
);
```

Events:

- `step:start`: emitted before your callback runs.
- `step:complete`: emitted with `output` after the callback resolves.
- `step:error`: emitted with `error` before the original error is rethrown.

Step failures are not wrapped. The original error is rethrown so native
Workflow retry behavior is preserved.

### `gait.sleep`

`gait.sleep` delegates to Cloudflare `step.sleep` or `step.sleepUntil`,
depending on the input.

```ts
await gait.sleep("seconds", 30);
await gait.sleep("duration", { duration: "5 minutes" });
await gait.sleep("date", new Date(Date.now() + 60_000));
await gait.sleep("timestamp", { timestamp: Date.now() + 60_000 });
```

Events:

- `sleep:start`: emitted with the original `params`.
- `sleep:complete`: emitted when the sleep resolves.
- `sleep:error`: emitted with `error` if the sleep fails.

Sleep failures are wrapped in `NonRetryableWithRawError`. The wrapper exposes
the original error through `.raw`.

### `gait.event`

`gait.event` waits for a Cloudflare Workflow event and emits lifecycle telemetry
around that wait.

```ts
const approval = await gait.event("approval", {
  type: "approval",
  timeout: "1 hour",
});

console.log(approval.payload);
```

The actual wait still uses `step.waitForEvent(name, options)`. Gait also wraps
the wait in a durable step named `gait:event/<name>` so `event:start`,
`event:complete`, and `event:error` stay inside a Workflow step boundary during
replay or restart.

The emitted `step` object keeps the logical event name:

```ts
{
  step: { name: "approval", count: 1 }
}
```

The count is scoped by logical event name because the wrapper step name is also
derived from that name. For example, `approval`, then `review`, then `approval`
emits counts `1`, `1`, and `2`.

Event wait failures are wrapped in `NonRetryableWithRawError`. The wrapper
exposes the original error through `.raw`.

## Event Types

`defineGaitEmitter` infers the event name and context union for its callback,
so most applications do not need manual annotations.

Current event names:

```ts
type EventName =
  | "step:start"
  | "step:complete"
  | "step:error"
  | "sleep:start"
  | "sleep:complete"
  | "sleep:error"
  | "event:start"
  | "event:complete"
  | "event:error";
```

All contexts include:

```ts
{
  step: { name: string; count: number };
  timestamp: number;
}
```

`step:*` events include the native Cloudflare `WorkflowStepContext` fields.
`sleep:start` includes `params`. `event:start` includes `options`.
`*:complete` events include `output` where an output exists. `*:error` events
include `error`.

## Manual Integration

If you already have a `WorkflowEntrypoint` class, use `createGaitWorkflow`
inside `run`:

```ts
import { WorkflowEntrypoint } from "cloudflare:workers";
import { createGaitWorkflow } from "cf-gait-workflow";

export class Workflow extends WorkflowEntrypoint<Env, Params> {
  override async run(event, step) {
    const gait = createGaitWorkflow({ event, step });

    return await gait.step("work", async () => {
      return "ok";
    });
  }
}
```

Pass `binding` when the emitter export is not `GaitEmitter`:

```ts
const gait = createGaitWorkflow({
  event,
  step,
  binding: "Events",
});
```

If the emitter export cannot be found, gait throws a Cloudflare
`NonRetryableError`.

## Cloudflare Setup

Export the emitter and workflow from your Worker:

```ts
export const GaitEmitter = defineGaitEmitter((event, ctx) => {
  console.log(event, ctx);
});

export const Workflow = defineGaitWorkflowEntrypoint(async (_event, gait) => {
  await gait.step("work", async () => "ok");
});
```

Then bind the workflow in Wrangler as you would for any Cloudflare Workflow.
See [`playground/worker.ts`](./playground/worker.ts) and
[`playground/wrangler.jsonc`](./playground/wrangler.jsonc) for a runnable
example.

## Development

```sh
bun install
bun run test
bun run build
```

Run the playground Worker:

```sh
cd playground
bun run dev
```

## License

MIT. See [LICENSE](./LICENSE).
