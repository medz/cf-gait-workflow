# cf-gait-workflow

Lightweight semantic gait tracing helpers for Cloudflare Workflows.

`cf-gait-workflow` wraps selected Cloudflare Workflow operations and emits
typed lifecycle events from a Worker entrypoint. It is useful when you want
workflow steps to keep their normal Cloudflare behavior while also publishing
structured telemetry for logging, diagnostics, or custom observers.

## Features

- Define a typed gait event emitter with `defineGaitEmitter`.
- Define a Workflow entrypoint with `defineGaitWorkflowEntrypoint`.
- Create a gait helper inside an existing workflow with `createGaitWorkflow`.
- Trace Workflow steps with `step:start`, `step:error`, and `step:complete`
  events.
- Trace sleep operations with `sleep:start`, `sleep:error`, and
  `sleep:complete` events.
- Trace Workflow event waits with `event:start`, `event:error`, and
  `event:complete` events.
- Keep Cloudflare-specific imports external in the published ESM build.

## Install

```sh
bun add cf-gait-workflow
```

or with npm:

```sh
npm install cf-gait-workflow
```

## Usage

```ts
import {
  defineGaitEmitter,
  defineGaitWorkflowEntrypoint,
} from "cf-gait-workflow";

export const GaitEmitter = defineGaitEmitter((event, ctx) => {
  console.log(event, ctx);
});

export const Workflow = defineGaitWorkflowEntrypoint(async (event, gait) => {
  const result = await gait.step("Fetch data", async () => {
    return { ok: true };
  });

  console.log(result);
  await gait.sleep("Wait before continuing", 60);
});
```

The workflow wrapper creates a gait helper for each Workflow run and passes it
to your plan function. The helper exposes `step`, which delegates to Cloudflare
Workflows `step.do`, and `sleep`, which delegates to `step.sleep` or
`step.sleepUntil`. Both helpers emit lifecycle events through the configured
gait emitter.

### Step inputs

`gait.step` mirrors Cloudflare Workflows `step.do`:

```ts
await gait.step("plain step", async (ctx) => {
  console.log(ctx.attempt);
  return { ok: true };
});

await gait.step(
  "configured step",
  { retries: { limit: 3, delay: "10 seconds" } },
  async () => {
    return "done";
  },
);
```

### Event inputs

`gait.event` delegates to Cloudflare Workflows `step.waitForEvent`:

```ts
const approval = await gait.event("wait for approval", {
  type: "approval",
  timeout: "1 hour",
});

console.log(approval.payload);
```

### Sleep inputs

```ts
await gait.sleep("short delay", 30);
await gait.sleep("duration delay", { duration: "5 minutes" });
await gait.sleep("until date", new Date(Date.now() + 60_000));
await gait.sleep("until timestamp", { timestamp: Date.now() + 60_000 });
```

### Custom emitter export

By default, `defineGaitWorkflowEntrypoint` looks for an exported entrypoint named
`GaitEmitter`. If your emitter uses a different export name, pass it explicitly:

```ts
export const Events = defineGaitEmitter((event, ctx) => {
  console.log(event, ctx);
});

export const Workflow = defineGaitWorkflowEntrypoint(
  "Events",
  async (event, gait) => {
    await gait.sleep("Delay", 10);
  },
);
```

## Cloudflare Worker example

See [`playground/worker.ts`](./playground/worker.ts) and
[`playground/wrangler.jsonc`](./playground/wrangler.jsonc) for a minimal Worker
and Workflow configuration.

## Development

Install dependencies:

```sh
bun install
```

Build the package:

```sh
bun run build
```

Run the playground Worker:

```sh
cd playground
bun run dev
```

## License

MIT. See [LICENSE](./LICENSE).
